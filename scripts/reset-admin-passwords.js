import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../src/models/User.model.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const newPassword = 'Admin@12345!';
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const result = await User.updateMany(
    { role: 'admin' },
    { $set: { passwordHash, authProvider: 'local' } }
  );

  console.log(JSON.stringify({
    matched: result.matchedCount,
    modified: result.modifiedCount,
    password: newPassword,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  });
