import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import remindersRouter from './routes/reminders.js';
import attendanceRouter from './routes/attendance.js';
import exportRouter from './routes/export.js';
import academicLecturesRouter from './routes/academicLectures.js';
import sessionPlansRouter from './routes/sessionPlans.js';
import authRouter from './routes/auth.js';
import requireAuth, { assertAuthEnv } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

assertAuthEnv();

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

app.use(helmet({
  // API-only: do not force CORP that can break cross-origin blob downloads.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

function parseCorsOrigins() {
  const raw = (process.env.CORS_ORIGIN || '').trim();
  if (!raw) return null;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const corsOrigins = parseCorsOrigins();
app.use(cors({
  origin: corsOrigins && corsOrigins.length > 0
    ? (origin, cb) => {
        // Allow non-browser / same-server tools with no Origin header.
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      }
    : true,
  exposedHeaders: ['Content-Disposition']
}));

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

app.get('/api/health', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  const payload = {
    status: dbReady ? 'ok' : 'degraded',
    db: dbReady ? 'connected' : 'disconnected'
  };
  res.status(dbReady ? 200 : 503).json(payload);
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => console.log(`HeerMe API running on http://localhost:${PORT}`));
