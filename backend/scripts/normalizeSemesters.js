import 'dotenv/config';
import mongoose from 'mongoose';
import AcademicLecture from '../models/AcademicLecture.js';
import SessionPlan from '../models/SessionPlan.js';

const TARGET = 'SEM-5';
const LEGACY_VALUES = ['SEM-5', 'SEM 5', 'SEM5'];

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/heerme';

async function normalizeCollection(Model, label) {
  const filter = { semester: { $in: LEGACY_VALUES.filter((v) => v !== TARGET) } };
  const toUpdate = await Model.find(filter).select('_id semester').lean();
  if (!toUpdate.length) {
    console.log(`${label}: no records to update`);
    return 0;
  }

  const result = await Model.updateMany(filter, { $set: { semester: TARGET } });
  console.log(`${label}: updated ${result.modifiedCount} record(s)`);
  for (const doc of toUpdate) {
    console.log(`  ${doc._id}: "${doc.semester}" -> "${TARGET}"`);
  }
  return result.modifiedCount;
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const lectureCount = await normalizeCollection(AcademicLecture, 'AcademicLecture');
  const planCount = await normalizeCollection(SessionPlan, 'SessionPlan');

  console.log(`Done. Total updated: ${lectureCount + planCount}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
