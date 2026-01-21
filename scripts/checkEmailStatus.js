
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

async function checkEmailStatus() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const email = 'chetanmittal991@gmail.com';
        console.log(`🔍 Searching for tickets with email: ${email}`);

        // Case-insensitive search
        const tickets = await Ticket.find({
            email: { $regex: new RegExp(`^${email}$`, 'i') }
        }).sort({ createdAt: -1 });

        if (tickets.length === 0) {
            console.log('❌ No tickets found for this email.');
        } else {
            console.log(`📊 Found ${tickets.length} tickets:\n`);
            tickets.forEach((t, i) => {
                console.log(`${i + 1}. Status: ${t.status.toUpperCase()}`);
                console.log(`   Order ID: ${t.orderId}`);
                console.log(`   Type: ${t.itemType} (${t.itemType === 'pass' ? t.passType : t.stallType})`);
                console.log(`   Amount: ${t.amount}`);
                console.log(`   Created: ${t.createdAt.toLocaleString('en-IN')}`);
                if (t.verificationCode) console.log(`   Code: ${t.verificationCode}`);
                if (t.paymentId) console.log(`   Payment ID: ${t.paymentId}`);
                console.log('---');
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkEmailStatus();
