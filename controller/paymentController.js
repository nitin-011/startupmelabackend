import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from "pg-sdk-node";
import Ticket from '../model/Ticket.js';
import PendingTicket from '../model/PendingTicket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';
import dotenv from 'dotenv';

dotenv.config();

// Discount Configuration (must match frontend)
const DISCOUNT_CONFIG = {
  active: true,
  percentage: 50, // 50% off
  expiryDate: new Date('2026-01-25T23:59:59+05:30'), // January 25, 2026, 11:59:59 PM IST
};

// Helper function to check if discount is active
const isDiscountActive = () => {
  if (!DISCOUNT_CONFIG.active) return false;
  const now = new Date();
  return now < DISCOUNT_CONFIG.expiryDate;
};

// Pass pricing with discount (must match frontend passes.js)
const PASS_PRICING = {
  1: { originalBase: 50, discountedBase: 25 },
  2: { originalBase: 0, discountedBase: 0 },
  3: { originalBase: 2100, discountedBase: 1050 },
  4: { originalBase: 3500, discountedBase: 1750 },
  5: { originalBase: 9999, discountedBase: 4999.5 },
};

// Environment Configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// PhonePe Config - Select based on environment
const CLIENT_ID = IS_PRODUCTION
  ? process.env.PHONEPE_PROD_MERCHANT_ID
  : process.env.PHONEPE_DEV_MERCHANT_ID;

const CLIENT_SECRET = IS_PRODUCTION
  ? process.env.PHONEPE_PROD_SALT_KEY
  : process.env.PHONEPE_DEV_SALT_KEY;

const CLIENT_VERSION = IS_PRODUCTION
  ? parseInt(process.env.PHONEPE_PROD_SALT_INDEX)
  : parseInt(process.env.PHONEPE_DEV_SALT_INDEX);

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

