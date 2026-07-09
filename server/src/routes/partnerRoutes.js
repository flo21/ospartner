import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { buildPartnerAnalysis } from '../services/aiAnalysisService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toNull, validate } from '../utils/validation.js';

export const partnerRoutes = Router();

const partnerFields = [
  'name',
  'company',
  'email',
  'phone',
  'address',
  'city',
  'region',
  'status',
  'main_contact',
  'internal_notes',
  'last_exchange_date',
  'health_score',
  'business_priority',
  'estimated_revenue_share'
];

const validators = [
  body('name').optional().notEmpty(),
  body('company').optional().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('status').optional().isIn(['actif', 'suspendu', 'archive']),
  body('health_score').optional().isInt({ min: 0, max: 100 }),
  body('business_priority').optional({ nullable: true }).isIn(['stratégique', 'haute', 'moyenne', 'basse']),
  body('estimated_revenue_share').optional({ nullable: true }).isFloat({ min: 0, max: 100 })
];

partnerRoutes.use(authenticate);

partnerRoutes.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const result = await query('SELECT * FROM partners ORDER BY name');
    res.json(result.rows);
  })
);

partnerRoutes.post(
  '/',
  requireRole('admin'),
  body('name').notEmpty(),
  body('company').notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('status').optional().isIn(['actif', 'suspendu', 'archive']),
  body('business_priority').optional({ nullable: true }).isIn(['stratégique', 'haute', 'moyenne', 'basse']),
  body('estimated_revenue_share').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  validate,
  asyncHandler(async (req, res) => {
    const payload = {
      ...req.body,
      status: req.body.status || 'actif',
      health_score: req.body.health_score ?? 70
    };
    const values = partnerFields.map((field) => toNull(payload[field]));
    const result = await query(
      `INSERT INTO partners (${partnerFields.join(', ')})
       VALUES (${partnerFields.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    res.status(201).json(result.rows[0]);
  })
);

partnerRoutes.get(
  '/:id',
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const id = req.user.role === 'partner' ? req.user.partner_id : req.params.id;
    if (req.user.role === 'partner' && req.params.id !== req.user.partner_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const result = await query('SELECT * FROM partners WHERE id = $1', [id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Partner not found' });
    res.json(result.rows[0]);
  })
);

partnerRoutes.put(
  '/:id',
  param('id').isUUID(),
  validators,
  validate,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'partner' && req.params.id !== req.user.partner_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const allowed = req.user.role === 'partner'
      ? ['email', 'phone', 'address', 'city', 'main_contact']
      : partnerFields;
    const fields = allowed.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!fields.length) return res.status(400).json({ message: 'No fields to update' });
    const values = fields.map((field) => toNull(req.body[field]));
    values.push(req.params.id);
    const result = await query(
      `UPDATE partners SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  })
);

partnerRoutes.delete(
  '/:id',
  requireRole('admin'),
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    await query('DELETE FROM partners WHERE id = $1', [req.params.id]);
    res.status(204).end();
  })
);

partnerRoutes.get(
  '/:id/analysis',
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    if (req.user.role === 'partner' && req.params.id !== req.user.partner_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const partner = await query('SELECT * FROM partners WHERE id = $1', [req.params.id]);
    if (!partner.rowCount) return res.status(404).json({ message: 'Partner not found' });
    const contract = await query('SELECT * FROM contracts WHERE partner_id = $1 ORDER BY start_date DESC LIMIT 1', [req.params.id]);
    const products = await query('SELECT * FROM products WHERE partner_id = $1', [req.params.id]);
    const prices = await query(`
      SELECT pc.* FROM price_checks pc
      JOIN monitored_urls mu ON mu.id = pc.url_id
      JOIN products p ON p.id = mu.product_id
      WHERE p.partner_id = $1
      ORDER BY pc.checked_at DESC LIMIT 20
    `, [req.params.id]);
    const orders = await query('SELECT * FROM orders WHERE partner_id = $1 ORDER BY order_date DESC LIMIT 50', [req.params.id]);
    const invoices = await query('SELECT * FROM invoices WHERE partner_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.id]);
    const analysis = buildPartnerAnalysis({
      partner: partner.rows[0],
      contract: contract.rows[0],
      products: products.rows,
      prices: prices.rows,
      orders: orders.rows,
      invoices: invoices.rows
    });
    await query(
      `INSERT INTO ai_partner_reports
       (partner_id, summary, anomalies, recommendations, renegotiation_opportunities)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, analysis.summary, JSON.stringify(analysis.anomalies), JSON.stringify(analysis.recommendations), JSON.stringify(analysis.renegotiation_opportunities)]
    );
    res.json(analysis);
  })
);
