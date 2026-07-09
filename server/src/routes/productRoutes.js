import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { syncProductOfferAnomalies } from '../services/offerControlService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { toNull, validate } from '../utils/validation.js';

export const productRoutes = Router();

const fields = [
  'partner_id',
  'contract_id',
  'name',
  'type',
  'description',
  'partner_public_price',
  'partner_purchase_price',
  'price_4000m',
  'is_listed_on_4000m',
  'listing_status',
  'min_margin_rate',
  'margin_exception_accepted',
  'margin_exception_reason',
  'status',
  'valid_from',
  'valid_to',
  'notes'
];

productRoutes.use(authenticate);

productRoutes.get('/', asyncHandler(async (req, res) => {
  const params = [];
  let where = '';
  if (req.user.role === 'partner') {
    params.push(req.user.partner_id);
    where = 'WHERE p.partner_id = $1 AND p.status = \'actif\'';
  } else if (req.query.partner_id) {
    params.push(req.query.partner_id);
    where = 'WHERE p.partner_id = $1';
  }
  const result = await query(`
    SELECT p.*, partners.name AS partner_name
    FROM products p
    JOIN partners ON partners.id = p.partner_id
    ${where}
    ORDER BY p.name
  `, params);

  const rows = req.user.role === 'partner'
    ? result.rows.map(({ margin_amount, margin_rate, ...product }) => product)
    : result.rows;
  res.json(rows);
}));

productRoutes.post(
  '/',
  requireRole('admin'),
  body('partner_id').isUUID(),
  body('name').notEmpty(),
  body('type').isIn(['tandem', 'option vidéo', 'altitude spécifique', 'bon cadeau', 'promotion']),
  body('price_4000m').optional({ nullable: true }).isFloat({ min: 0 }),
  body('partner_public_price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('partner_purchase_price').isFloat({ min: 0 }),
  validate,
  asyncHandler(async (req, res) => {
    const values = fields.map((field) => toNull(req.body[field]));
    const result = await query(
      `INSERT INTO products (${fields.join(', ')})
       VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    await syncProductOfferAnomalies(result.rows[0].id);
    const synced = await query('SELECT * FROM products WHERE id = $1', [result.rows[0].id]);
    res.status(201).json(synced.rows[0]);
  })
);

productRoutes.put(
  '/:id',
  requireRole('admin'),
  param('id').isUUID(),
  validate,
  asyncHandler(async (req, res) => {
    const updateFields = fields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!updateFields.length) return res.status(400).json({ message: 'Aucun champ produit à mettre à jour.' });
    const values = updateFields.map((field) => toNull(req.body[field]));
    values.push(req.params.id);
    const result = await query(
      `UPDATE products SET ${updateFields.map((field, index) => `${field} = $${index + 1}`).join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    if (!result.rowCount) return res.status(404).json({ message: 'Produit introuvable.' });
    await syncProductOfferAnomalies(result.rows[0].id);
    const synced = await query('SELECT * FROM products WHERE id = $1', [result.rows[0].id]);
    res.json(synced.rows[0]);
  })
);

productRoutes.delete('/:id', requireRole('admin'), param('id').isUUID(), validate, asyncHandler(async (req, res) => {
  await query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));
