import Ticket from '../model/Ticket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';
import dotenv from 'dotenv';

dotenv.config();

// Environment check
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DEVELOPMENT = NODE_ENV === 'development';

// Helper function to generate 9-digit verification code
const generateVerificationCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// TEST MODE: Create order and simulate successful payment
export const createTestOrder = async (req, res) => {
    // Only allow in development environment
    if (!IS_DEVELOPMENT) {
        return res.status(403).json({
            success: false,
            message: 'Test payment endpoint is only available in development environment'
        });
    }

    let merchantTransactionId = null;
    const createdTickets = [];

    console.log('\n🧪 === TEST MODE: Payment Request Received ===');
    console.log('📥 Request Body:', JSON.stringify(req.body, null, 2));
    console.log('⏰ Timestamp:', new Date().toISOString());

    try {
        const { attendees, amount, quantity, itemType, passType, passId, stallType, stallId, baseAmount, gstAmount } = req.body;

        // Validate attendees array
        if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Attendees array is required and must contain at least one attendee'
            });
        }

        if (attendees.length > 5) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 5 tickets can be booked at once'
            });
        }

        // Validate quantity matches attendees length
        if (quantity !== attendees.length) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must match number of attendees'
            });
        }

        // Validate each attendee
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^[6-9]\d{9}$/;

        for (let i = 0; i < attendees.length; i++) {
            const attendee = attendees[i];

            // Validate common required fields
            if (!attendee.name || !attendee.email || !attendee.phone) {
                return res.status(400).json({
                    success: false,
                    message: `Attendee ${i + 1}: Missing required fields (name, email, phone)`
                });
            }

            // Validate name length
            if (attendee.name.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: `Attendee ${i + 1}: Name must be at least 2 characters long`
                });
            }

            // Validate email format
            if (!emailRegex.test(attendee.email.trim())) {
                return res.status(400).json({
                    success: false,
                    message: `Attendee ${i + 1}: Invalid email address format`
                });
            }

            // Validate phone format
            const cleanPhone = attendee.phone.replace(/[\s+\-()]/g, '');
            if (!phoneRegex.test(cleanPhone.slice(-10))) {
                return res.status(400).json({
                    success: false,
                    message: `Attendee ${i + 1}: Invalid phone number. Must be a valid 10-digit Indian mobile number starting with 6-9`
                });
            }

            // Type-specific validation
            if (itemType === 'stall') {
                // For stalls: require startupName only
                if (!attendee.startupName || !attendee.startupName.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: `Attendee ${i + 1}: Startup Name is required for stall bookings`
                    });
                }
            } else if (itemType === 'pass') {
                // For passes: require profession (and professionOther if "Others" selected)
                if (!attendee.profession || !attendee.profession.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: `Attendee ${i + 1}: Profession is required for pass bookings`
                    });
                }

                if (attendee.profession === 'Others' && (!attendee.professionOther || !attendee.professionOther.trim())) {
                    return res.status(400).json({
                        success: false,
                        message: `Attendee ${i + 1}: Please specify your profession when selecting "Others"`
                    });
                }
            }
        }

        // Validate type-specific fields
        if (itemType === 'stall' && !stallType) {
            return res.status(400).json({
                success: false,
                message: 'Stall type is required for stall bookings'
            });
        }

        if (itemType === 'pass' && !passType) {
            return res.status(400).json({
                success: false,
                message: 'Pass type is required for pass bookings'
            });
        }

        // Validate amount
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }

        // Generate unique Transaction ID
        merchantTransactionId = `TEST${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

        console.log('💳 Creating tickets for', attendees.length, 'attendee(s)...');
        console.log('   Order ID:', merchantTransactionId);

        // Create separate ticket document for each attendee
        const isGroupBooking = attendees.length > 1;

        for (let i = 0; i < attendees.length; i++) {
            const attendee = attendees[i];
            const verificationCode = generateVerificationCode();

            const ticketData = {
                name: attendee.name,
                email: attendee.email,
                phone: attendee.phone,
                profession: attendee.profession,
                professionOther: attendee.professionOther || null,
                startupName: attendee.startupName || null,
                amount: amount,
                quantity: quantity,
                orderId: merchantTransactionId,
                status: "paid", // TEST MODE: Auto-mark as paid
                paymentId: `TEST_PAY_${merchantTransactionId}`,
                signature: `TEST_SIG_${merchantTransactionId}`,
                itemType: itemType || 'pass',
                verificationCode: verificationCode,
                groupBooking: isGroupBooking,
                primaryContact: i === 0
            };

            // Add type-specific fields
            if (itemType === 'stall') {
                ticketData.stallType = stallType;
                ticketData.stallId = stallId;
                ticketData.baseAmount = baseAmount;
                ticketData.gstAmount = gstAmount;
            } else {
                ticketData.passType = passType;
                ticketData.passId = passId;
            }

            const newTicket = await Ticket.create(ticketData);
            createdTickets.push(newTicket);
            console.log(`   ✓ Created ticket ${i + 1}/${attendees.length} - Code: ${verificationCode}`);
        }

        // Send emails to all attendees
        console.log('📧 Sending confirmation emails...');
        for (const ticket of createdTickets) {
            try {
                await sendInvoiceEmail(ticket);
                console.log(`   ✓ Email sent to ${ticket.email}`);
            } catch (emailError) {
                console.error(`   ✗ Email failed for ${ticket.email}:`, emailError.message);
            }
        }

        // Return success with redirect URL (simulated)
        const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUrl = `${FRONTEND_URL}/checkout?paymentStatus=success&orderId=${merchantTransactionId}${passId ? `&passId=${passId}` : ''}${stallId ? `&stallId=${stallId}` : ''}`;

        console.log('✅ TEST MODE: Payment simulated successfully');
        console.log('📍 Redirect URL:', redirectUrl);

        return res.json({
            success: true,
            redirectUrl: redirectUrl,
            orderId: merchantTransactionId,
            ticketCount: createdTickets.length,
            testMode: true,
            tickets: createdTickets.map(t => ({
                name: t.name,
                email: t.email,
                verificationCode: t.verificationCode
            }))
        });

    } catch (error) {
        console.error("❌ Test Payment Error:", error.message);
        console.error("📍 Error Stack:", error.stack);

        // Clean up tickets on error
        try {
            if (merchantTransactionId) {
                const deletedCount = await Ticket.deleteMany({ orderId: merchantTransactionId });
                console.log(`🗑️ Cleaned up ${deletedCount.deletedCount} failed ticket(s):`, merchantTransactionId);
            }
        } catch (cleanupError) {
            console.error('Failed to cleanup tickets:', cleanupError.message);
        }

        res.status(500).json({
            success: false,
            message: error.message || "Test payment failed",
        });
    }
};
