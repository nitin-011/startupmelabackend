/**
 * One-off migration: widen the PendingTicket TTL from 15 minutes to 2 hours.
 *
 * MongoDB will not change expireAfterSeconds on an index that already exists —
 * re-declaring it in the schema raises IndexOptionsConflict (code 85) instead.
 * This uses collMod to alter the existing index in place, which is safe and
 * does not drop or rebuild anything.
 *
 * Run once per environment (local, staging, production):
 *   node scripts/updatePendingTicketTTL.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_SECONDS = 7200; // must match model/PendingTicket.js
const INDEX_NAME = 'createdAt_1';
const COLLECTION = 'pendingtickets';

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection(COLLECTION);

  const indexes = await collection.indexes();
  const ttlIndex = indexes.find((i) => i.name === INDEX_NAME);

  if (!ttlIndex) {
    console.log(`ℹ️ No ${INDEX_NAME} index found — creating it with the new TTL.`);
    await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: TARGET_SECONDS });
    console.log(`✅ Created ${INDEX_NAME} with expireAfterSeconds=${TARGET_SECONDS}`);
    await mongoose.disconnect();
    return;
  }

  console.log(`📊 Current expireAfterSeconds: ${ttlIndex.expireAfterSeconds}`);

  if (ttlIndex.expireAfterSeconds === TARGET_SECONDS) {
    console.log('✅ Already at the target TTL — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  await db.command({
    collMod: COLLECTION,
    index: { name: INDEX_NAME, expireAfterSeconds: TARGET_SECONDS },
  });

  const updated = (await collection.indexes()).find((i) => i.name === INDEX_NAME);
  console.log(`✅ Updated expireAfterSeconds: ${ttlIndex.expireAfterSeconds} → ${updated.expireAfterSeconds}`);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
