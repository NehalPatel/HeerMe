import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { signSessionToken, verifySessionToken } from '../middleware/auth.js';

const router = express.Router();

const PIN_REGEX = /^\d{6}$/;

function getExpectedPin() {
  const p = process.env.HEERME_PIN || '';
  if (!PIN_REGEX.test(p)) {
    throw new Error('HEERME_PIN must be set to exactly 6 digits');
  }
  return p;
}

function timingSafePinEqual(attempt, expected) {
  const a = Buffer.from(attempt, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Try again in about 15 minutes.' }
});

router.post('/login', loginLimiter, (req, res) => {
  let expected;
  try {
    expected = getExpectedPin();
  } catch (e) {
    console.error('Auth misconfiguration:', e.message);
    return res.status(503).json({ error: 'Server login is not configured' });
  }

  const raw = req.body && req.body.pin;
  const pin = typeof raw === 'string' ? raw.trim() : '';
  if (!PIN_REGEX.test(pin)) {
    return res.status(401).json({ error: 'PIN must be exactly 6 digits' });
  }

  if (!timingSafePinEqual(pin, expected)) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  const token = signSessionToken();
  return res.json({ token });
});

router.get('/session', (req, res) => {
  const hdr = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(hdr);
  const token = m ? m[1].trim() : '';
  if (!verifySessionToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ ok: true });
});

export default router;
