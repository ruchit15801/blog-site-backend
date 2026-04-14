import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { connectMongo } from '../src/config/mongo.js';
import User from '../src/models/User.model.js';

dotenv.config();

const NEW_PASSWORD = process.argv[2] || 'Ruchit@1415';

async function main() {
  await connectMongo();

  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
  if (!admin) {
    throw new Error('No admin user found');
  }

  admin.passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  await admin.save();

  console.log(`Admin password reset successful for: ${admin.email}`);
}

main()
  .catch((err) => {
    console.error('Password reset failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  });
