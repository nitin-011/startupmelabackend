import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from "pg-sdk-node";
import Ticket from '../model/Ticket.js';
import PendingTicket from '../model/PendingTicket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';
import dotenv from 'dotenv';

dotenv.config();

// Pass pricing (must match frontend passes.js)
const PASS_PRICING = {
  1: { basePrice: 50 },
  2: { basePrice: 199 },
  3: { basePrice: 3500 },
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
  IS_PRODUCTION ? Env.PRODUCTION : Env.SANDBOX
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
    const { attendees, amount, quantity, itemType, passType, passId, stallType, stallId, baseAmount, gstAmount, studentDocuments } = req.body;

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
    if (isNaN(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Validate Student Special Stall documents (stallId === 1)
    if (itemType === 'stall' && stallId === 1) {
      if (!studentDocuments) {
        return res.status(400).json({
          success: false,
          message: 'Student documents are required for Student Special Stall'
        });
      }

      const { studentIdUrl, founderProofUrl, linkedinProfile, hasCoFounder, coFounderStudentIdUrl, termsAccepted } = studentDocuments;

      if (!studentIdUrl || !founderProofUrl || !linkedinProfile || !termsAccepted) {
        return res.status(400).json({
          success: false,
          message: 'All student verification documents are required'
        });
      }

      if (hasCoFounder && !coFounderStudentIdUrl) {
        return res.status(400).json({
          success: false,
          message: 'Co-founder student ID is required when co-founder is specified'
        });
      }

      // Validate LinkedIn URL format
      const linkedinRegex = /^(https?:\/\/)?(www\.)?linkedin\.com\/(company|in)\/.+$/i;
      if (!linkedinRegex.test(linkedinProfile)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid LinkedIn profile URL'
        });
      }

      console.log('✅ Student stall documents validated');
    }

    // Validate pricing for pass bookings
    // Skip validation for Free Tickets (Amount = 0)
    if (itemType === 'pass' && passId && amount > 0) {
      const passPricing = PASS_PRICING[passId];

      if (!passPricing) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pass ID'
        });
      }

      const expectedBasePrice = passPricing.basePrice;
      const expectedGST = expectedBasePrice * 0.18;
      const expectedTotal = expectedBasePrice + expectedGST;
      const expectedTotalForQuantity = expectedTotal * quantity;

      // Allow small rounding differences (within 1 rupee)
      const tolerance = 1;

      if (Math.abs(amount - expectedTotalForQuantity) > tolerance) {
        console.log('⚠️ Price mismatch detected:');
        console.log('   Expected:', expectedTotalForQuantity);
        console.log('   Received:', amount);

        return res.status(400).json({
          success: false,
          message: 'Invalid amount. Please refresh the page to get the latest pricing.'
        });
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

      // Add student documents if this is a Student Special Stall
      if (itemType === 'stall' && stallId === 1 && studentDocuments) {
        ticketData.studentIdUrl = studentDocuments.studentIdUrl;
        ticketData.founderProofUrl = studentDocuments.founderProofUrl;
        ticketData.linkedinProfile = studentDocuments.linkedinProfile;
        ticketData.hasCoFounder = studentDocuments.hasCoFounder;
        ticketData.coFounderStudentIdUrl = studentDocuments.coFounderStudentIdUrl || null;
        ticketData.termsAccepted = studentDocuments.termsAccepted;
        ticketData.termsAcceptedAt = studentDocuments.termsAcceptedAt;
        console.log(`   ✓ Added student documents for ticket ${i + 1}`);
      }

      // Save to PendingTicket instead of Ticket
      const newTicket = await PendingTicket.create(ticketData);
      createdTickets.push(newTicket);
      console.log(`   ✓ Created pending ticket ${i + 1}/${attendees.length} - Code: ${verificationCode}`);
    }



    // Special handling for Free Tickets (Amount = 0)
    if (amount === 0) {
      console.log('🎉 Free Ticket Order! Skipping Payment Gateway...');

      // Convert pending tickets to permanent "paid" tickets immediately
      const confirmedTickets = [];

      for (const pendingTicket of createdTickets) {
        const ticketData = pendingTicket.toObject();
        delete ticketData._id;
        delete ticketData.__v;

        ticketData.status = "paid";
        ticketData.paymentId = "FREE_Pass_" + merchantTransactionId;
        ticketData.signature = "FREE_" + merchantTransactionId;

        const newTicket = await Ticket.create(ticketData);
        confirmedTickets.push(newTicket);
      }

      // Delete from PendingTicket
      await PendingTicket.deleteMany({ orderId: merchantTransactionId });
      console.log('✅ Created confirmed tickets for free order');

      // Send emails
      console.log('📧 Sending confirmation emails for free tickets...');
      Promise.all(confirmedTickets.map(async (ticket) => {
        try {
          await sendInvoiceEmail(ticket);
        } catch (emailError) {
          console.error(`❌ Email sending failed for ${ticket.email}:`, emailError.message);
        }
      })).catch(err => console.error("Background email processing error:", err));

      // For free tickets, return success data directly without redirect
      // Frontend will show success modal immediately
      return res.json({
        success: true,
        orderId: merchantTransactionId,
        ticketCount: confirmedTickets.length,
        tickets: confirmedTickets.map(t => ({
          verificationCode: t.verificationCode,
          name: t.name,
          email: t.email,
          itemType: t.itemType,
          passType: t.passType,
          stallType: t.stallType
        })),
        message: "Free ticket booked successfully",
        isFreeTicket: true
      });
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
    let response;

    // Check if this is a test transaction (ONLY IN DEVELOPMENT)
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev && transactionId.startsWith('TEST')) {
      console.log('🧪 Test Transaction detected (Dev Mode). Skipping PhonePe SDK check.');
      response = {
        state: "COMPLETED",
        transactionId: transactionId,
        merchantOrderId: transactionId,
        responseCode: "SUCCESS",
        message: "Test Payment Successful"
      };
    } else {
      // Real PhonePe Check
      response = await phonepeClient.getOrderStatus(transactionId);
    }

    console.log('📊 Status Response:', JSON.stringify(response, null, 2));

    if (response && response.state === "COMPLETED") {
      console.log('✅ Payment State is COMPLETED. Proceeding to verify tickets...');

      // 1. Look for pending tickets first
      let activeTickets = await PendingTicket.find({ orderId: transactionId });
      console.log(`🔎 Found ${activeTickets ? activeTickets.length : 0} pending tickets for OrderID: ${transactionId}`);

      let wasPending = true;

      // 2. If not found in pending, check if they are already confirmed in Ticket collection (Idempotency)
      if (!activeTickets || activeTickets.length === 0) {
        console.log('⚠️ Not found in PendingTicket, checking main Ticket collection (Idempotency check)...');
        activeTickets = await Ticket.find({ orderId: transactionId });
        wasPending = false;
        console.log(`🔎 Found ${activeTickets ? activeTickets.length : 0} existing confirmed tickets`);

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

      // Send email to each attendee in parallel (FIRE AND FORGET to speed up response)
      if (wasPending) {
        console.log('📧 Initiating email sending asynchronously for', finalTickets.length, 'tickets...');

        // Send emails but don't block the response
        finalTickets.forEach(async (ticket) => {
          try {
            console.log(`📧 [${new Date().toISOString()}] Sending email to: ${ticket.email}`);
            const startTime = Date.now();
            await sendInvoiceEmail(ticket);
            const duration = Date.now() - startTime;
            console.log(`✅ [${new Date().toISOString()}] Email sent successfully to ${ticket.email} (took ${duration}ms)`);

            // Emit email status to admin namespace
            if (global.adminNamespace) {
              global.adminNamespace.emit('email:sent', {
                ticketId: ticket._id,
                email: ticket.email,
                orderId: ticket.orderId,
                success: true,
                timestamp: new Date().toISOString()
              });
            }
          } catch (emailError) {
            console.error(`❌ [${new Date().toISOString()}] Email sending failed for ${ticket.email}:`, emailError.message);
            console.error('Full email error:', emailError);

            // Emit email failure to admin namespace
            if (global.adminNamespace) {
              global.adminNamespace.emit('email:failed', {
                ticketId: ticket._id,
                email: ticket.email,
                orderId: ticket.orderId,
                error: emailError.message,
                timestamp: new Date().toISOString()
              });
            }
            // Don't fail the payment if email fails
          }
        });
      } else {
        console.log('ℹ️ Skipping email sending (tickets already verified).');
      }

      console.log('📧 Email processing handed off to background.');

      // Emit real-time events for new orders
      // Check if tickets are new (created within last 2 minutes) OR if they were pending
      const isRecentOrder = finalTickets.some(ticket => {
        const ticketAge = Date.now() - new Date(ticket.createdAt).getTime();
        return ticketAge < 2 * 60 * 1000; // 2 minutes
      });

      if ((wasPending || isRecentOrder) && global.adminNamespace) {
        // Broadcast to all admin clients about the new order(s)
        console.log(`📡 Broadcasting ${finalTickets.length} order(s) to admin clients... (wasPending: ${wasPending}, isRecent: ${isRecentOrder})`);
        finalTickets.forEach((ticket) => {
          const orderData = {
            orderId: ticket.orderId,
            ticketId: ticket._id,
            name: ticket.name,
            email: ticket.email,
            phone: ticket.phone,
            itemType: ticket.itemType,
            passType: ticket.passType,
            stallType: ticket.stallType,
            amount: ticket.amount,
            verificationCode: ticket.verificationCode,
            createdAt: ticket.createdAt,
            profession: ticket.profession,
            professionOther: ticket.professionOther,
            startupName: ticket.startupName
          };
          global.adminNamespace.emit('order:created', orderData);
          console.log(`📡 Emitted 'order:created' event for ticket ${ticket._id} to ${global.adminNamespace.sockets.size} admin client(s)`);
        });

        // Send targeted notification to customer's checkout session
        if (global.checkoutNamespace) {
          const checkoutData = {
            success: true,
            orderId: transactionId,
            ticketsCount: finalTickets.length,
            timestamp: new Date().toISOString()
          };
          global.checkoutNamespace.to(`order-${transactionId}`).emit('payment:confirmed', checkoutData);
          console.log(`📡 Emitted 'payment:confirmed' event to room: order-${transactionId}`);
        }
      } else {
        console.log(`ℹ️ Skipping event emission (not pending and not recent). Ticket age: ${Math.round((Date.now() - new Date(finalTickets[0]?.createdAt).getTime()) / 1000)}s`);
      }

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

    // LOGGING TO FILE FOR DEBUGGING
    try {
      const fs = await import('fs');
      const logMessage = `\n[${new Date().toISOString()}] Error in checkStatus:\nMessage: ${error.message}\nStack: ${error.stack}\nTransactionID: ${transactionId}\n`;
      fs.appendFileSync('backend_error_v2.log', logMessage);
    } catch (logErr) {
      console.error("Failed to write to log file:", logErr);
    }

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
