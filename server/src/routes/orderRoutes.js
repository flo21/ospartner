import { Router } from 'express';
import { body } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toNull, validate } from '../utils/validation.js';

export const orderRoutes = Router();
const fields = ['partner_id', 'product_id', 'client_name', 'client_email', 'order_date', 'jump_date', 'status', 'sale_price_ttc', 'sale_price_ht', 'partner_price_ht', 'commission_4000m_ht', 'gross_margin_ht', 'source'];

orderRoutes.use(authenticate);

orderRoutes.get('/', asyncHandler(async (req, res) => {
  const filters = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    filters.push(sql.replace('?', `$${params.length}`));
  };
  if (req.user.role === 'partner') add('o.partner_id = ?', req.user.partner_id);
  if (req.user.role === 'admin' && req.query.partner_id) add('o.partner_id = ?', req.query.partner_id);
  if (req.query.status) add('o.status = ?', req.query.status);
  if (req.query.product_id) add('o.product_id = ?', req.query.product_id);
  if (req.query.source) add('o.source = ?', req.query.source);
  if (req.query.from) add('o.order_date >= ?', req.query.from);
  if (req.query.to) add('o.order_date <= ?', req.query.to);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await query(`
    SELECT o.*, p.name AS product_name, partners.name AS partner_name
    FROM orders o
    JOIN products p ON p.id = o.product_id
    JOIN partners ON partners.id = o.partner_id
    ${where}
    ORDER BY o.order_date DESC
  `, params);
  const rows = req.user.role === 'partner'
    ? result.rows.map(({ gross_margin_ht, commission_4000m_ht, ...order }) => order)
    : result.rows;
  res.json(rows);
}));

orderRoutes.get('/unbilled-consumed', requireRole('partner'), asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT o.*, p.name AS product_name
    FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.partner_id = $1 AND o.status = 'consommé' AND o.invoice_id IS NULL
    ORDER BY o.jump_date IS NULL, o.jump_date DESC
  `, [req.user.partner_id]);
  res.json(result.rows.map(({ gross_margin_ht, commission_4000m_ht, ...order }) => order));
}));

orderRoutes.post(
  '/',
  requireRole('admin'),
  body('partner_id').isUUID(),
  body('product_id').isUUID(),
  body('client_email').isEmail(),
  validate,
  asyncHandler(async (req, res) => {
    const values = fields.map((field) => toNull(req.body[field]));
    const result = await query(
      `INSERT INTO orders (${fields.join(', ')})
       VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    res.status(201).json(result.rows[0]);
  })
);
