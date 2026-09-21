import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from "@phonepe-pg/pg-sdk-node";
import Ticket from '../model/Ticket.js';
import PendingTicket from '../model/PendingTicket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';
import dotenv from 'dotenv';

dotenv.config();

// Server-side price tables. These are the source of truth for what an order may
// cost — the client-supplied `amount` is only ever compared against these, never
// trusted. Keep in sync with frontend src/data/passes.js and src/data/stalls.js.
// An id that is not listed here cannot be purchased.
const PASS_PRICING = {
  1: { basePrice: 0 },     // Exhibition (free)
  2: { basePrice: 199 },   // All-Access Conference Pass
  3: { basePrice: 3500 },  // Startup Pitching Pass
};

const STALL_PRICING = {
  3: { basePrice: 25000 }, // 8 × 8 ft Premium Exhibition Stall
};

// GST is 18% on the base price, rounded to the nearest rupee to match the
// frontend (e.g. 199 * 0.18 = 35.82 → 36).
const GST_RATE = 0.18;

const expectedTotalFor = (basePrice) =>
  basePrice + Math.round(basePrice * GST_RATE);

/**
 * Validates a client-supplied amount against the server price table.
 * Returns null when the order is priced correctly, or an error message.
 *
 * Runs for every order including ₹0 ones — a free order still has to *be* free
 * according to the table, otherwise a client could claim a paid pass costs
 * nothing and the free-ticket short-circuit would issue it immediately.
 */
