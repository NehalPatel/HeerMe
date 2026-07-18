import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import remindersRouter from './routes/reminders.js';
import attendanceRouter from './routes/attendance.js';
import exportRouter from './routes/export.js';
import academicLecturesRouter from './routes/academicLectures.js';
import sessionPlansRouter from './routes/sessionPlans.js';
import authRouter from './routes/auth.js';
import requireAuth from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

// Expose Content-Disposition so cross-origin clients (Vercel → Render) can read download filenames.
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/reminders', requireAuth, remindersRouter);
app.use('/api/attendance', requireAuth, attendanceRouter);
app.use('/api/export', requireAuth, exportRouter);
app.use('/api/academic-lectures', requireAuth, academicLecturesRouter);
app.use('/api/session-plans', requireAuth, sessionPlansRouter);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/heerme';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`HeerMe API running on http://localhost:${PORT}`));
