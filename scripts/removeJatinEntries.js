import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ticket from '../model/Ticket.js';
import PendingTicket from '../model/PendingTicket.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI;

async function removeJatinEntries() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGO_URI is not set in environment variables');
        }

        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const query = {
            name: /^\s*anvi\s*$/i,
            itemType: { $in: ['pass', 'stall'] },
        };

        const ticketCount = await Ticket.countDocuments(query);
        const pendingTicketCount = await PendingTicket.countDocuments(query);

        console.log('📊 Matching records found:');
        console.log(`   Ticket collection: ${ticketCount}`);
        console.log(`   PendingTicket collection: ${pendingTicketCount}`);

        if (ticketCount === 0 && pendingTicketCount === 0) {
            console.log('\n✅ No matching entries found. Nothing to delete.');
            process.exit(0);
        }

        const [ticketDeleteResult, pendingDeleteResult] = await Promise.all([
            Ticket.deleteMany(query),
            PendingTicket.deleteMany(query),
        ]);

        console.log('\n🗑️ Deletion completed:');
        console.log(`   Deleted from Ticket: ${ticketDeleteResult.deletedCount}`);
        console.log(
            `   Deleted from PendingTicket: ${pendingDeleteResult.deletedCount}`,
        );
        console.log(
            `   Total deleted: ${ticketDeleteResult.deletedCount + pendingDeleteResult.deletedCount}`,
        );

        process.exit(0);
    } catch (error) {
        console.error('❌ Error removing entries:', error.message);
        process.exit(1);
    }
}

removeJatinEntries();