console.log('🔐 PhonePe Configuration:');
console.log('   Environment:', NODE_ENV.toUpperCase());
console.log('   Client ID:', CLIENT_ID);
console.log('   Client Version:', CLIENT_VERSION);
console.log('   Mode:', IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT');

// Initialize PhonePe Client
const phonepeClient = StandardCheckoutClient.getInstance(
  CLIENT_ID,
  CLIENT_SECRET,
  CLIENT_VERSION,
  IS_PRODUCTION ? Env.PRODUCTION : Env.PRODUCTION // PhonePe SDK uses same env for both
);

console.log('✅ PhonePe SDK initialized');

// Helper function to generate 9-digit verification code
const generateVerificationCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 9; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// 1. Create Payment Order
export const createOrder = async (req, res) => {
  let merchantTransactionId = null;
  const createdTickets = [];

  console.log('\n🚀 === Payment Request Received ===');
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

    // Validate discount for pass bookings
    if (itemType === 'pass' && passId) {
      const passPricing = PASS_PRICING[passId];

      if (!passPricing) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pass ID'
        });
      }

      // Determine expected base price based on discount status
      const expectedBasePrice = isDiscountActive()
        ? passPricing.discountedBase
        : passPricing.originalBase;

      const expectedGST = expectedBasePrice * 0.18;
      const expectedTotal = expectedBasePrice + expectedGST;
      const expectedTotalForQuantity = expectedTotal * quantity;

      // Allow small rounding differences (within 1 rupee)
      const tolerance = 1;

      if (Math.abs(amount - expectedTotalForQuantity) > tolerance) {
        console.log('⚠️ Price mismatch detected:');
        console.log('   Expected:', expectedTotalForQuantity);
        console.log('   Received:', amount);
        console.log('   Discount Active:', isDiscountActive());

        return res.status(400).json({
          success: false,
          message: isDiscountActive()
            ? 'Invalid amount. Please refresh the page to get the latest pricing.'
            : 'Discount has expired. Please refresh the page to see current pricing.'
        });
      }

      // Log successful discount application
      if (isDiscountActive()) {
        console.log('✅ Discount validated and applied:');
        console.log(`   Pass ID: ${passId}`);
        console.log(`   Original: ₹${passPricing.originalBase} → Discounted: ₹${passPricing.discountedBase}`);
        console.log(`   Savings: ₹${(passPricing.originalBase - passPricing.discountedBase) * quantity} (${DISCOUNT_CONFIG.percentage}% off)`);
      }
    }

    // Check for environment variables
    if (!CLIENT_ID || !CLIENT_SECRET || !CLIENT_VERSION) {
      console.error('PhonePe credentials not configured');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    // Generate unique Transaction ID with better randomness
    merchantTransactionId = `MT${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Check if order already exists in PendingTicket
    const existingOrder = await PendingTicket.findOne({ orderId: merchantTransactionId });
    if (existingOrder) {
      return res.status(409).json({
        success: false,
        message: 'Order ID conflict, please try again'
      });
    }

    console.log('💳 Creating PENDING tickets for', attendees.length, 'attendee(s)...');
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
        amount: amount, // Total amount for the entire booking (same for all tickets)
        quantity: quantity, // Total quantity (same for all tickets)
        orderId: merchantTransactionId,
        status: "created",
        itemType: itemType || 'pass',
        verificationCode: verificationCode,
        groupBooking: isGroupBooking,
        primaryContact: i === 0 // First attendee is the primary contact
      };

      // Add type-specific fields
      if (itemType === 'stall') {
        ticketData.stallType = stallType;
        ticketData.stallId = stallId;
      } else {
        ticketData.passType = passType;
        ticketData.passId = passId;
      }

      // Save base amount and GST if provided (for both stalls and passes now)
      if (baseAmount && gstAmount) {
        ticketData.baseAmount = baseAmount;
        ticketData.gstAmount = gstAmount;
      }

      // Save to PendingTicket instead of Ticket
      const newTicket = await PendingTicket.create(ticketData);
      createdTickets.push(newTicket);
      console.log(`   ✓ Created pending ticket ${i + 1}/${attendees.length} - Code: ${verificationCode}`);
    }

    console.log('💳 Creating PhonePe payment with SDK...');
    console.log('   Total Amount:', amount);

    // Create payment request using PhonePe SDK
    const redirectUrl = `${FRONTEND_URL}/checkout?paymentStatus=success&orderId=${merchantTransactionId}${passId ? `&passId=${passId}` : ''}${stallId ? `&stallId=${stallId}` : ''}`;

    const paymentRequest = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantTransactionId)
      .amount(amount * 100) // Convert to paise
      .redirectUrl(redirectUrl)
      .build();

    console.log('📞 Calling PhonePe API...');
    console.log('   Redirect URL (Frontend):', redirectUrl);

    // Call PhonePe API using SDK with timeout
    const response = await Promise.race([
      phonepeClient.pay(paymentRequest),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PhonePe API timeout after 30 seconds')), 30000)
      )
    ]);

    console.log('✅ PhonePe SDK Response:', JSON.stringify(response, null, 2));

    if (response && response.redirectUrl) {
      // Send Redirect URL to Frontend
      return res.json({
        success: true,
        redirectUrl: response.redirectUrl,
        orderId: merchantTransactionId,
        ticketCount: createdTickets.length
      });
    } else {
      // Delete all created pending tickets if PhonePe fails
      await PendingTicket.deleteMany({ orderId: merchantTransactionId });
      console.log('🗑️ Rolled back all pending tickets due to PhonePe failure');

      return res.status(400).json({
        success: false,
        message: "Payment gateway error - no redirect URL received"
      });
    }

  } catch (error) {
    console.error("❌ Payment Error:", error.message);
    console.error("📍 Error Stack:", error.stack);

    if (error.response) {
      console.error("📦 Response Status:", error.response?.status);
      console.error("📄 Response Data:", JSON.stringify(error.response?.data, null, 2));
    }

    // Clean up all pending tickets on error
    try {
      if (merchantTransactionId) {
        const deletedCount = await PendingTicket.deleteMany({ orderId: merchantTransactionId });
        console.log(`🗑️ Cleaned up ${deletedCount.deletedCount} failed pending ticket(s):`, merchantTransactionId);
      }
    } catch (cleanupError) {
      console.error('Failed to cleanup tickets:', cleanupError.message);
    }

    // Provide specific error messages
    let errorMessage = "Payment initialization failed";
    let statusCode = 500;

    if (error.message.includes('timeout')) {
      errorMessage = "PhonePe API timeout. Please try again.";
      statusCode = 504;
    } else if (error.response?.status === 404) {
      errorMessage = "Payment gateway endpoint not found.";
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

// 2. Check Status (AJAX endpoint for frontend verification)
export const checkStatus = async (req, res) => {
  const { transactionId } = req.params;

  try {
    console.log('🔍 Checking payment status using SDK...');
    console.log('   Transaction ID:', transactionId);

    // Call PhonePe Status API using SDK
    const response = await phonepeClient.getOrderStatus(transactionId);

    console.log('📊 Status Response:', response);

    if (response && response.state === "COMPLETED") {

      // 1. Look for pending tickets first
      let activeTickets = await PendingTicket.find({ orderId: transactionId });
      let wasPending = true;

      // 2. If not found in pending, check if they are already confirmed in Ticket collection (Idempotency)
      if (!activeTickets || activeTickets.length === 0) {
        console.log('⚠️ Not found in PendingTicket, checking main Ticket collection (Idempotency check)...');
        activeTickets = await Ticket.find({ orderId: transactionId });
        wasPending = false;

        if (!activeTickets || activeTickets.length === 0) {
          console.error(`❌ No tickets found anywhere for orderId: ${transactionId}`);
          return res.status(404).json({
            success: false,
            message: "Tickets not found"
          });
        }
      }

      // 3. Convert pending tickets to permanent tickets
      let finalTickets = [];

      if (wasPending) {
        console.log(`✅ Converting ${activeTickets.length} pending tickets to permanent...`);

        for (const pendingTicket of activeTickets) {
          const ticketData = pendingTicket.toObject();
          delete ticketData._id; // Remove _id to create new one (or keep it, but safer to let Mongo generate)
          delete ticketData.__v;

          ticketData.status = "paid";
          ticketData.paymentId = response.transactionId || transactionId;
          ticketData.signature = response.merchantOrderId || transactionId;

          const newTicket = await Ticket.create(ticketData);
          finalTickets.push(newTicket);
        }

        // Delete from PendingTicket
        await PendingTicket.deleteMany({ orderId: transactionId });
        console.log('🗑️ Removed processed tickets from PendingTicket collection');
      } else {
        // Already verified tickets
        finalTickets = activeTickets;
        console.log('✅ Tickets were already verified previously.');
      }

      console.log(`✅ Successfully returned ${finalTickets.length} confirmed tickets`);

      // Send email to each attendee in parallel to save time
      await Promise.all(finalTickets.map(async (ticket) => {
        try {
          await sendInvoiceEmail(ticket);
          console.log(`📧 Email sent to ${ticket.email}`);
        } catch (emailError) {
          console.error(`Email sending failed for ${ticket.email}:`, emailError.message);
          // Don't fail the payment if email fails
        }
      }));

      // Return success response with all ticket details
      return res.json({
        success: true,
        message: "Payment verified successfully",
        tickets: finalTickets.map(ticket => ({
          orderId: ticket.orderId,
          name: ticket.name,
          email: ticket.email,
          phone: ticket.phone,
          profession: ticket.profession,
          itemType: ticket.itemType,
          passType: ticket.passType,
          stallType: ticket.stallType,
          verificationCode: ticket.verificationCode,
          amount: ticket.amount,
          quantity: ticket.quantity,
          status: ticket.status,
          groupBooking: ticket.groupBooking,
          primaryContact: ticket.primaryContact,
          createdAt: ticket.createdAt
        }))
      });
    } else {
      // Payment Failed or Pending
      // Update pending tickets status to failed (so they don't look like they are just waiting)
      // They will eventually expire via TTL

      console.log(`❌ Payment not completed. Status: ${response?.state}`);

      await PendingTicket.updateMany(
        { orderId: transactionId },
        { status: "failed" }
      );

      return res.json({
        success: false,
        message: "Payment verification failed",
        status: response?.state || "UNKNOWN"
      });
    }

  } catch (error) {
    console.error("Status Check Error:", error.message);

    // Try to update all tickets status to failed if they exist
    try {
      await PendingTicket.updateMany(
        { orderId: transactionId },
        { status: "failed" }
      );
    } catch (dbError) {
      console.error("Failed to update ticket status:", dbError.message);
    }

    return res.status(500).json({
      success: false,
      message: "Error verifying payment status",
      error: error.message
    });
  }
};
