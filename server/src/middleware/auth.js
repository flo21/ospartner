import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyToken } from '../utils/jwt.js';

function maskToken(token) {
  if (!token) return 'none';
  if (token.length <= 16) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

function rejectAuth(res, reason, statusMessage = 'Invalid token') {
  console.warn(`[auth] rejected: ${reason}`);
  return res.status(401).json({ message: statusMessage, reason });
}

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const hasBearer = header.startsWith('Bearer ');
  const token = hasBearer ? header.slice(7) : req.query.token || null;
  console.info(`[auth] ${req.method} ${req.originalUrl} token=${maskToken(token)} source=${hasBearer ? 'authorization' : req.query.token ? 'query' : 'missing'}`);

  if (header && !hasBearer) return rejectAuth(res, 'malformed_authorization_header');
  if (!token) return rejectAuth(res, 'missing_token', 'Missing bearer token');

  try {
    const payload = verifyToken(token);
    const user = await query(
      'SELECT id, email, role, partner_id FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!user.rowCount) return rejectAuth(res, 'user_not_found');
    req.user = user.rows[0];
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return rejectAuth(res, 'token_expired');
    if (error.name === 'JsonWebTokenError') return rejectAuth(res, `jwt_${error.message.replaceAll(' ', '_')}`);
    return rejectAuth(res, 'token_verification_failed');
  }
});

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}
