// FILE: backend/config/db.js
import mongoose from 'mongoose';

const connectDB = async () => {
  // 1. Optimization for Vercel: Check if already connected
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  const uri = "mongodb+srv://chalananitin161_db_user:Bj2nRmzcON7og2xD@cluster0.accdd74.mongodb.net/startupmela?retryWrites=true&w=majority";

  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    // THROW error instead of process.exit(1)
    // This allows the error middleware in server.js to send a proper 500 response
    throw err;
  }
};

export default connectDB;