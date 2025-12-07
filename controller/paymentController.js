import axios from 'axios';
import crypto from 'crypto';
import Ticket from '../model/Ticket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';

// PhonePe Config from .env
const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
const SALT_KEY = process.env.PHONEPE_SALT_KEY;
const SALT_INDEX = process.env.PHONEPE_SALT_INDEX;
const HOST_URL = process.env.PHONEPE_HOST_URL; 

// 1. Create Payment Order
export const createOrder = async (req, res) => {
  try {
    const { name, email, phone, passType, amount, quantity } = req.body;

    // Unique Transaction ID
    const merchantTransactionId = "MT" + Date.now() + Math.floor(Math.random() * 1000);

    // Save PENDING ticket to Database
    const newTicket = await Ticket.create({
      name, email, phone, passType, amount, quantity,
      transactionId: merchantTransactionId,
      paymentStatus: "PENDING"
    });

    // PhonePe Payload
    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: "MUID" + Date.now(),
      amount: amount * 100, // Convert to paise
      redirectUrl: `https://startupmelabackend.vercel.app/api/payment/status/${merchantTransactionId}`,
      redirectMode: "POST",
      callbackUrl: `https://startupmelabackend.vercel.app/api/payment/status/${merchantTransactionId}`,
      mobileNumber: phone,
      paymentInstrument: { type: "PAY_PAGE" }
    };

    // Encode Payload
    const bufferObj = Buffer.from(JSON.stringify(payload), "utf8");
    const base64EncodedPayload = bufferObj.toString("base64");

    // Calculate X-VERIFY Checksum
    const stringToHash = base64EncodedPayload + "/pg/v1/pay" + SALT_KEY;
    const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
    const xVerify = sha256 + "###" + SALT_INDEX;

    // Call PhonePe API
    const response = await axios.post(
      `${HOST_URL}/pg/v1/pay`,
      { request: base64EncodedPayload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          accept: "application/json",
        },
      }
    );

    if (response.data.success) {
      // Send Redirect URL to Frontend
      res.json({ 
        success: true, 
        redirectUrl: response.data.data.instrumentResponse.redirectInfo.url 
      });
    } else {
      res.status(400).json({ success: false, message: "PhonePe Error" });
    }

  } catch (error) {
    console.error("Payment Error:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 2. Check Status (Callback from PhonePe)
export const checkStatus = async (req, res) => {
  const { transactionId } = req.params;

  try {
    // Generate Checksum for Status API
    const stringToHash = `/pg/v1/status/${MERCHANT_ID}/${transactionId}` + SALT_KEY;
    const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
    const xVerify = sha256 + "###" + SALT_INDEX;

    // Call PhonePe Status API
    const response = await axios.get(
      `${HOST_URL}/pg/v1/status/${MERCHANT_ID}/${transactionId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-MERCHANT-ID": MERCHANT_ID,
          "X-VERIFY": xVerify,
        },
      }
    );

    if (response.data.success && response.data.code === "PAYMENT_SUCCESS") {
      // Update Database
      const ticket = await Ticket.findOneAndUpdate(
        { transactionId },
        { paymentStatus: "SUCCESS" },
        { new: true }
      );

      // Send Email
      if (ticket) sendInvoiceEmail(ticket);

      // Redirect User to Frontend Success Page
      res.redirect(`https://startupmela.com/payment-success?id=${transactionId}`);
    } else {
      // Update DB to Failed
      await Ticket.findOneAndUpdate(
        { transactionId },
        { paymentStatus: "FAILED" }
      );
      res.redirect(`https://startupmela.com/payment-failed`);
    }

  } catch (error) {
    console.error("Status Check Error:", error.message);
    res.redirect(`https://startupmela.com/payment-failed`);
  }
};