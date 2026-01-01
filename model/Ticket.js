import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  
  // Type of purchase
  itemType: { type: String, enum: ['pass', 'stall'], default: 'pass' },
  
  // Pass details (for passes)
  passType: { type: String }, // e.g., "General Visitor", "Investor"
  
  // Stall details (for stalls)
  stallType: { type: String }, // e.g., "4 × 4 ft Exhibition Stall"
  stallId: { type: Number },
  baseAmount: { type: Number }, // Base price without GST (for stalls)
  gstAmount: { type: Number }, // GST amount (18% for stalls, 0 for passes)
  
  amount: { type: Number, required: true }, // Total amount (with GST for stalls)
  quantity: { type: Number, default: 1 },
  orderId: { type: String, required: true }, // Transaction ID
  paymentId: { type: String }, // Payment ID (added after success)
  signature: { type: String }, // Payment Signature
  status: { type: String, default: 'created' }, // created, paid, failed
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;