/**
 * One-time: set status=conducted on lectures that predate the status field.
 * Run: node scripts/markExistingLecturesConducted.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import AcademicLecture from '../models/AcademicLecture.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/heerme';

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const filter = {
    $or: [{ status: { $exists: false } }, { status: null }, { status: '' }]
  };

  const toUpdate = await AcademicLecture.countDocuments(filter);
  if (!toUpdate) {
    console.log('No legacy lectures to update (all already have a status).');
    await mongoose.disconnect();
    return;
  }

  const result = await AcademicLecture.updateMany(filter, {
    $set: { status: 'conducted', updatedAt: new Date() }
  });

  console.log(`Marked ${result.modifiedCount} lecture(s) as conducted (of ${toUpdate} matched).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
