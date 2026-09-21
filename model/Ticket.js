import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
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

  // Free-ticket abuse guard.
  //
  // Free passes cost nothing and are issued immediately, so without a limit a
  // loop against the public endpoint mints unlimited valid entry codes. Set
  // ONLY on ₹0 tickets, as `<email>::<pass or stall type>::<index in order>`.
  //
  // Including the index within the order is deliberate: it still allows one
  // booking of up to 5 free passes on a shared email (a parent booking for a
  // family), while a second booking reuses index 0 and collides. The effective
  // limit is therefore 5 free tickets per email per pass type, enforced
  // atomically by the unique index below rather than by a racy count check.
  //
  // Sparse, so the historical tickets that predate this field — including the
  // handful of emails already holding several free passes — are excluded and
  // the index can build without touching existing data.
  freeTicketKey: { type: String },

  // Invoice email delivery tracking.
  //
  // The verification code reaches the attendee by email and nowhere else, so a
  // silent send failure means a paid customer arrives without a ticket. Socket
  // events cannot carry this on Vercel serverless (no persistent connections),
  // so delivery state is persisted here and recoverable via
  // scripts/resendFailedInvoices.js.
  invoiceEmailStatus: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  invoiceEmailAttempts: { type: Number, default: 0 },
  invoiceEmailSentAt: { type: Date },
  invoiceEmailError: { type: String },

  // Student Special Stall specific fields
  studentIdUrl: { type: String }, // Cloudinary URL for student ID
  founderProofUrl: { type: String }, // Cloudinary URL for founder proof document
  linkedinProfile: { type: String }, // Company or personal LinkedIn profile URL
  hasCoFounder: { type: Boolean }, // Whether the student has a co-founder
  coFounderStudentIdUrl: { type: String }, // Cloudinary URL for co-founder's student ID
  termsAccepted: { type: Boolean }, // Whether student stall terms were accepted
  termsAcceptedAt: { type: Date }, // Timestamp of terms acceptance
}, { timestamps: true });

// Enforces the free-ticket limit described on freeTicketKey above. Sparse so
// it ignores every ticket that does not carry the field (all paid tickets, and
// all free tickets issued before this was introduced).
ticketSchema.index({ freeTicketKey: 1 }, { unique: true, sparse: true });

// Finding undelivered invoices, for scripts/resendFailedInvoices.js.
ticketSchema.index({ invoiceEmailStatus: 1, createdAt: -1 });

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;