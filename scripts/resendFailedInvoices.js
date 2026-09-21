/**
 * Find and resend invoice emails that never reached the attendee.
 *
 * The verification code needed for entry is delivered by email and nowhere
 * else, so a silent send failure means a paying customer arrives without a
 * ticket. Delivery state is recorded on each ticket as it is sent; this script
 * is how you find and fix the ones that did not make it.
 *
 *   node scripts/resendFailedInvoices.js            # report only, sends nothing
 *   node scripts/resendFailedInvoices.js --send     # actually resend
 *   node scripts/resendFailedInvoices.js --send --order MT1234567890
 *
 * Tickets created before delivery tracking existed have no status at all and
 * are reported separately — there is no way to know whether those were
 * delivered, so they are never bulk-resent. Target them with --order if needed.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';

dotenv.config();

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const orderFlag = args.indexOf('--order');
const ORDER_ID = orderFlag !== -1 ? args[orderFlag + 1] : null;

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Classify by query rather than by reading the hydrated field: tickets that
  // predate this feature have no field at all in the database, and Mongoose
  // would apply the schema default on load and make them look 'pending'.
  const scope = ORDER_ID ? { orderId: ORDER_ID } : {};
  const byStatus = (q) => Ticket.find({ ...scope, ...q }).sort({ createdAt: -1 });

  const [failed, pending, sent, untracked] = await Promise.all([
    byStatus({ invoiceEmailStatus: 'failed' }),
    byStatus({ invoiceEmailStatus: 'pending' }),
    byStatus({ invoiceEmailStatus: 'sent' }),
    byStatus({ invoiceEmailStatus: { $exists: false } }),
  ]);

  const candidates = ORDER_ID ? [...failed, ...pending, ...sent, ...untracked] : [];

  console.log('📊 Invoice delivery report');
  console.log(`   failed      : ${failed.length}`);
  console.log(`   pending     : ${pending.length}  (started, never recorded a result)`);
  if (ORDER_ID) console.log(`   already sent: ${sent.length}`);
  if (untracked.length) {
    console.log(`   untracked   : ${untracked.length}  (predate delivery tracking — not resent in bulk)`);
  }

  const targets = ORDER_ID ? candidates : [...failed, ...pending];

  if (!targets.length) {
    console.log('\n✅ Nothing to resend.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\n${SEND ? '📤 Resending' : '🔍 Would resend'} ${targets.length} invoice(s):`);
  targets.forEach((t) => {
    console.log(`   ${t.orderId}  ${t.email.padEnd(32)} ${t.invoiceEmailStatus || 'untracked'}` +
      (t.invoiceEmailError ? `  — ${t.invoiceEmailError.slice(0, 60)}` : ''));
  });

  if (!SEND) {
    console.log('\nDry run. Re-run with --send to actually deliver these.');
    await mongoose.disconnect();
    return;
  }

  let ok = 0;
  let bad = 0;

  for (const ticket of targets) {
    try {
      await sendInvoiceEmail(ticket);
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          invoiceEmailStatus: 'sent',
          invoiceEmailSentAt: new Date(),
          invoiceEmailError: null,
          $inc: { invoiceEmailAttempts: 1 },
        },
      );
      console.log(`   ✓ ${ticket.email}`);
      ok++;
    } catch (err) {
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          invoiceEmailStatus: 'failed',
          invoiceEmailError: err.message?.slice(0, 500),
          $inc: { invoiceEmailAttempts: 1 },
        },
      );
      console.log(`   ✗ ${ticket.email} — ${err.message}`);
      bad++;
    }
  }

  console.log(`\n✅ Resent: ${ok}   ❌ Still failing: ${bad}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
