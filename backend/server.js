import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import remindersRouter from './routes/reminders.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/reminders', remindersRouter);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/heerme';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`HeerMe API running on http://localhost:${PORT}`));
