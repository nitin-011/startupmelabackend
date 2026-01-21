
import { StandardCheckoutClient, Env } from "pg-sdk-node";
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';
import { sendInvoiceEmail } from '../utils/sendEmails.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

// PhonePe Config
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const CLIENT_ID = IS_PRODUCTION
    ? process.env.PHONEPE_PROD_MERCHANT_ID
    : process.env.PHONEPE_DEV_MERCHANT_ID;

const CLIENT_SECRET = IS_PRODUCTION
    ? process.env.PHONEPE_PROD_SALT_KEY
    : process.env.PHONEPE_DEV_SALT_KEY;

const CLIENT_VERSION = IS_PRODUCTION
    ? parseInt(process.env.PHONEPE_PROD_SALT_INDEX)
    : parseInt(process.env.PHONEPE_DEV_SALT_INDEX);

console.log('🔐 PhonePe Configuration:');
console.log('   Environment:', IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT');
console.log('   Client ID:', CLIENT_ID);

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Missing PhonePe Credentials');
    process.exit(1);
}

// Initialize PhonePe Client
const phonepeClient = StandardCheckoutClient.getInstance(
    CLIENT_ID,
    CLIENT_SECRET,
    CLIENT_VERSION,
    IS_PRODUCTION ? Env.PRODUCTION : Env.PRODUCTION // SDK uses PRODUCTION for both in this specific setup if I recall correctly from paymentController
);

const generateVerificationCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

async function verifyPendingOrders() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all tickets with "created" status
        const createdTickets = await Ticket.find({ status: 'created' });

        console.log(`📊 Found ${createdTickets.length} tickets with "created" status\n`);

        if (createdTickets.length === 0) {
            console.log('✅ No pending tickets found!');
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

        for (const [orderId, tickets] of Object.entries(orderGroups)) {
            console.log(`\n🔍 Order ${ordersChecked + 1}/${Object.keys(orderGroups).length}: ${orderId}`);
            console.log(`   Tickets: ${tickets.length}`);
            console.log(`   Contact: ${tickets[0].name} (${tickets[0].email})`);

            try {
                // Check payment status with PhonePe
                console.log(`   📞 Verifying with PhonePe...`);

                let paymentStatus;
                try {
                    paymentStatus = await phonepeClient.getOrderStatus(orderId);
                    console.log(`   ✓ Status: ${paymentStatus.state}`);
                } catch (phonepeError) {
                    console.log(`   ⚠️  PhonePe Error: ${phonepeError.message}`);
                    ordersFailed++;
                    ordersChecked++;
                    continue;
                }

                if (paymentStatus && paymentStatus.state === "COMPLETED") {
                    console.log(`   ✅ PAID - Updating tickets...`);

                    for (const ticket of tickets) {
                        // Generate verification code if missing
                        if (!ticket.verificationCode) {
                            ticket.verificationCode = generateVerificationCode();
                        }

                        // Update status
                        ticket.status = "paid";
                        ticket.paymentId = paymentStatus.transactionId || orderId;
                        ticket.signature = paymentStatus.merchantOrderId || orderId;

                        // Ensure profession is set if missing (fallback)
                        if (!ticket.profession) ticket.profession = "General";

                        await ticket.save({ validateBeforeSave: false });
                        ticketsUpdated++;
                        console.log(`      ✓ Updated ${ticket.name}`);

                        // Send email
                        try {
                            await sendInvoiceEmail(ticket);
                            console.log(`        ✓ Email sent to ${ticket.email}`);
                            emailsSent++;
                        } catch (emailError) {
                            console.log(`        ✗ Email failed: ${emailError.message}`);
                        }
                    }
                    ordersPaid++;
                } else {
                    console.log(`   ❌ NOT PAID (${paymentStatus?.state || 'UNKNOWN'})`);
                    // Optionally we could mark as 'failed' here, but keeping as created permits retry
                    ordersFailed++;
                }

            } catch (error) {
                console.log(`   ✗ Error processing order: ${error.message}`);
                ordersFailed++;
            }
            ordersChecked++;
        }

        console.log('\n' + '='.repeat(80));
        console.log('📊 VERIFICATION COMPLETE');
        console.log(`Orders Checked: ${ordersChecked}`);
        console.log(`✅ Paid & Updated: ${ordersPaid}`);
        console.log(`🎫 Tickets Recovered: ${ticketsUpdated}`);
        console.log('='.repeat(80));

        process.exit(0);
    } catch (error) {
        console.error('❌ Fatal Error:', error);
        process.exit(1);
    }
}

verifyPendingOrders();
