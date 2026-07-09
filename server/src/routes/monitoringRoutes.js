import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { runPriceChecks } from '../services/priceMonitorService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toNull, validate } from '../utils/validation.js';

export const monitoringRoutes = Router();

monitoringRoutes.use(authenticate);

monitoringRoutes.get('/urls', asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];
  const add = (sql, value) => {
    params.push(value);
    filters.push(sql.replace('?', `$${params.length}`));
  };
  if (req.user.role === 'partner') add('p.partner_id = ?', req.user.partner_id);
  if (req.user.role === 'admin' && req.query.partner_id) add('p.partner_id = ?', req.query.partner_id);
  if (req.query.product_id) add('mu.product_id = ?', req.query.product_id);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await query(`
    SELECT mu.*, p.name AS product_name, p.partner_id
    FROM monitored_urls mu
    JOIN products p ON p.id = mu.product_id
    ${where}
    ORDER BY mu.updated_at DESC
  `, params);
  res.json(result.rows);
}));

monitoringRoutes.post(
  '/urls',
  requireRole('admin'),
  body('product_id').isUUID(),
  body('url').isURL({ require_protocol: true }),
  body('type').isIn(['partner', '4000m', 'competitor']),
  validate,
  asyncHandler(async (req, res) => {
    const result = await query(
      `INSERT INTO monitored_urls (product_id, label, type, competitor_name, url, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.body.product_id, toNull(req.body.label) || 'Source', req.body.type, toNull(req.body.competitor_name), req.body.url, toNull(req.body.notes)]
    );
    res.status(201).json(result.rows[0]);
  })
);

monitoringRoutes.put(
  '/urls/:id',
  requireRole('admin'),
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const fields = ['url', 'type', 'label', 'competitor_name', 'last_detected_price', 'status', 'notes'].filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    const values = fields.map((field) => toNull(req.body[field]));
    values.push(req.params.id);
    const result = await query(
      `UPDATE monitored_urls SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  })
);

monitoringRoutes.delete('/urls/:id', requireRole('admin'), param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  await query('DELETE FROM monitored_urls WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

monitoringRoutes.get('/price-checks', asyncHandler(async (req, res) => {
  const params = [];
  const filters = [];
  const add = (sql, value) => {
    params.push(value);
    filters.push(sql.replace('?', `$${params.length}`));
  };
  if (req.user.role === 'partner') add('p.partner_id = ?', req.user.partner_id);
  if (req.user.role === 'admin' && req.query.partner_id) add('p.partner_id = ?', req.query.partner_id);
  if (req.query.product_id) add('p.id = ?', req.query.product_id);
  if (req.query.url_id) add('pc.url_id = ?', req.query.url_id);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await query(`
    SELECT pc.*, mu.url, mu.type AS url_type, mu.label, mu.competitor_name, p.name AS product_name, p.partner_id, p.price_4000m
    FROM price_checks pc
    JOIN monitored_urls mu ON mu.id = pc.url_id
    JOIN products p ON p.id = mu.product_id
    ${where}
    ORDER BY pc.checked_at DESC
    LIMIT 200
  `, params);
  res.json(result.rows);
}));

monitoringRoutes.post('/price-checks/run', requireRole('admin'), asyncHandler(async (_req, res) => {
  const checks = await runPriceChecks();
  res.status(201).json({ created: checks.length, checks });
}));
