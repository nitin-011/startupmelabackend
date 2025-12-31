import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from "pg-sdk-node";
import Ticket from '../model/Ticket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';

// PhonePe Config
const MERCHANT_ID = "SU2512051700428638464582";
const SALT_KEY = "b2dc0e25-ad2d-4bd4-86a2-c6a64730ebba";
const SALT_INDEX = 1;
const BACKEND_URL = "https://startupmelabackend.vercel.app";
const FRONTEND_URL = "https://startupmela.com";

// Initialize PhonePe Client
const phonepeClient = StandardCheckoutClient.getInstance(
  MERCHANT_ID,
  SALT_KEY,
  SALT_INDEX,
  Env.SANDBOX
);

console.log('✅ PhonePe SDK initialized');

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
    if (!MERCHANT_ID || !SALT_KEY || !SALT_INDEX) {
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

    console.log('💳 Creating PhonePe payment with SDK...');
    console.log('   Order ID:', merchantTransactionId);
    console.log('   Amount:', amount);

    // Create payment request using PhonePe SDK
    const redirectUrl = `${BACKEND_URL}/api/payment/status/${merchantTransactionId}`;

    const paymentRequest = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantTransactionId)
      .amount(amount * 100) // Convert to paise
      .redirectUrl(redirectUrl)
      .build();

    // Call PhonePe API using SDK
    const response = await phonepeClient.pay(paymentRequest);

    console.log('✅ PhonePe SDK Response:', response);

    if (response && response.redirectUrl) {
      // Send Redirect URL to Frontend
      res.json({
        success: true,
        redirectUrl: response.redirectUrl,
        orderId: merchantTransactionId
      });
    } else {
      // Delete the pending ticket if PhonePe fails
      await Ticket.findOneAndDelete({ orderId: merchantTransactionId });

      res.status(400).json({
        success: false,
        message: "Payment gateway error"
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
    console.log('🔍 Checking payment status using SDK...');
    console.log('   Transaction ID:', transactionId);

    // Call PhonePe Status API using SDK
    const response = await phonepeClient.getOrderStatus(transactionId);

    console.log('📊 Status Response:', response);

    if (response && response.state === "COMPLETED") {
      // Update Database
      const ticket = await Ticket.findOneAndUpdate(
        { orderId: transactionId },
        {
          status: "paid",
          paymentId: response.transactionId || transactionId,
          signature: response.merchantOrderId || transactionId
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