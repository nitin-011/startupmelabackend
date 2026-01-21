
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

async function deleteCreatedTickets() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find count first
        const count = await Ticket.countDocuments({ status: 'created' });
        console.log(`📊 Found ${count} tickets with 'created' status.`);

        if (count === 0) {
            console.log('✅ No tickets to delete.');
            process.exit(0);
        }

        console.log('🗑️  Deleting tickets...');

        const result = await Ticket.deleteMany({ status: 'created' }); // Using deleteMany for all matching documents

        console.log(`✅ Deleted ${result.deletedCount} tickets.`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

deleteCreatedTickets();
