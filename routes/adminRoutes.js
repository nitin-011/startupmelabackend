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

// Public routes
router.post('/login', login);
router.post('/create', createAdmin); // TODO: Remove or protect this in production

// Protected routes (require authentication)
router.get('/dashboard', verifyAdmin, getDashboardStats);
router.get('/tickets', verifyAdmin, getTickets);
router.get('/volunteers', verifyAdmin, getVolunteers);
router.get('/inquiries', verifyAdmin, getInquiries);
router.post('/verify', verifyAdmin, verifyTicket);

export default router;
