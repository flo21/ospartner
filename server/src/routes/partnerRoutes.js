import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  extractAfiflySubdomain,
  getAfiflyAvailability,
  getAfiflyPlannings,
  normalizeAfiflyUrl
} from '../services/afiflyService.js';
import { buildPartnerAnalysis } from '../services/aiAnalysisService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toNull, validate } from '../utils/validation.js';
import { normalizeOptionalUrl } from '../utils/url.js';

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
  'website_url',
  'internal_notes',
  'last_exchange_date',
  'health_score',
  'business_priority',
  'estimated_revenue_share',
  'afifly_url',
  'afifly_subdomain',
  'afifly_default_planning_id'
];

const publicPartnerFields = [
  'id',
  'name',
  'company',
  'email',
  'phone',
  'address',
  'city',
  'region',
  'status',
  'main_contact',
  'website_url',
  'internal_notes',
  'last_exchange_date',
  'health_score',
  'business_priority',
  'estimated_revenue_share',
  'afifly_url',
  'afifly_subdomain',
  'afifly_default_planning_id',
  'created_at',
  'updated_at'
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

function publicPartner(row) {
  if (!row) return row;
  const partner = {};
  for (const field of publicPartnerFields) partner[field] = row[field];
  return partner;
}

function preparePartnerPayload(body) {
  const payload = {
    ...body,
    website_url: normalizeOptionalUrl(body.website_url)
  };
  if (Object.prototype.hasOwnProperty.call(payload, 'afifly_url')) {
    payload.afifly_url = normalizeAfiflyUrl(payload.afifly_url);
    payload.afifly_subdomain = extractAfiflySubdomain(payload.afifly_url);
  }
  return payload;
}

async function loadPartnerForRequest(req) {
  const id = req.user.role === 'partner' ? req.user.partner_id : req.params.id;
  if (req.user.role === 'partner' && req.params.id !== req.user.partner_id) {
    return { error: { status: 403, message: 'Forbidden' } };
  }
  const result = await query('SELECT * FROM partners WHERE id = $1', [id]);
  if (!result.rowCount) return { error: { status: 404, message: 'Partenaire introuvable.' } };
  return { partner: result.rows[0] };
}

partnerRoutes.get(
  '/',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const result = await query('SELECT * FROM partners ORDER BY name');
    res.json(result.rows.map(publicPartner));
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
      ...preparePartnerPayload(req.body),
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
    res.status(201).json(publicPartner(result.rows[0]));
  })
);

partnerRoutes.get(
  '/:id',
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const { partner, error } = await loadPartnerForRequest(req);
    if (error) return res.status(error.status).json({ message: error.message });
    res.json(publicPartner(partner));
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
      ? ['email', 'phone', 'address', 'city', 'main_contact', 'website_url', 'afifly_url', 'afifly_subdomain', 'afifly_default_planning_id']
      : partnerFields;
    const payload = preparePartnerPayload(req.body);
    const fields = allowed.filter((field) => Object.prototype.hasOwnProperty.call(payload, field));
    if (!fields.length) return res.status(400).json({ message: 'No fields to update' });
    const values = fields.map((field) => toNull(payload[field]));
    values.push(req.params.id);
    const result = await query(
      `UPDATE partners SET ${fields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    res.json(publicPartner(result.rows[0]));
  })
);

partnerRoutes.get('/:id/afifly/plannings', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const { partner, error } = await loadPartnerForRequest(req);
  if (error) return res.status(error.status).json({ message: error.message });
  try {
    res.json(await getAfiflyPlannings(partner));
  } catch (err) {
    res.status(err.status || 502).json({ message: err.message || 'Erreur Afifly.' });
  }
}));

partnerRoutes.get('/:id/afifly/availability', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  const { partner, error } = await loadPartnerForRequest(req);
  if (error) return res.status(error.status).json({ message: error.message });
  const { from, to } = req.query;
  const planningId = req.query.planning_id;
  if (!planningId) {
    return res.status(400).json({ message: 'planning_id obligatoire' });
  }
  if (!from || !to) {
    return res.status(400).json({ message: 'Paramètres Afifly manquants: from et to sont requis.' });
  }
  try {
    const data = await getAfiflyAvailability(partner, { from, to, planningId });
    console.log('[Afifly API response to frontend]', {
      isArray: Array.isArray(data),
      count: Array.isArray(data) ? data.length : null,
      firstObject: Array.isArray(data) ? data[0] : null
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 502).json({ message: err.message || 'Erreur Afifly.' });
  }
}));

partnerRoutes.delete(
  '/:id',
  requireRole('admin'),
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const partner = await query('SELECT id, name FROM partners WHERE id = $1', [req.params.id]);
    if (!partner.rowCount) {
      return res.status(404).json({ message: 'Partenaire introuvable.' });
    }

    try {
      await query('DELETE FROM users WHERE partner_id = $1', [req.params.id]);
      await query('DELETE FROM crm_cards WHERE partner_id = $1', [req.params.id]);
      await query('DELETE FROM tasks WHERE partner_id = $1', [req.params.id]);
      await query('DELETE FROM partners WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error(`Failed to delete partner ${req.params.id}`, error);
      res.status(409).json({
        message: 'Impossible de supprimer ce partenaire car des données liées bloquent la suppression.'
      });
    }
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
