import axios from 'axios';
import crypto from 'crypto';
import Ticket from '../model/Ticket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';

// PhonePe Config - Hardcoded
const MERCHANT_ID = "SU2512051700428638464582";
const SALT_KEY = "b2dc0e25-ad2d-4bd4-86a2-c6a64730ebba";
const SALT_INDEX = "1";
const HOST_URL = "https://api.phonepe.com/apis/pg";
const BACKEND_URL = "https://startupmelabackend.vercel.app";
const FRONTEND_URL = "https://startupmela.com";

// Validate environment variables
if (!MERCHANT_ID || !SALT_KEY || !SALT_INDEX || !HOST_URL) {
  console.error('❌ Missing PhonePe credentials in environment variables');
}

// 1. Create Payment Order
export const createOrder = async (req, res) => {
  let merchantTransactionId = null; // Define outside try block for cleanup access

  try {
    const { name, email, phone, passType, amount, quantity } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !passType || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate phone format (Indian)
    const phoneRegex = /^[6-9]\d{9}$/;
    const cleanPhone = phone.replace(/[\s+\-()]/g, '');
    if (!phoneRegex.test(cleanPhone.slice(-10))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number'
      });
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Check for environment variables
    if (!MERCHANT_ID || !SALT_KEY || !SALT_INDEX || !HOST_URL) {
      console.error('PhonePe credentials not configured');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    // Generate unique Transaction ID with better randomness
    merchantTransactionId = `MT${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Check if order already exists
    const existingOrder = await Ticket.findOne({ orderId: merchantTransactionId });
    if (existingOrder) {
      return res.status(409).json({
        success: false,
        message: 'Order ID conflict, please try again'
      });
    }

    // Save PENDING ticket to Database
    const newTicket = await Ticket.create({
      name,
      email,
      phone,
      passType,
      amount,
      orderId: merchantTransactionId,
      status: "created"
    });

    // PhonePe Payload
    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: "MUID" + Date.now(),
      amount: amount * 100, // Convert to paise
      redirectUrl: `${BACKEND_URL}/api/payment/status/${merchantTransactionId}`,
      redirectMode: "POST",
      callbackUrl: `${BACKEND_URL}/api/payment/status/${merchantTransactionId}`,
      mobileNumber: phone,
      paymentInstrument: { type: "PAY_PAGE" }
    };

    // Encode Payload
    const bufferObj = Buffer.from(JSON.stringify(payload), "utf8");
    const base64EncodedPayload = bufferObj.toString("base64");

    // Calculate X-VERIFY Checksum
    const stringToHash = base64EncodedPayload + "/checkout/v2/pay" + SALT_KEY;
    const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
    const xVerify = sha256 + "###" + SALT_INDEX;

    // Call PhonePe API
    console.log('📞 Calling PhonePe API:', `${HOST_URL}/checkout/v2/pay`);
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    console.log('🔐 X-VERIFY Header:', xVerify);
    console.log('🔑 Merchant ID:', MERCHANT_ID);

    const response = await axios.post(
      `${HOST_URL}/checkout/v2/pay`,
      { request: base64EncodedPayload },
      {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          accept: "application/json",
        },
      }
    );

    console.log('✅ PhonePe Response:', response.data);

    if (response.data.success) {
      // Send Redirect URL to Frontend
      res.json({
        success: true,
        redirectUrl: response.data.data.instrumentResponse.redirectInfo.url,
        orderId: merchantTransactionId
      });
    } else {
      // Delete the pending ticket if PhonePe fails
      await Ticket.findOneAndDelete({ orderId: merchantTransactionId });

      res.status(400).json({
        success: false,
        message: response.data.message || "Payment gateway error"
      });
    }

  } catch (error) {
    console.error("❌ Payment Error:", error.message);
    console.error("📍 Request URL:", `${HOST_URL}/checkout/v2/pay`);
    console.error("📦 Response Status:", error.response?.status);
    console.error("📄 Response Data:", JSON.stringify(error.response?.data, null, 2));
    console.error("🔍 Full Error:", error.response?.statusText);

    // Clean up ticket on error
    try {
      if (merchantTransactionId) {
        await Ticket.findOneAndDelete({ orderId: merchantTransactionId });
        console.log('🗑️ Cleaned up failed ticket:', merchantTransactionId);
      }
    } catch (cleanupError) {
      console.error('Failed to cleanup ticket:', cleanupError.message);
    }

    // Provide specific error messages based on status code
    let errorMessage = "Payment initialization failed";
    let statusCode = 500;

    if (error.response?.status === 404) {
      errorMessage = "Payment gateway endpoint not found. Please check PhonePe configuration.";
      statusCode = 503;
    } else if (error.response?.status === 400) {
      errorMessage = error.response?.data?.message || "Invalid payment request. Please check credentials.";
      statusCode = 400;
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = "Authentication failed. Please verify PhonePe merchant credentials.";
      statusCode = 503;
    } else {
      errorMessage = error.response?.data?.message || error.message || "Payment initialization failed";
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      code: error.response?.data?.code,
      details: process.env.NODE_ENV === 'development' ? error.response?.data : undefined
    });
  }
};

// 2. Check Status (Callback from PhonePe)
export const checkStatus = async (req, res) => {
  const { transactionId } = req.params;

  try {
    // Generate Checksum for Status API
    const stringToHash = `/checkout/v2/order/${MERCHANT_ID}/${transactionId}/status` + SALT_KEY;
    const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
    const xVerify = sha256 + "###" + SALT_INDEX;

    // Call PhonePe Status API
    const response = await axios.get(
      `${HOST_URL}/checkout/v2/order/${MERCHANT_ID}/${transactionId}/status`,
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
        { orderId: transactionId },
        {
          status: "paid",
          paymentId: response.data.data.transactionId,
          signature: response.data.data.merchantTransactionId
        },
        { new: true }
      );

      // Check if ticket was found and updated
      if (!ticket) {
        console.error(`Ticket not found for orderId: ${transactionId}`);
        return res.redirect(`${FRONTEND_URL}/payment-failed?error=ticket_not_found`);
      }

      // Send Email
      try {
        await sendInvoiceEmail(ticket);
      } catch (emailError) {
        console.error("Email sending failed:", emailError.message);
        // Don't fail the payment if email fails
      }

      // Redirect User to Frontend Success Page
      res.redirect(`${FRONTEND_URL}/payment-success?id=${transactionId}`);
    } else {
      // Update DB to Failed
      await Ticket.findOneAndUpdate(
        { orderId: transactionId },
        { status: "failed" }
      );
      res.redirect(`${FRONTEND_URL}/payment-failed`);
    }

  } catch (error) {
    console.error("Status Check Error:", error.message);

    // Try to update ticket status to failed if it exists
    try {
      await Ticket.findOneAndUpdate(
        { orderId: transactionId },
        { status: "failed" }
      );
    } catch (dbError) {
      console.error("Failed to update ticket status:", dbError.message);
    }

    res.redirect(`${FRONTEND_URL}/payment-failed?id=${transactionId}`);
  }
};