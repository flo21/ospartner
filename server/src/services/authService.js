import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { signToken } from '../utils/jwt.js';

export async function login(email, password) {
  const result = await query(
    'SELECT id, email, password_hash, role, partner_id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  if (!result.rowCount) return null;

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  const token = signToken({ sub: user.id, role: user.role });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      partner_id: user.partner_id
    }
  };
}
