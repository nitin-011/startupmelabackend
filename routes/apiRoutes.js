import express from "express";
import { submitVolunteer } from "../controller/volunteerController..js";
import { submitInquiry } from "../controller/contactController.js";
import { createOrder, checkStatus } from "../controller/paymentController.js";
import { createTestOrder } from "../controller/testPaymentController.js";

const router = express.Router();

// Work With Us Route (POST /api/volunteer)
router.post("/volunteer", submitVolunteer);

// Contact Route (POST /api/contact)
router.post("/contact", submitInquiry);

// Payment Routes
router.post("/payment/create", createOrder);
router.get("/payment/status/:transactionId", checkStatus);

// TEST MODE: Payment route without actual gateway
router.post("/payment/test", createTestOrder);

// DEBUG: Email Test Route
import { sendTestEmail } from "../controller/testEmailController.js";
router.post("/debug/email", sendTestEmail);

export default router;
