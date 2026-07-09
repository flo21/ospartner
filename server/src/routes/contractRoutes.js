import { Router } from 'express';
import multer from 'multer';
import { body, param } from 'express-validator';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toNull, validate } from '../utils/validation.js';

export const contractRoutes = Router();
const upload = multer({ dest: env.uploadDir });

const fields = [
  'partner_id',
  'start_date',
  'end_date',
  'commission_rate',
  'partner_purchase_price',
  'recommended_retail_price',
  'special_terms',
  'cancellation_rules',
  'postponement_rules',
  'exclusivity',
  'status'
];

contractRoutes.use(authenticate, requireRole('admin'));

contractRoutes.get('/', asyncHandler(async (req, res) => {
  const params = [];
  const where = req.query.partner_id ? 'WHERE c.partner_id = $1' : '';
  if (req.query.partner_id) params.push(req.query.partner_id);
  const result = await query(`
    SELECT c.*, p.name AS partner_name
    FROM contracts c
    JOIN partners p ON p.id = c.partner_id
    ${where}
    ORDER BY c.start_date DESC
  `, params);
  res.json(result.rows);
}));

contractRoutes.post(
  '/',
  upload.single('contract_pdf'),
  body('partner_id').isUUID(),
  body('start_date').isISO8601(),
  body('status').optional().isIn(['actif', 'expiré', 'brouillon']),
  validate,
  asyncHandler(async (req, res) => {
    const insertFields = [...fields, 'pdf_path'];
    const values = fields.map((field) => toNull(req.body[field]));
    values.push(req.file?.path || null);
    const result = await query(
      `INSERT INTO contracts (${insertFields.join(', ')})
       VALUES (${insertFields.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    res.status(201).json(result.rows[0]);
  })
);

contractRoutes.put(
  '/:id',
  upload.single('contract_pdf'),
  param('id').isUUID(),
  body('status').optional().isIn(['actif', 'expiré', 'brouillon']),
  validate,
  asyncHandler(async (req, res) => {
    const updateFields = fields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (req.file) updateFields.push('pdf_path');
    const values = updateFields.map((field) => (field === 'pdf_path' ? req.file.path : toNull(req.body[field])));
    values.push(req.params.id);
    const result = await query(
      `UPDATE contracts SET ${updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  })
);

contractRoutes.delete('/:id', param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  await query('DELETE FROM contracts WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));
