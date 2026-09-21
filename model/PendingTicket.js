import mongoose from 'mongoose';

const pendingTicketSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },

    // Type of purchase
    itemType: { type: String, enum: ['pass', 'stall'], default: 'pass' },

    // Pass details (for passes)
    passType: { type: String }, // e.g., "General Visitor", "Investor"
    passId: { type: Number },

    // Stall details (for stalls)
    stallType: { type: String }, // e.g., "4 × 4 ft Exhibition Stall"
    stallId: { type: Number },
    baseAmount: { type: Number }, // Base price without GST (for stalls)
    gstAmount: { type: Number }, // GST amount (18% for stalls, 0 for passes)

    amount: { type: Number, required: true }, // Total amount (with GST for stalls)
    quantity: { type: Number, default: 1 },
    orderId: { type: String, required: true }, // Transaction ID (shared across group bookings)
    paymentId: { type: String }, // Payment ID (added after success)
    signature: { type: String }, // Payment Signature
    status: { type: String, default: 'created' }, // created, paid, failed

    // New fields for multi-attendee support
    verificationCode: { type: String, required: true }, // 9-digit alphanumeric code for check-in
    profession: { type: String }, // Attendee's profession (Required for Passes)
    professionOther: { type: String }, // Custom profession if "Others" selected
    startupName: { type: String }, // Startup Name (Required for Stalls)
    groupBooking: { type: Boolean, default: false }, // True if part of multi-ticket booking
    primaryContact: { type: Boolean, default: false }, // True for the person who made the payment

    // Check-in tracking
    checkedIn: { type: Boolean, default: false }, // Whether ticket has been used for entry
    checkInTime: { type: Date }, // Timestamp of when ticket was checked in

    // Student Special Stall specific fields
    studentIdUrl: { type: String }, // Cloudinary URL for student ID
    founderProofUrl: { type: String }, // Cloudinary URL for founder proof document
    linkedinProfile: { type: String }, // Company or personal LinkedIn profile URL
    hasCoFounder: { type: Boolean }, // Whether the student has a co-founder
    coFounderStudentIdUrl: { type: String }, // Cloudinary URL for co-founder's student ID
    termsAccepted: { type: Boolean }, // Whether student stall terms were accepted
    termsAcceptedAt: { type: Date }, // Timestamp of terms acceptance
}, { timestamps: true });

// TTL Index: pending orders expire 2 hours after creation if never confirmed.
//
// This window has to outlast the whole payment attempt, not just the happy
// path: bank OTP pages and UPI app switches can push a customer's return well
// past the old 15-minute limit. A row that expires before confirmation
// arrives is a customer who paid and has no ticket and no recoverable record.
//
// Confirmation currently happens only when the customer's browser returns and
// polls, so this window is the entire margin for error — err long. Unconfirmed
// rows are small and expire on their own.
//
// NOTE: changing expireAfterSeconds does not update an index that already
// exists in MongoDB. Run scripts/updatePendingTicketTTL.js once per environment.
pendingTicketSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

const PendingTicket = mongoose.model('PendingTicket', pendingTicketSchema);
export default PendingTicket;
