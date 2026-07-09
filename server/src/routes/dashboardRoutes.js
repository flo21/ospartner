import { Router } from 'express';
import { query } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate, requireRole('admin'));

async function getOfferControlRows() {
  const result = await query(`
    SELECT
      p.id,
      p.name AS partner_name,
      p.region,
      p.business_priority,
      p.estimated_revenue_share,
      (SELECT COUNT(*) FROM products pr WHERE pr.partner_id = p.id) AS products_count,
      (SELECT COUNT(*) FROM products pr WHERE pr.partner_id = p.id AND pr.is_listed_on_4000m = 1) AS listed_count,
      (
        SELECT COUNT(*)
        FROM products pr
        WHERE pr.partner_id = p.id
          AND (
            pr.is_listed_on_4000m = 0
            OR pr.listing_status = 'à_référencer'
            OR pr.listing_status = 'a_referencer'
            OR (pr.status = 'actif' AND pr.price_4000m IS NULL)
          )
      ) AS unlisted_count,
      CASE
        WHEN (SELECT COUNT(*) FROM products pr WHERE pr.partner_id = p.id) = 0 THEN 0
        ELSE ROUND(
          ((SELECT COUNT(*) FROM products pr WHERE pr.partner_id = p.id AND pr.is_listed_on_4000m = 1) * 100.0) /
          (SELECT COUNT(*) FROM products pr WHERE pr.partner_id = p.id),
          2
        )
      END AS coverage_rate,
      COALESCE((SELECT AVG(pr.margin_rate) FROM products pr WHERE pr.partner_id = p.id AND pr.margin_rate IS NOT NULL), 0) AS average_margin_rate,
      COALESCE((SELECT SUM(o.sale_price_ht) FROM orders o WHERE o.partner_id = p.id), 0) AS revenue_ht,
      (SELECT MAX(mu.last_checked_at) FROM monitored_urls mu JOIN products pr ON pr.id = mu.product_id WHERE pr.partner_id = p.id) AS last_checked_at,
      (
        SELECT COUNT(*)
        FROM products pr
        WHERE pr.partner_id = p.id
          AND (
            pr.is_listed_on_4000m = 0
            OR pr.listing_status = 'à_référencer'
            OR (pr.status = 'actif' AND pr.price_4000m IS NULL)
            OR (pr.price_4000m IS NOT NULL AND pr.partner_public_price IS NOT NULL AND pr.partner_public_price < pr.price_4000m)
            OR (
              pr.is_listed_on_4000m = 1
              AND pr.price_4000m IS NOT NULL
              AND pr.partner_purchase_price IS NOT NULL
              AND pr.margin_rate IS NOT NULL
              AND pr.margin_rate < 15
              AND COALESCE(pr.margin_exception_accepted, 0) = 0
            )
            OR EXISTS (
              SELECT 1 FROM monitored_urls mu
              WHERE mu.product_id = pr.id
                AND (
                  mu.status = 'error'
                  OR (mu.type = 'competitor' AND pr.price_4000m IS NOT NULL AND mu.last_detected_price IS NOT NULL AND mu.last_detected_price < pr.price_4000m)
                )
            )
          )
      ) AS price_anomalies
    FROM partners p
    ORDER BY
      CASE p.business_priority
        WHEN 'stratégique' THEN 1
        WHEN 'haute' THEN 2
        WHEN 'moyenne' THEN 3
        WHEN 'basse' THEN 4
        ELSE 5
      END,
      unlisted_count DESC,
      price_anomalies DESC,
      p.name ASC
  `);

  return result.rows.map((row) => {
    const unlisted = Number(row.unlisted_count || 0);
    const anomalies = Number(row.price_anomalies || 0);
    return {
      ...row,
      products_count: Number(row.products_count || 0),
      listed_count: Number(row.listed_count || 0),
      unlisted_count: Number(row.unlisted_count || 0),
      coverage_rate: Number(row.coverage_rate || 0),
      average_margin_rate: Number(row.average_margin_rate || 0),
      revenue_ht: Number(row.revenue_ht || 0),
      price_anomalies: anomalies,
      priority: unlisted > 0 && anomalies > 0 ? 'haute' : unlisted > 0 ? 'moyenne' : anomalies > 0 ? 'moyenne' : 'faible'
    };
  });
}

dashboardRoutes.get('/offer-control', asyncHandler(async (_req, res) => {
  res.json(await getOfferControlRows());
}));

dashboardRoutes.get('/', asyncHandler(async (_req, res) => {
  const [summary, alerts, crmTasks, offerControl] = await Promise.all([
    query(`
      SELECT
        COALESCE(SUM(sale_price_ht), 0) AS total_revenue_ht,
        COALESCE(SUM(gross_margin_ht), 0) AS total_margin_ht,
        COALESCE(AVG(NULLIF(gross_margin_ht, 0)), 0) AS average_margin_ht,
        COUNT(*) AS orders_count,
        (SELECT COUNT(*) FROM partners WHERE status = 'actif') AS active_partners_count
      FROM orders
    `),
    query("SELECT COUNT(*) AS open_price_alerts FROM alerts WHERE status = 'ouverte' AND type = 'prix'"),
    query(`
      SELECT
        SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo_count,
        SUM(CASE WHEN status = 'doing' THEN 1 ELSE 0 END) AS doing_count,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count,
        SUM(CASE WHEN priority = 'critique' AND status IN ('todo', 'doing') THEN 1 ELSE 0 END) AS critical_count
      FROM crm_cards
    `),
    getOfferControlRows()
  ]);

  res.json({
    summary: {
      ...summary.rows[0],
      open_price_alerts: alerts.rows[0].open_price_alerts,
      todo_tasks_count: Number(crmTasks.rows[0].todo_count || 0),
      doing_tasks_count: Number(crmTasks.rows[0].doing_count || 0),
      done_tasks_count: Number(crmTasks.rows[0].done_count || 0),
      critical_tasks_count: Number(crmTasks.rows[0].critical_count || 0)
    },
    offer_control: offerControl
  });
}));
