// Quick script to check database for test orders
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

async function checkDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Count all tickets
        const totalTickets = await Ticket.countDocuments();
        console.log(`📊 Total tickets in database: ${totalTickets}`);

        // Count test tickets
        const testTickets = await Ticket.countDocuments({ orderId: /^TEST/ });
        console.log(`🧪 Test tickets: ${testTickets}`);

        // Count paid tickets
        const paidTickets = await Ticket.countDocuments({ status: 'paid' });
        console.log(`✅ Paid tickets: ${paidTickets}`);

        // Show last 5 tickets
        console.log('\n📋 Last 5 tickets created:\n');
        const recentTickets = await Ticket.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name email orderId status verificationCode createdAt');

        recentTickets.forEach((ticket, index) => {
            console.log(`${index + 1}. ${ticket.name}`);
            console.log(`   Email: ${ticket.email}`);
            console.log(`   Order ID: ${ticket.orderId}`);
            console.log(`   Status: ${ticket.status}`);
            console.log(`   Code: ${ticket.verificationCode}`);
            console.log(`   Created: ${ticket.createdAt.toLocaleString()}`);
            console.log('');
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkDatabase();
