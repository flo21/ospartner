import { Router } from 'express';
import { body, param } from 'express-validator';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../utils/validation.js';

export const invoiceRoutes = Router();
invoiceRoutes.use(authenticate);

invoiceRoutes.get('/', asyncHandler(async (req, res) => {
  const params = [];
  let where = '';
  if (req.user.role === 'partner') params.push(req.user.partner_id);
  if (req.user.role === 'partner') {
    where = 'WHERE i.partner_id = $1';
  } else if (req.query.partner_id) {
    params.push(req.query.partner_id);
    where = 'WHERE i.partner_id = $1';
  }
  const result = await query(`
    SELECT i.*, p.name AS partner_name
    FROM invoices i
    JOIN partners p ON p.id = i.partner_id
    ${where}
    ORDER BY i.created_at DESC
  `, params);
  res.json(result.rows);
}));

invoiceRoutes.post(
  '/',
  requireRole('partner'),
  body('period_start').isISO8601(),
  body('period_end').isISO8601(),
  body('order_ids').isArray({ min: 1 }),
  validate,
  asyncHandler(async (req, res) => {
    try {
      await query('BEGIN');
      const placeholders = req.body.order_ids.map((_, index) => `$${index + 2}`).join(', ');
      const orders = await query(
        `SELECT o.*, p.name AS product_name
         FROM orders o
         JOIN products p ON p.id = o.product_id
         WHERE o.partner_id = $1 AND o.status = 'consommé' AND o.invoice_id IS NULL AND o.id IN (${placeholders})`,
        [req.user.partner_id, ...req.body.order_ids]
      );
      if (!orders.rowCount) {
        await query('ROLLBACK');
        return res.status(400).json({ message: 'No billable consumed orders found' });
      }
      const amountHt = orders.rows.reduce((sum, order) => sum + Number(order.partner_price_ht), 0);
      const commission = orders.rows.reduce((sum, order) => sum + Number(order.commission_4000m_ht), 0);
      const vat = Number((amountHt * 0.2).toFixed(2));
      const amountTtc = Number((amountHt + vat).toFixed(2));
      const invoice = await query(
        `INSERT INTO invoices
          (partner_id, period_start, period_end, status, amount_ht, vat, amount_ttc, commission_4000m, partner_net_amount, submitted_at)
         VALUES ($1, $2, $3, 'soumis', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         RETURNING *`,
        [req.user.partner_id, req.body.period_start, req.body.period_end, amountHt, vat, amountTtc, commission, amountHt]
      );
      for (const order of orders.rows) {
        await query(
          `INSERT INTO invoice_lines (invoice_id, order_id, product_id, description, quantity, unit_price_ht, amount_ht)
           VALUES ($1, $2, $3, $4, 1, $5, $5)`,
          [invoice.rows[0].id, order.id, order.product_id, order.product_name, order.partner_price_ht]
        );
      }
      const updatePlaceholders = req.body.order_ids.map((_, index) => `$${index + 2}`).join(', ');
      await query(`UPDATE orders SET invoice_id = $1 WHERE id IN (${updatePlaceholders})`, [invoice.rows[0].id, ...req.body.order_ids]);
      await query('COMMIT');
      res.status(201).json(invoice.rows[0]);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  })
);

invoiceRoutes.patch('/:id/status', requireRole('admin'), param('id').isUUID(), body('status').isIn(['validé', 'payé', 'rejeté']), validate, asyncHandler(async (req, res) => {
  const dateField = req.body.status === 'validé' ? 'validated_at' : req.body.status === 'payé' ? 'paid_at' : null;
  const result = await query(
    `UPDATE invoices
     SET status = $1, ${dateField ? `${dateField} = CURRENT_TIMESTAMP,` : ''} updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [req.body.status, req.params.id]
  );
  res.json(result.rows[0]);
}));
