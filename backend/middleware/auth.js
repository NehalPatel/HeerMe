import jwt from 'jsonwebtoken';

function getSecret() {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 16) {
    throw new Error('JWT_SECRET must be set to a string of at least 16 characters');
  }
  return s;
}

export function signSessionToken() {
  return jwt.sign({ sub: 'heerme' }, getSecret(), { expiresIn: '7d' });
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const payload = jwt.verify(token, getSecret());
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
