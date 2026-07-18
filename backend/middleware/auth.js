import jwt from 'jsonwebtoken';
import { isSixDigitPin } from '../utils/validation.js';

export function assertAuthEnv() {
  const pin = process.env.HEERME_PIN || '';
  if (!isSixDigitPin(pin)) {
    throw new Error('HEERME_PIN must be set to exactly 6 digits');
  }
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 16) {
    throw new Error('JWT_SECRET must be set to a string of at least 16 characters');
  }
}

function getSecret() {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 16) {
    throw new Error('JWT_SECRET must be set to a string of at least 16 characters');
  }
  return s;
}

export function signSessionToken() {
  return jwt.sign({ sub: 'heerme' }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: '7d'
  });
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
    if (payload?.sub !== 'heerme') return null;
    return payload;
  } catch {
    return null;
  }
}

export default function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(hdr);
  const token = m ? m[1].trim() : '';
  if (!verifySessionToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
