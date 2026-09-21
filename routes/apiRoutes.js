import express from "express";
import { submitVolunteer } from "../controller/volunteerController..js";
import { submitInquiry } from "../controller/contactController.js";
import {
  createOrder,
  checkStatus,
  createPrivateFreePassOrder,
  handlePhonePeWebhook,
  reconcilePendingOrders,
} from "../controller/paymentController.js";
import { createTestOrder } from "../controller/testPaymentController.js";
import { sendTestEmail } from "../controller/testEmailController.js";

const router = express.Router();

// Work With Us Route (POST /api/volunteer)
router.post("/volunteer", submitVolunteer);

// Contact Route (POST /api/contact)
router.post("/contact", submitInquiry);

// Payment Routes
router.post("/payment/create", createOrder);
router.get("/payment/status/:transactionId", checkStatus);
router.post("/payment/private-pass/free", createPrivateFreePassOrder);

// PhonePe server-to-server callback. Confirms orders without depending on the
// customer returning to the site. Auth is the signed `authorization` header,
// verified in the handler via the SDK.
router.post("/payment/webhook", handlePhonePeWebhook);

// Reconciliation backstop for orders missed by both the redirect and the
// webhook. Scheduled job only — requires CRON_SECRET as a bearer token.
// GET as well as POST because Vercel Cron only issues GET requests.
router.get("/payment/reconcile", reconcilePendingOrders);
router.post("/payment/reconcile", reconcilePendingOrders);

// TEST MODE: Payment route without actual gateway
router.post("/payment/test", createTestOrder);

// DEBUG: Email Test Route
router.post("/debug/email", sendTestEmail);

export default router;
