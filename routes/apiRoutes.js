import express from "express";
import { submitVolunteer } from "../controller/volunteerController..js";
import { submitInquiry } from "../controller/contactController.js";
import { createOrder, verifyPayment } from "../controller/paymentController.js";

const router = express.Router();

// Work With Us Route (POST /api/volunteer)
router.post("/volunteer", submitVolunteer);

// Contact Route (POST /api/contact)
router.post("/contact", submitInquiry);

// Payment Routes
router.post("/payment/create", createOrder);
router.post("/payment/verify", verifyPayment);

export default router;
