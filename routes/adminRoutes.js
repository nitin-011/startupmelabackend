import express from 'express';
import {
    login,
    createAdmin,
    getDashboardStats,
    getTickets,
    getVolunteers,
    getInquiries,
    verifyTicket
} from '../controller/adminController.js';
import { verifyAdmin } from '../middleware/verifyAdmin.js';

const router = express.Router();

/**
 * Guard for the /create route.
 * Requires a secret key in the X-Admin-Create-Secret header
 * that must match the ADMIN_CREATE_SECRET env variable.
 * This prevents anyone without the secret from creating admin accounts.
 */
const createAdminGuard = (req, res, next) => {
    const secret = process.env.ADMIN_CREATE_SECRET;

    if (!secret) {
        // If env var not set at all, block entirely in production
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'Admin creation is disabled. Set ADMIN_CREATE_SECRET in environment variables to enable.'
            });
        }
    }

    const provided = req.headers['x-admin-create-secret'];
    if (!provided || provided !== secret) {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Invalid or missing admin creation secret.'
        });
    }

    next();
};

// Public routes
router.post('/login', login);

// Protected: requires both a valid JWT (existing admin) AND the creation secret
router.post('/create', verifyAdmin, createAdminGuard, createAdmin);

// Protected routes (require valid admin JWT)
router.get('/dashboard', verifyAdmin, getDashboardStats);
router.get('/tickets', verifyAdmin, getTickets);
router.get('/volunteers', verifyAdmin, getVolunteers);
router.get('/inquiries', verifyAdmin, getInquiries);
router.post('/verify', verifyAdmin, verifyTicket);

export default router;
