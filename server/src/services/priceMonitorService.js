import { query } from '../db/pool.js';

function alertLevel(gapWith4000m, gapWithContract, marginPercent) {
  if (gapWith4000m < -20 || gapWithContract < -20 || marginPercent < 10) return 'critique';
  if (gapWith4000m < 0 || gapWithContract < 0 || marginPercent < 18) return 'moyen';
  return 'faible';
}

export async function runPriceChecks() {
  const urls = await query(`
    SELECT
      mu.id AS url_id,
      mu.type AS url_type,
      mu.competitor_name,
      mu.label,
      p.id AS product_id,
      p.partner_id,
      p.name AS product_name,
      p.price_4000m,
      p.margin_rate,
      c.recommended_retail_price
    FROM monitored_urls mu
    JOIN products p ON p.id = mu.product_id
    LEFT JOIN contracts c ON c.id = p.contract_id
  `);

  const results = [];
  for (const row of urls.rows) {
    const basePrice = Number(row.price_4000m);
    const detectedPrice = Math.max(1, Number((basePrice + (Math.random() * 80 - 40)).toFixed(2)));
    const gapWith4000m = Number((detectedPrice - basePrice).toFixed(2));
    const contractPrice = Number(row.recommended_retail_price || basePrice);
    const gapWithContract = Number((basePrice - contractPrice).toFixed(2));
    const hasAnomaly =
      (row.url_type !== '4000m' && basePrice && detectedPrice < basePrice) ||
      Number(row.margin_rate) < 18 ||
      gapWithContract !== 0;
    const status = hasAnomaly ? 'anomalie' : 'ok';
    const level = alertLevel(gapWith4000m, gapWithContract, Number(row.margin_rate));

    const check = await query(
      `INSERT INTO price_checks
        (url_id, detected_price, currency, status, error_message, gap_with_4000m, gap_with_contract, alert_level)
       VALUES ($1, $2, 'EUR', $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        row.url_id,
        detectedPrice,
        status,
        hasAnomaly ? 'Contrôle prix: écart détecté selon les règles MVP.' : null,
        gapWith4000m,
        gapWithContract,
        level
      ]
    );

    await query(
      `UPDATE monitored_urls
       SET last_detected_price = $1, last_checked_at = CURRENT_TIMESTAMP, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [detectedPrice, status === 'anomalie' ? 'anomaly' : status, row.url_id]
    );

    if (hasAnomaly) {
      await query(
        `INSERT INTO alerts (partner_id, product_id, type, severity, message)
         VALUES ($1, $2, 'prix', $3, $4)`,
        [
          row.partner_id,
          row.product_id,
          level === 'moyen' ? 'moyenne' : level,
          `Anomalie prix sur ${row.product_name}: ${row.competitor_name || row.label || 'source'} détecté à ${detectedPrice} EUR vs prix 4000m ${basePrice} EUR.`
        ]
      );
    }
    results.push(check.rows[0]);
  }
  return results;
}
