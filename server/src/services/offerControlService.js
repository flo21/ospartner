import { query } from '../db/pool.js';

const ACTIVE_CARD_STATUSES = ['todo', 'doing'];
const ACTIVE_CARD_STATUS_SQL = "'todo', 'doing'";
const MARGIN_THRESHOLD = 15;

const priorityRank = {
  basse: 1,
  moyenne: 2,
  haute: 3,
  critique: 4
};

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePrice(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).replace(/\s/g, '').replace('€', '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatRate(value) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function highestPriority(items) {
  return items.reduce((current, item) => (
    priorityRank[item.priority] > priorityRank[current] ? item.priority : current
  ), 'basse');
}

async function getOrCreateAutomaticCard(partnerId, partnerName, priority) {
  const active = await query(
    `SELECT * FROM crm_cards
     WHERE partner_id = $1 AND source = 'automatique' AND status IN (${ACTIVE_CARD_STATUS_SQL})
     ORDER BY created_at DESC
     LIMIT 1`,
    [partnerId]
  );
  if (active.rowCount) {
    await query(
      `UPDATE crm_cards
       SET priority = CASE
             WHEN CASE priority WHEN 'critique' THEN 4 WHEN 'haute' THEN 3 WHEN 'moyenne' THEN 2 ELSE 1 END < $2 THEN $3
             ELSE priority
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [active.rows[0].id, priorityRank[priority] || 2, priority]
    );
    return active.rows[0];
  }

  const done = await query(
    `SELECT * FROM crm_cards
     WHERE partner_id = $1 AND source = 'automatique' AND status = 'done'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [partnerId]
  );
  if (done.rowCount) {
    const reopened = await query(
      `UPDATE crm_cards
       SET status = 'todo',
           priority = $2,
           resolved_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [done.rows[0].id, priority]
    );
    return reopened.rows[0];
  }

  const created = await query(
    `INSERT INTO crm_cards (partner_id, title, description, priority, status, source, due_date, type)
     VALUES ($1, $2, $3, $4, 'todo', 'automatique', date('now','+7 days'), 'autre')
     RETURNING *`,
    [
      partnerId,
      `Anomalies offre - ${partnerName}`,
      'Anomalies détectées automatiquement par le contrôle de l’offre.',
      priority
    ]
  );
  return created.rows[0];
}

async function upsertAnomalyItem(anomaly) {
  const existing = await query(
    `SELECT item.*, c.status AS card_status
     FROM crm_card_items item
     JOIN crm_cards c ON c.id = item.card_id
     WHERE item.partner_id = $1
       AND COALESCE(item.product_id, '') = COALESCE($2, '')
       AND item.type = $3
       AND item.anomaly_code = $4
     ORDER BY item.updated_at DESC
     LIMIT 1`,
    [anomaly.partner_id, anomaly.product_id || null, anomaly.type, anomaly.anomaly_code]
  );

  const card = await getOrCreateAutomaticCard(anomaly.partner_id, anomaly.partner_name, anomaly.priority);

  if (existing.rowCount) {
    const item = existing.rows[0];
    await query(
      `UPDATE crm_card_items
       SET card_id = $1,
           label = $2,
           description = $3,
           priority = $4,
           ignored = 0,
           ignore_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [card.id, anomaly.label, anomaly.description, anomaly.priority, item.id]
    );
    if (item.card_status === 'done') {
      await query(
        `UPDATE crm_cards
         SET status = 'todo', resolved_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [card.id]
      );
    }
    return { created: false, item_id: item.id, card_id: card.id };
  }

  const position = await query('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM crm_card_items WHERE card_id = $1', [card.id]);
  const inserted = await query(
    `INSERT INTO crm_card_items (
       card_id, partner_id, product_id, type, anomaly_code, label, description,
       priority, completed, ignored, position
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9)
     RETURNING *`,
    [
      card.id,
      anomaly.partner_id,
      anomaly.product_id || null,
      anomaly.type,
      anomaly.anomaly_code,
      anomaly.label,
      anomaly.description,
      anomaly.priority,
      Number(position.rows[0].next)
    ]
  );
  return { created: true, item_id: inserted.rows[0].id, card_id: card.id };
}

async function resolveStaleAutomaticItems(activeKeys) {
  const result = await query(`
    SELECT item.*
    FROM crm_card_items item
    JOIN crm_cards c ON c.id = item.card_id
    WHERE c.source = 'automatique'
      AND item.anomaly_code IS NOT NULL
      AND item.completed = 0
      AND item.ignored = 0
  `);

  const resolved = [];
  for (const item of result.rows) {
    const key = `${item.partner_id || ''}:${item.product_id || ''}:${item.type}:${item.anomaly_code}`;
    if (activeKeys.has(key)) continue;
    await query(
      `UPDATE crm_card_items
       SET completed = 1,
           completed_at = CURRENT_TIMESTAMP,
           description = CASE
             WHEN description IS NULL OR description = '' THEN 'Anomalie résolue automatiquement lors du dernier contrôle.'
             ELSE description || char(10) || 'Anomalie résolue automatiquement lors du dernier contrôle.'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [item.id]
    );
    resolved.push(item.id);
  }
  return resolved;
}

async function refreshAutomaticCards() {
  const cards = await query("SELECT id FROM crm_cards WHERE source = 'automatique'");
  for (const card of cards.rows) {
    const items = await query('SELECT priority, completed, ignored FROM crm_card_items WHERE card_id = $1', [card.id]);
    if (!items.rowCount) continue;
    const allResolved = items.rows.every((item) => Number(item.completed) === 1 || Number(item.ignored) === 1);
    await query(
      `UPDATE crm_cards
       SET priority = $2,
           status = CASE WHEN $3 = 1 THEN 'done' WHEN status = 'done' THEN 'todo' ELSE status END,
           resolved_at = CASE WHEN $3 = 1 THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [card.id, highestPriority(items.rows), allResolved ? 1 : 0]
    );
  }
}

async function consolidateAutomaticPartnerCards() {
  const result = await query(`
    SELECT *
    FROM crm_cards
    WHERE source = 'automatique' AND partner_id IS NOT NULL
    ORDER BY partner_id, created_at
  `);
  const groups = new Map();
  for (const card of result.rows) {
    if (!groups.has(card.partner_id)) groups.set(card.partner_id, []);
    groups.get(card.partner_id).push(card);
  }

  for (const cards of groups.values()) {
    if (cards.length <= 1) continue;
    const canonical =
      cards.find((card) => ACTIVE_CARD_STATUSES.includes(card.status) && card.title.startsWith('Anomalies offre')) ||
      cards.find((card) => ACTIVE_CARD_STATUSES.includes(card.status)) ||
      cards.find((card) => card.title.startsWith('Anomalies offre')) ||
      cards[0];
    for (const card of cards) {
      if (card.id === canonical.id) continue;
      await query('UPDATE crm_card_items SET card_id = $1, updated_at = CURRENT_TIMESTAMP WHERE card_id = $2', [canonical.id, card.id]);
      await query('DELETE FROM crm_cards WHERE id = $1', [card.id]);
    }
    const partner = await query('SELECT name FROM partners WHERE id = $1', [canonical.partner_id]);
    await query(
      `UPDATE crm_cards
       SET title = $2,
           description = 'Anomalies détectées automatiquement par le contrôle de l’offre.',
           type = 'autre',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [canonical.id, `Anomalies offre - ${partner.rows[0]?.name || 'partenaire'}`]
    );
  }
}

async function detectBenchmarkCellAnomalies(products) {
  const result = await query(`
    SELECT
      bt.partner_id,
      br.name AS source_name,
      br.type AS row_type,
      bc.name AS column_name,
      cell.value
    FROM benchmark_cells cell
    JOIN benchmark_rows br ON br.id = cell.row_id
    JOIN benchmark_columns bc ON bc.id = cell.column_id
    JOIN benchmark_tables bt ON bt.id = br.table_id
    WHERE br.type = 'competitor'
  `);

  const anomalies = [];
  for (const cell of result.rows) {
    const value = parsePrice(cell.value);
    if (value == null) continue;
    const product = products.find((item) => {
      if (item.partner_id !== cell.partner_id) return false;
      const productName = item.name.toLowerCase();
      const columnName = String(cell.column_name || '').toLowerCase();
      if (!columnName || columnName.length < 3) return false;
      return productName.includes(columnName) || columnName.includes(productName);
    });
    const price4000m = normalizeNumber(product?.price_4000m);
    if (!product || price4000m == null || value >= price4000m) continue;
    anomalies.push({
      partner_id: product.partner_id,
      partner_name: product.partner_name,
      product_id: product.id,
      type: 'benchmark',
      anomaly_code: 'COMPETITOR_PRICE_LOWER_THAN_4000M',
      priority: 'critique',
      label: `Concurrent moins cher sur ${product.name}`,
      description: `${cell.source_name}: ${value} EUR vs ${price4000m} EUR chez 4000m.`
    });
  }
  return anomalies;
}

export async function runOfferControl() {
  await consolidateAutomaticPartnerCards();
  const productsResult = await query(`
    SELECT p.*, partners.name AS partner_name
    FROM products p
    JOIN partners ON partners.id = p.partner_id
    WHERE p.status = 'actif'
  `);
  const products = productsResult.rows;
  const urls = await query('SELECT * FROM monitored_urls');

  const activeKeys = new Set();
  const anomalies = [];
  const taskStats = { added: 0, existing: 0 };

  for (const product of products) {
    const productUrls = urls.rows.filter((url) => url.product_id === product.id);
    const price4000m = normalizeNumber(product.price_4000m);
    const partnerPublicPrice = normalizeNumber(product.partner_public_price);
    const partnerPurchasePrice = normalizeNumber(product.partner_purchase_price);
    const marginRate = normalizeNumber(product.margin_rate);
    const isListed = Number(product.is_listed_on_4000m) === 1;
    const marginExceptionAccepted = Number(product.margin_exception_accepted) === 1;

    if (!isListed || product.listing_status === 'à_référencer' || price4000m == null) {
      anomalies.push({
        partner_id: product.partner_id,
        partner_name: product.partner_name,
        product_id: product.id,
        type: 'référencement',
        anomaly_code: 'PRODUCT_NOT_LISTED',
        priority: 'haute',
        label: `Référencer le produit ${product.name} chez 4000m`,
        description: `${product.partner_name} vend ce produit mais il n’est pas correctement référencé chez 4000m.`
      });
    }

    if (
      isListed &&
      price4000m != null &&
      partnerPurchasePrice != null &&
      marginRate != null &&
      marginRate < MARGIN_THRESHOLD &&
      !marginExceptionAccepted
    ) {
      anomalies.push({
        partner_id: product.partner_id,
        partner_name: product.partner_name,
        product_id: product.id,
        type: 'marge',
        anomaly_code: 'MARGIN_BELOW_15',
        priority: marginRate < 10 ? 'critique' : 'haute',
        label: `Marge inférieure à 15% sur ${product.name} : ${formatRate(marginRate)}%`,
        description: `${product.name}: prix 4000m ${price4000m} EUR, prix d’achat ${partnerPurchasePrice} EUR.`
      });
    }

    if (price4000m != null && partnerPublicPrice != null && partnerPublicPrice < price4000m) {
      anomalies.push({
        partner_id: product.partner_id,
        partner_name: product.partner_name,
        product_id: product.id,
        type: 'prix',
        anomaly_code: 'PARTNER_PRICE_LOWER_THAN_4000M',
        priority: 'critique',
        label: `Prix public partenaire inférieur à 4000m sur ${product.name}`,
        description: `${product.name}: partenaire ${partnerPublicPrice} EUR vs 4000m ${price4000m} EUR.`
      });
    }

    for (const url of productUrls) {
      if (url.status === 'error') {
        anomalies.push({
          partner_id: product.partner_id,
          partner_name: product.partner_name,
          product_id: product.id,
          type: 'benchmark',
          anomaly_code: 'BENCHMARK_URL_ERROR',
          priority: 'moyenne',
          label: `URL benchmark en erreur sur ${product.name}`,
          description: `${url.label}: ${url.url}`
        });
      }

      if (url.type === 'competitor' && price4000m != null && url.last_detected_price != null && Number(url.last_detected_price) < price4000m) {
        anomalies.push({
          partner_id: product.partner_id,
          partner_name: product.partner_name,
          product_id: product.id,
          type: 'benchmark',
          anomaly_code: 'COMPETITOR_PRICE_LOWER_THAN_4000M',
          priority: 'critique',
          label: `Concurrent moins cher sur ${product.name}`,
          description: `${url.competitor_name || url.label}: ${url.last_detected_price} EUR vs ${price4000m} EUR chez 4000m.`
        });
      }
    }
  }

  anomalies.push(...await detectBenchmarkCellAnomalies(products));

  for (const anomaly of anomalies) {
    const key = `${anomaly.partner_id || ''}:${anomaly.product_id || ''}:${anomaly.type}:${anomaly.anomaly_code}`;
    activeKeys.add(key);
    const result = await upsertAnomalyItem(anomaly);
    if (result.created) taskStats.added += 1;
    else taskStats.existing += 1;
  }

  const resolved = await resolveStaleAutomaticItems(activeKeys);
  await consolidateAutomaticPartnerCards();
  await refreshAutomaticCards();

  const openCards = await query("SELECT COUNT(*) AS count FROM crm_cards WHERE status IN ('todo', 'doing')");
  return {
    checked_products: productsResult.rowCount,
    anomalies_count: anomalies.length,
    created_tasks: taskStats.added,
    existing_tasks: taskStats.existing,
    resolved_tasks: resolved.length,
    open_tasks: Number(openCards.rows[0].count),
    anomalies,
    tasks_added: taskStats.added,
    tasks_existing: taskStats.existing,
    tasks_resolved: resolved.length
  };
}
