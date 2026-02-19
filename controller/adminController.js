import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../model/Admin.js';
import Ticket from '../model/Ticket.js';
import Volunteer from '../model/Volunteer.js';
import Inquiry from '../model/Inquiry.js';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Admin Login
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find admin by email
        const admin = await Admin.findOne({ email: email.toLowerCase() });

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if admin is active
        if (!admin.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: admin._id,
                email: admin.email,
                role: admin.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            admin: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
};

// Get Dashboard Statistics
export const getDashboardStats = async (req, res) => {
    try {
        // Total revenue from paid tickets
        const revenueResult = await Ticket.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        // Total attendees (paid passes only)
        const totalAttendees = await Ticket.countDocuments({
            status: 'paid',
            itemType: 'pass'
        });

        // Total stalls booked
        const totalStalls = await Ticket.countDocuments({
            status: 'paid',
            itemType: 'stall'
        });

        // Total tickets sold (all types)
        const totalTickets = await Ticket.countDocuments({ status: 'paid' });

        // Pending inquiries
        const pendingInquiries = await Inquiry.countDocuments();

        // Volunteer applications
        const volunteerApplications = await Volunteer.countDocuments();

        // Checked-in count
        const checkedInCount = await Ticket.countDocuments({
            status: 'paid',
            checkedIn: true
        });

        // Recent activity (last 10 tickets)
        const recentTickets = await Ticket.find({ status: 'paid' })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('name email amount itemType passType stallType createdAt');

        // Revenue by type
        const revenueByType = await Ticket.aggregate([
            { $match: { status: 'paid' } },
            {
                $group: {
                    _id: '$itemType',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // GST collected (from stalls)
        const gstResult = await Ticket.aggregate([
            { $match: { status: 'paid', itemType: 'stall' } },
            { $group: { _id: null, total: { $sum: '$gstAmount' } } }
        ]);
        const totalGST = gstResult.length > 0 ? gstResult[0].total : 0;

        res.json({
            success: true,
            stats: {
                totalRevenue,
                totalAttendees,
                totalStalls,
                totalTickets,
                pendingInquiries,
                volunteerApplications,
                checkedInCount,
                totalGST,
                revenueByType,
                recentActivity: recentTickets
            }
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
};

// Get All Tickets/Orders
export const getTickets = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            itemType,
            search
        } = req.query;

        const query = {};

        if (status) query.status = status;
        if (itemType) query.itemType = itemType;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { orderId: { $regex: search, $options: 'i' } },
                { verificationCode: { $regex: search, $options: 'i' } }
            ];
        }

        const tickets = await Ticket.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Ticket.countDocuments(query);

        res.json({
            success: true,
            tickets,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            totalCount: count
        });

    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tickets',
            error: error.message
        });
    }
};

// Get All Volunteers
export const getVolunteers = async (req, res) => {
    try {
        const { page = 1, limit = 50, role, search } = req.query;

        const query = {};

        if (role) query.role = role;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const volunteers = await Volunteer.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Volunteer.countDocuments(query);

        res.json({
            success: true,
            volunteers,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            totalCount: count
        });

    } catch (error) {
        console.error('Get volunteers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch volunteers',
            error: error.message
        });
    }
};

// Get All Inquiries
export const getInquiries = async (req, res) => {
    try {
        const { page = 1, limit = 50, category, search } = req.query;

        const query = {};

        if (category) query.category = category;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { message: { $regex: search, $options: 'i' } }
            ];
        }

        const inquiries = await Inquiry.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Inquiry.countDocuments(query);

        res.json({
            success: true,
            inquiries,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            totalCount: count
        });

    } catch (error) {
        console.error('Get inquiries error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch inquiries',
            error: error.message
        });
    }
};

// Verify Ticket (Check-in)
export const verifyTicket = async (req, res) => {
    try {
        const { verificationCode } = req.body;

        if (!verificationCode) {
            return res.status(400).json({
                success: false,
                message: 'Verification code is required'
            });
        }

        // Find ticket by verification code
        const ticket = await Ticket.findOne({
            verificationCode: verificationCode.toUpperCase()
        });

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // Check if ticket is paid
        if (ticket.status !== 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Ticket payment not confirmed',
                ticket: {
                    name: ticket.name,
                    status: ticket.status
                }
            });
        }

        // Check if already checked in
        if (ticket.checkedIn) {
            return res.status(400).json({
                success: false,
                message: 'Ticket already used',
                ticket: {
                    name: ticket.name,
                    email: ticket.email,
                    checkedInAt: ticket.checkInTime
                }
            });
        }

        // Mark as checked in
        ticket.checkedIn = true;
        ticket.checkInTime = new Date();
        await ticket.save();

        // Emit real-time event to all admin clients
        if (global.adminNamespace) {
            const checkInData = {
                ticketId: ticket._id,
                verificationCode: ticket.verificationCode,
                name: ticket.name,
                email: ticket.email,
                itemType: ticket.itemType,
                checkInTime: ticket.checkInTime
            };
            global.adminNamespace.emit('ticket:checked-in', checkInData);
            console.log(`📡 Emitted 'ticket:checked-in' event for ticket ${ticket._id} to ${global.adminNamespace.sockets.size} admin client(s)`);
        }

        res.json({
            success: true,
            message: 'Check-in successful',
            ticket: {
                name: ticket.name,
                email: ticket.email,
                phone: ticket.phone,
                profession: ticket.profession,
                itemType: ticket.itemType,
                passType: ticket.passType,
                stallType: ticket.stallType,
                verificationCode: ticket.verificationCode,
                checkInTime: ticket.checkInTime
            }
        });

    } catch (error) {
        console.error('Verify ticket error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: error.message
        });
    }
};

// Create Admin (for seeding/setup only - should be protected or removed in production)
export const createAdmin = async (req, res) => {
    try {
        const { email, password, name, role = 'admin' } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Email, password, and name are required'
            });
        }

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
        if (existingAdmin) {
            return res.status(409).json({
                success: false,
                message: 'Admin with this email already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create admin
        const admin = await Admin.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            name,
            role
        });

        res.status(201).json({
            success: true,
            message: 'Admin created successfully',
            admin: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });

    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create admin',
            error: error.message
        });
    }
};
