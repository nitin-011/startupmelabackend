// Detailed check of all paid orders
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

async function checkAllOrders() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all paid tickets
        const paidTickets = await Ticket.find({ status: 'paid' })
            .sort({ createdAt: -1 });

        console.log(`📊 Total Paid Tickets: ${paidTickets.length}\n`);
        console.log('='.repeat(80));

        // Group by order ID to show grouped bookings
        const orderGroups = {};
        paidTickets.forEach(ticket => {
            if (!orderGroups[ticket.orderId]) {
                orderGroups[ticket.orderId] = [];
            }
            orderGroups[ticket.orderId].push(ticket);
        });

        console.log(`📦 Total Orders: ${Object.keys(orderGroups).length}\n`);

        // Display each order
        Object.entries(orderGroups).forEach(([orderId, tickets], index) => {
            const isTestOrder = orderId.startsWith('TEST');
            const orderType = isTestOrder ? '🧪 TEST' : '💳 PROD';

            console.log(`${index + 1}. ${orderType} Order: ${orderId}`);
            console.log(`   Date: ${tickets[0].createdAt.toLocaleString('en-IN')}`);
            console.log(`   Tickets: ${tickets.length}`);
            console.log(`   Total Amount: ₹${tickets[0].amount.toLocaleString('en-IN')}`);

            tickets.forEach((ticket, i) => {
                console.log(`   ${i + 1}. ${ticket.name} (${ticket.email})`);
                console.log(`      Code: ${ticket.verificationCode || '❌ MISSING'}`);
                console.log(`      Type: ${ticket.itemType === 'pass' ? ticket.passType : ticket.stallType}`);
                console.log(`      Checked In: ${ticket.checkedIn ? '✅ Yes' : '❌ No'}`);
            });
            console.log('');
        });

        console.log('='.repeat(80));
        console.log('\n📊 Summary:');
        console.log(`   Total Orders: ${Object.keys(orderGroups).length}`);
        console.log(`   Total Tickets: ${paidTickets.length}`);
        console.log(`   Test Orders: ${Object.keys(orderGroups).filter(id => id.startsWith('TEST')).length}`);
        console.log(`   Production Orders: ${Object.keys(orderGroups).filter(id => !id.startsWith('TEST')).length}`);

        const ticketsWithCodes = paidTickets.filter(t => t.verificationCode).length;
        const ticketsWithoutCodes = paidTickets.filter(t => !t.verificationCode).length;

        console.log(`   ✅ Tickets with codes: ${ticketsWithCodes}`);
        console.log(`   ❌ Tickets without codes: ${ticketsWithoutCodes}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkAllOrders();
