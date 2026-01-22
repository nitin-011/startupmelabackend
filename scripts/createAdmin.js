// Admin Seeding Script
// Run this once to create the first admin user
// Usage: node scripts/createAdmin.js
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Admin from '../model/Admin.js';


const MONGODB_URI = process.env.MONGO_URI;

async function createAdmin() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Admin credentials
        const adminData = {
            email: 'sethitanu111@gmail.com',
            password: 'Tanu@123..', // Change this to a secure password
            name: 'Tanu Sethi',
            role: 'superadmin'
        };

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ email: adminData.email });
        if (existingAdmin) {
            console.log('❌ Admin already exists with email:', adminData.email);
            process.exit(0);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(adminData.password, 10);

        // Create admin
        const admin = await Admin.create({
            email: adminData.email,
            password: hashedPassword,
            name: adminData.name,
            role: adminData.role
        });

        console.log('✅ Admin created successfully!');
        console.log('📧 Email:', admin.email);
        console.log('🔑 Password:', adminData.password);
        console.log('⚠️  Please change the password after first login!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin:', error);
        process.exit(1);
    }
}

createAdmin();
