import { Router } from 'express';
import { param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../utils/validation.js';

export const alertRoutes = Router();
alertRoutes.use(authenticate);

alertRoutes.get('/', asyncHandler(async (req, res) => {
  const filters = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    filters.push(sql.replace('?', `$${params.length}`));
  };
  if (req.user.role === 'partner') add('a.partner_id = ?', req.user.partner_id);
  if (req.query.status) add('a.status = ?', req.query.status);
  if (req.query.severity) add('a.severity = ?', req.query.severity);
  if (req.query.type) add('a.type = ?', req.query.type);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await query(`
    SELECT a.*, p.name AS partner_name, pr.name AS product_name
    FROM alerts a
    LEFT JOIN partners p ON p.id = a.partner_id
    LEFT JOIN products pr ON pr.id = a.product_id
    ${where}
    ORDER BY a.created_at DESC
  `, params);
  res.json(result.rows);
}));

alertRoutes.patch('/:id/resolve', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const params = [req.params.id];
  const ownerClause = req.user.role === 'partner' ? 'AND partner_id = $2' : '';
  if (req.user.role === 'partner') params.push(req.user.partner_id);
  const result = await query(
    `UPDATE alerts SET status = 'traitée', resolved_at = CURRENT_TIMESTAMP
     WHERE id = $1 ${ownerClause}
     RETURNING *`,
    params
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Alert not found' });
  res.json(result.rows[0]);
}));
