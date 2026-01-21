// Migration script to verify old "created" orders and update them if paid
// This version handles old orders without profession field
import { StandardCheckoutClient, Env } from "pg-sdk-node";
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

// PhonePe Production Config
const CLIENT_ID = "SU2512051700428638464582";
const CLIENT_SECRET = "b2dc0e25-ad2d-4bd4-86a2-c6a64730ebba";
const CLIENT_VERSION = 1;

// Initialize PhonePe Client
const phonepeClient = StandardCheckoutClient.getInstance(
    CLIENT_ID,
    CLIENT_SECRET,
    CLIENT_VERSION,
    Env.PRODUCTION
);

// Helper function to generate 9-digit verification code
const generateVerificationCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

async function migrateCreatedOrders() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all tickets with "created" status
        const createdTickets = await Ticket.find({ status: 'created' });

        console.log(`📊 Found ${createdTickets.length} tickets with "created" status\n`);

        if (createdTickets.length === 0) {
            console.log('✅ No tickets to migrate!');
            process.exit(0);
        }

        // Group by order ID
        const orderGroups = {};
        createdTickets.forEach(ticket => {
            if (!orderGroups[ticket.orderId]) {
                orderGroups[ticket.orderId] = [];
            }
            orderGroups[ticket.orderId].push(ticket);
        });

        console.log(`📦 Processing ${Object.keys(orderGroups).length} unique orders...\n`);
        console.log('='.repeat(80));

        let ordersChecked = 0;
        let ordersPaid = 0;
        let ordersFailed = 0;
        let ticketsUpdated = 0;
        let emailsSent = 0;
        let emailsFailed = 0;

        for (const [orderId, tickets] of Object.entries(orderGroups)) {
            console.log(`\n🔍 Order ${ordersChecked + 1}/${Object.keys(orderGroups).length}: ${orderId}`);
            console.log(`   Tickets: ${tickets.length}`);
            console.log(`   Contact: ${tickets[0].name} (${tickets[0].email})`);

            try {
                // Check payment status with PhonePe
                console.log(`   📞 Verifying with PhonePe...`);

                let paymentStatus;
                try {
                    const response = await phonepeClient.getOrderStatus(orderId);
                    paymentStatus = response;
                    console.log(`   ✓ Status: ${response.state}`);
                } catch (phonepeError) {
                    console.log(`   ⚠️  PhonePe Error: ${phonepeError.message}`);
                    console.log(`   ℹ️  Skipping - cannot verify`);
                    ordersFailed++;
                    ordersChecked++;
                    continue;
                }

                // Check if payment was completed
                if (paymentStatus && paymentStatus.state === "COMPLETED") {
                    console.log(`   ✅ PAID - Updating...`);

                    // Update all tickets for this order
                    for (const ticket of tickets) {
                        try {
                            // Add default profession for old orders (bypass validation)
                            if (!ticket.profession) {
                                ticket.profession = "General"; // Default value for old orders
                                console.log(`      ℹ️  Added default profession for old order`);
                            }

                            // Generate verification code if missing
                            if (!ticket.verificationCode) {
                                ticket.verificationCode = generateVerificationCode();
                            }

                            // Update status and payment details
                            ticket.status = "paid";
                            ticket.paymentId = paymentStatus.transactionId || orderId;
                            ticket.signature = paymentStatus.merchantOrderId || orderId;

                            // Save with validation disabled for old orders
                            await ticket.save({ validateBeforeSave: false });

                            console.log(`      ✓ ${ticket.name} - Code: ${ticket.verificationCode}`);
                            ticketsUpdated++;

                            // Send email
                            try {
                                await sendInvoiceEmail(ticket);
                                console.log(`        ✓ Email sent to ${ticket.email}`);
                                emailsSent++;
                            } catch (emailError) {
                                console.log(`        ✗ Email failed: ${emailError.message}`);
                                emailsFailed++;
                            }
                        } catch (updateError) {
                            console.log(`      ✗ Update failed: ${updateError.message}`);
                            console.log(`      ℹ️  Attempting direct database update...`);

                            // Try direct update bypassing all validation
                            try {
                                await Ticket.updateOne(
                                    { _id: ticket._id },
                                    {
                                        $set: {
                                            status: "paid",
                                            profession: ticket.profession || "General",
                                            verificationCode: ticket.verificationCode || generateVerificationCode(),
                                            paymentId: paymentStatus.transactionId || orderId,
                                            signature: paymentStatus.merchantOrderId || orderId
                                        }
                                    }
                                );

                                // Reload ticket to get updated data
                                const updatedTicket = await Ticket.findById(ticket._id);
                                console.log(`      ✓ Direct update successful - Code: ${updatedTicket.verificationCode}`);
                                ticketsUpdated++;

                                // Send email with updated ticket
                                try {
                                    await sendInvoiceEmail(updatedTicket);
                                    console.log(`        ✓ Email sent to ${updatedTicket.email}`);
                                    emailsSent++;
                                } catch (emailError) {
                                    console.log(`        ✗ Email failed: ${emailError.message}`);
                                    emailsFailed++;
                                }
                            } catch (directUpdateError) {
                                console.log(`      ✗ Direct update also failed: ${directUpdateError.message}`);
                            }
                        }
                    }
                    ordersPaid++;
                } else {
                    console.log(`   ❌ NOT PAID (${paymentStatus?.state || 'UNKNOWN'})`);
                    ordersFailed++;
                }

                ordersChecked++;
            } catch (error) {
                console.log(`   ✗ Error: ${error.message}`);
                ordersFailed++;
                ordersChecked++;
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('📊 MIGRATION COMPLETE');
        console.log('='.repeat(80));
        console.log(`Orders Checked: ${ordersChecked}`);
        console.log(`✅ Paid & Updated: ${ordersPaid}`);
        console.log(`❌ Not Paid/Failed: ${ordersFailed}`);
        console.log(`🎫 Tickets Updated: ${ticketsUpdated}`);
        console.log(`📧 Emails Sent: ${emailsSent}`);
        console.log(`❌ Email Failures: ${emailsFailed}`);
        console.log('='.repeat(80));

        process.exit(0);
    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run migration
console.log('🚀 Old Orders Payment Verification & Migration (v2)');
console.log('='.repeat(80));
console.log('This script will:');
console.log('1. Find all tickets with "created" status');
console.log('2. Check payment status with PhonePe Production API');
console.log('3. Update to "paid" if payment was successful');
console.log('4. Add default profession for old orders (pre-update)');
console.log('5. Generate verification codes for each ticket');
console.log('6. Send confirmation emails to all attendees');
console.log('='.repeat(80));
console.log('\nStarting in 3 seconds... (Press Ctrl+C to cancel)\n');

setTimeout(() => {
    migrateCreatedOrders();
}, 3000);