const validateOrderPricing = ({ itemType, passId, stallId, amount, quantity }) => {
  const isStall = itemType === 'stall';
  const table = isStall ? STALL_PRICING : PASS_PRICING;
  const id = isStall ? stallId : passId;
  const label = isStall ? 'stall' : 'pass';

  if (id === undefined || id === null) {
    return `Missing ${label} ID`;
  }

  const pricing = table[id];
  if (!pricing) {
    return `Invalid ${label} ID`;
  }

  // Stalls are sold one at a time; passes may be bought in quantity.
  const units = isStall ? 1 : quantity;
  const expectedTotal = expectedTotalFor(pricing.basePrice) * units;

  // Allow a rupee of drift for rounding differences between client and server.
  if (Math.abs(amount - expectedTotal) > 1) {
    console.log('⚠️ Price mismatch detected:');
    console.log(`   ${label} ID:`, id);
    console.log('   Expected:', expectedTotal);
    console.log('   Received:', amount);
    return 'Invalid amount. Please refresh the page to get the latest pricing.';
  }

  return null;
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
console.log('   Client ID:', CLIENT_ID ? CLIENT_ID.substring(0, 6) + '...' : 'NOT SET');
console.log('   Client Version:', CLIENT_VERSION);
console.log('   Mode:', IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT');

// Lazy-initialize PhonePe client to avoid crashing at module load if env vars are missing
let _phonepeClient = null;
const getPhonepeClient = () => {
  if (_phonepeClient) return _phonepeClient;
  if (!CLIENT_ID || !CLIENT_SECRET || !CLIENT_VERSION) {
    throw new Error('PhonePe credentials not configured. Check environment variables.');
  }
  _phonepeClient = StandardCheckoutClient.getInstance(
    CLIENT_ID,
    CLIENT_SECRET,
    CLIENT_VERSION,
    IS_PRODUCTION ? Env.PRODUCTION : Env.SANDBOX
  );
  console.log('✅ PhonePe SDK initialized');
  return _phonepeClient;
};

// Helper function to generate 9-digit verification code
const generateVerificationCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 9; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Moves an order's PendingTickets into the confirmed Ticket collection.
 *
 * Idempotent and safe under concurrency. The confirmed Ticket deliberately
 * reuses the PendingTicket's _id, so when two callers race (the checkout page
 * polls every 3s while a socket event fires, and both can arrive at once) the
 * loser hits a duplicate-key error instead of creating a second ticket. Only
 * the caller that actually inserted a row gets it back in `newlyConfirmed`,
 * so invoice emails and admin events fire exactly once per ticket.
 *
 * Tickets are created before the pending rows are deleted — if the process
 * dies in between, the pending rows survive and a later retry converges on the
 * same result rather than losing a paid order.
 */
const confirmOrder = async (orderId, { paymentId, signature } = {}) => {
  const pendingTickets = await PendingTicket.find({ orderId });

  const newlyConfirmed = [];
  const alreadyConfirmed = [];

  for (const pending of pendingTickets) {
    const ticketData = pending.toObject();
    delete ticketData.__v;

    ticketData.status = 'paid';
    ticketData.paymentId = paymentId || orderId;
    ticketData.signature = signature || orderId;

    try {
      // _id is intentionally NOT stripped — it is what makes this idempotent.
      const ticket = await Ticket.create(ticketData);
      newlyConfirmed.push(ticket);
    } catch (err) {
      if (err.code === 11000) {
        // A concurrent caller already confirmed this exact ticket.
        console.log(`   ↺ Ticket ${ticketData._id} already confirmed by a concurrent request`);
        const existing = await Ticket.findById(ticketData._id);
        if (existing) alreadyConfirmed.push(existing);
      } else {
        throw err;
      }
    }
  }

  if (pendingTickets.length > 0) {
    await PendingTicket.deleteMany({ orderId });
  }

  // If there was nothing pending, the order was either confirmed on an earlier
  // call or never existed — fall back to reading the confirmed collection.
  const tickets =
    newlyConfirmed.length || alreadyConfirmed.length
      ? [...newlyConfirmed, ...alreadyConfirmed]
      : await Ticket.find({ orderId });

  return { tickets, newlyConfirmed };
};

/**
 * Sends invoices and broadcasts admin/checkout events for freshly confirmed
 * tickets. Takes only the tickets this caller actually created, so replays and
 * concurrent callers never double-send. Never throws — a failed email must not
 * fail a payment.
 */
const dispatchConfirmation = (newlyConfirmed, orderId) => {
  if (!newlyConfirmed.length) {
    console.log('ℹ️ No newly confirmed tickets — skipping emails and events.');
    return;
  }

  console.log(`📧 Sending invoices for ${newlyConfirmed.length} newly confirmed ticket(s)...`);

  newlyConfirmed.forEach((ticket) => {
    sendInvoiceEmail(ticket)
      .then(() => {
        console.log(`✅ Email sent to ${ticket.email}`);
        global.adminNamespace?.emit('email:sent', {
          ticketId: ticket._id,
          email: ticket.email,
          orderId: ticket.orderId,
          success: true,
          timestamp: new Date().toISOString(),
        });
      })
      .catch((emailError) => {
        console.error(`❌ Email failed for ${ticket.email}:`, emailError.message);
        global.adminNamespace?.emit('email:failed', {
          ticketId: ticket._id,
          email: ticket.email,
          orderId: ticket.orderId,
          error: emailError.message,
          timestamp: new Date().toISOString(),
        });
      });
  });

  if (global.adminNamespace) {
    newlyConfirmed.forEach((ticket) => {
      global.adminNamespace.emit('order:created', {
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
        startupName: ticket.startupName,
      });
    });
    console.log(`📡 Emitted 'order:created' for ${newlyConfirmed.length} ticket(s)`);
  }

  if (global.checkoutNamespace && orderId) {
    global.checkoutNamespace.to(`order-${orderId}`).emit('payment:confirmed', {
      success: true,
      orderId,
      ticketsCount: newlyConfirmed.length,
      timestamp: new Date().toISOString(),
    });
    console.log(`📡 Emitted 'payment:confirmed' to room: order-${orderId}`);
  }
};

/**
 * Shape a ticket for the checkout confirmation response.
 *
 * Deliberately contains NO personal data and NO verification code. The status
 * endpoint that returns this is unauthenticated and order IDs are guessable
 * (timestamp + 4 digits), so anything included here is effectively public.
 * Attendee names, emails, phone numbers and professions were previously
 * exposed this way, as were the verification codes used for entry at the door.
 *
 * Verification codes are delivered by email only — the checkout UI states this
 * and never displays them. Do not add them back here.
 */
const toConfirmationSummary = (ticket) => ({
  orderId: ticket.orderId,
  itemType: ticket.itemType,
  passType: ticket.passType,
  stallType: ticket.stallType,
  amount: ticket.amount,
  quantity: ticket.quantity,
  status: ticket.status,
  createdAt: ticket.createdAt,
});

const PRIVATE_FREE_PASS = {
  passId: 1,
  passType: '₹199 Private Pass (Free)',
};

// Private free pass order flow (independent from regular checkout flow)
export const createPrivateFreePassOrder = async (req, res) => {
  try {
    const { attendees } = req.body;

    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Attendees are required'
      });
    }

    if (attendees.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 5 attendees allowed in one private group order'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[6-9]\d{9}$/;

    const merchantTransactionId = `PV199${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const createdTickets = [];
    const isGroupBooking = attendees.length > 1;

    for (let i = 0; i < attendees.length; i++) {
      const attendee = attendees[i];

      if (!attendee?.name || !attendee?.email || !attendee?.phone) {
        return res.status(400).json({
          success: false,
          message: `Attendee ${i + 1}: Name, email, and phone are required`
        });
      }

      if (attendee.name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: `Attendee ${i + 1}: Name must be at least 2 characters long`
        });
      }

      if (!emailRegex.test(attendee.email.trim())) {
        return res.status(400).json({
          success: false,
          message: `Attendee ${i + 1}: Invalid email address format`
        });
      }

      const cleanPhone = attendee.phone.replace(/[\s+\-()]/g, '');
      if (!phoneRegex.test(cleanPhone.slice(-10))) {
        return res.status(400).json({
          success: false,
          message: `Attendee ${i + 1}: Invalid phone number. Must be a valid 10-digit Indian mobile number starting with 6-9`
        });
      }

      const ticket = await Ticket.create({
        name: attendee.name.trim(),
        email: attendee.email.trim().toLowerCase(),
        phone: cleanPhone.slice(-10),
        itemType: 'pass',
        passType: PRIVATE_FREE_PASS.passType,
        passId: PRIVATE_FREE_PASS.passId,
        amount: 0,
        baseAmount: 0,
        gstAmount: 0,
        quantity: attendees.length,
        orderId: merchantTransactionId,
        paymentId: `PRIVATE_FREE_${merchantTransactionId}`,
        signature: `PRIVATE_FREE_${merchantTransactionId}`,
        status: 'paid',
        verificationCode: generateVerificationCode(),
        groupBooking: isGroupBooking,
        primaryContact: i === 0,
      });

      createdTickets.push(ticket);
    }

    // Send emails asynchronously
    createdTickets.forEach((ticket) => {
      sendInvoiceEmail(ticket).catch((emailError) => {
        console.error(`❌ Email sending failed for ${ticket.email}:`, emailError.message);
      });
    });

    // Emit real-time event for admin panel
    if (global.adminNamespace) {
      createdTickets.forEach((ticket) => {
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
          startupName: ticket.startupName,
        };

        global.adminNamespace.emit('order:created', orderData);
      });

      console.log(`📡 Emitted 'order:created' event for ${createdTickets.length} private free pass ticket(s) to ${global.adminNamespace.sockets.size} admin client(s)`);
    }

    return res.status(201).json({
      success: true,
      message: 'Private free pass booked successfully',
      isFreeTicket: true,
      orderId: merchantTransactionId,
      ticketCount: createdTickets.length,
      tickets: createdTickets.map((ticket) => ({
        orderId: ticket.orderId,
        name: ticket.name,
        email: ticket.email,
        phone: ticket.phone,
        itemType: ticket.itemType,
        passType: ticket.passType,
        verificationCode: ticket.verificationCode,
        amount: ticket.amount,
        status: ticket.status,
        createdAt: ticket.createdAt,
      }))
    });
  } catch (error) {
    console.error('Private free pass order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create private free pass order',
      error: error.message,
    });
  }
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

    // Validate pricing against the server price table (passes AND stalls, and
    // free orders too — see validateOrderPricing).
    const pricingError = validateOrderPricing({ itemType, passId, stallId, amount, quantity });
    if (pricingError) {
      return res.status(400).json({
        success: false,
        message: pricingError
      });
    }

    // Generate unique Transaction ID with better randomness
    merchantTransactionId = `MT${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;


    console.log(`${amount === 0 ? '🎉' : '💳'} Creating tickets for`, attendees.length, 'attendee(s)...');
    console.log('   Order ID:', merchantTransactionId);

    // Create separate ticket document for each attendee
    const isGroupBooking = attendees.length > 1;

    for (let i = 0; i < attendees.length; i++) {
      const attendee = attendees[i];
      const verificationCode = generateVerificationCode();

      const cleanPhone = attendee.phone.replace(/[\s+\-()]/g, '').slice(-10);

      const ticketData = {
        name: attendee.name.trim(),
        email: attendee.email.trim().toLowerCase(),
        phone: cleanPhone,
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

      // Save base amount and GST if provided (for both stalls and passes now).
      // Checked against undefined rather than truthiness so a ₹0 / zero-GST
      // order still records its breakdown.
      if (baseAmount !== undefined && gstAmount !== undefined) {
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

    // ─── FREE TICKET SHORT-CIRCUIT ────────────────────────────────────────────
    // For ₹0 passes, skip the payment gateway entirely and confirm tickets now.
    if (amount === 0) {
      console.log('🎉 Free Ticket Order! Skipping Payment Gateway...');

      const { tickets, newlyConfirmed } = await confirmOrder(merchantTransactionId, {
        paymentId: `FREE_Pass_${merchantTransactionId}`,
        signature: `FREE_${merchantTransactionId}`,
      });

      console.log('✅ Created confirmed tickets for free order');
      dispatchConfirmation(newlyConfirmed, merchantTransactionId);

      return res.json({
        success: true,
        orderId: merchantTransactionId,
        ticketCount: tickets.length,
        tickets: tickets.map(toConfirmationSummary),
        message: 'Free ticket booked successfully',
        isFreeTicket: true
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Only initialise PhonePe for actual (non-zero) payments
    // Check for environment variables
    if (!CLIENT_ID || !CLIENT_SECRET || !CLIENT_VERSION) {
      console.error('PhonePe credentials not configured');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    // Get (or initialize) the PhonePe client
    let phonepeClient;
    try {
      phonepeClient = getPhonepeClient();
    } catch (clientErr) {
      return res.status(500).json({
        success: false,
        message: clientErr.message
      });
    }

    console.log('💳 Creating PhonePe payment with SDK...');
    console.log('   Total Amount:', amount);

    // Create payment request using PhonePe SDK
    // PhonePe sends the user here whatever the outcome — success, failure or
    // cancellation — so the param says "returned", not "succeeded". The real
    // outcome comes from the status endpoint. (The frontend still accepts the
    // old `success` value so payments in flight across a deploy keep working.)
    const redirectUrl = `${FRONTEND_URL}/checkout?paymentStatus=return&orderId=${merchantTransactionId}${passId ? `&passId=${passId}` : ''}${stallId ? `&stallId=${stallId}` : ''}`;

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
        message: 'Payment gateway error - no redirect URL received'
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
// 2. Check Status (AJAX endpoint the checkout page polls after the gateway redirect)
export const checkStatus = async (req, res) => {
  const { transactionId } = req.params;

  try {
    console.log('🔍 Checking payment status using SDK...');
    console.log('   Transaction ID:', transactionId);

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
      const phonepeClient = getPhonepeClient();
      response = await phonepeClient.getOrderStatus(transactionId);
    }

    console.log('📊 Status Response:', JSON.stringify(response, null, 2));

    const state = response?.state || 'UNKNOWN';

    if (state === "COMPLETED") {
      console.log('✅ Payment COMPLETED. Confirming tickets...');

      const { tickets, newlyConfirmed } = await confirmOrder(transactionId, {
        paymentId: response.transactionId || transactionId,
        signature: response.merchantOrderId || transactionId,
      });

      if (!tickets.length) {
        // Paid at the gateway but we have no record of the order — the
        // pending rows expired, or were never written. There is no automatic
        // recovery path, so this needs a human. Make it loud, not a bare 404.
        console.error(`🚨 PAID ORDER WITH NO TICKETS: ${transactionId}`);
        return res.status(404).json({
          success: false,
          state: 'COMPLETED',
          terminal: true,
          message: "Your payment went through but we could not locate your booking. Please contact support with your order ID."
        });
      }

      dispatchConfirmation(newlyConfirmed, transactionId);

      return res.json({
        success: true,
        state: 'COMPLETED',
        terminal: true,
        message: "Payment verified successfully",
        tickets: tickets.map(toConfirmationSummary)
      });
    }

    // Not completed. Distinguish "still in progress" from "definitively over",
    // so the checkout page knows whether to keep polling or show a failure.
    const TERMINAL_FAILURE_STATES = ['FAILED', 'CANCELLED', 'EXPIRED', 'DECLINED'];
    const terminal = TERMINAL_FAILURE_STATES.includes(state);

    console.log(`${terminal ? '❌' : '⏳'} Payment not completed. State: ${state}`);

    if (terminal) {
      await PendingTicket.updateMany({ orderId: transactionId }, { status: "failed" });
    }

    return res.json({
      success: false,
      state,
      terminal,
      message: terminal
        ? "Payment was not completed"
        : "Payment is still being processed"
    });

  } catch (error) {
    console.error("Status Check Error:", error.message);

    // A status lookup that blew up tells us nothing about the payment, so do
    // NOT mark anything failed here — a later poll may still confirm it.
    // Report non-terminal so the client keeps polling.
    return res.status(500).json({
      success: false,
      state: 'ERROR',
      terminal: false,
      message: "Error verifying payment status",
      error: error.message
    });
  }
};
