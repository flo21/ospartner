import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

process.env.DATABASE_PATH = 'server/data/offer-control-test.sqlite';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const projectRoot = path.basename(process.cwd()) === 'server' ? path.resolve(process.cwd(), '..') : process.cwd();
const testDatabasePath = path.resolve(projectRoot, process.env.DATABASE_PATH);
for (const file of [testDatabasePath, `${testDatabasePath}-wal`, `${testDatabasePath}-shm`]) {
  if (fs.existsSync(file)) fs.rmSync(file);
}

const { migrate } = await import('../db/migrate.js');
const { query, close, databasePath } = await import('../db/pool.js');
const { runOfferControl, syncProductOfferAnomalies } = await import('../services/offerControlService.js');

function uuid(label) {
  const hex = Buffer.from(label).toString('hex').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function insertProduct({ id, partnerId, name, price4000m, purchasePrice, listed = true }) {
  await query(
    `INSERT INTO products (
      id, partner_id, name, type, partner_public_price, partner_purchase_price,
      price_4000m, is_listed_on_4000m, listing_status, status
    )
    VALUES ($1, $2, $3, 'tandem', $4, $5, $6, $7, $8, 'actif')`,
    [
      id,
      partnerId,
      name,
      price4000m,
      purchasePrice,
      price4000m,
      listed ? 1 : 0,
      listed ? 'référencé' : 'à_référencer'
    ]
  );
}

try {
  await migrate();

  const partnerId = uuid('partner-test');
  await query(
    `INSERT INTO partners (id, name, company, email, status)
     VALUES ($1, 'Partenaire Test', 'Test SAS', 'test@example.com', 'actif')`,
    [partnerId]
  );

  const notListedId = uuid('not-listed');
  const margin12Id = uuid('margin-12');
  const margin991Id = uuid('margin-991');
  const margin17Id = uuid('margin-17');

  await insertProduct({
    id: notListedId,
    partnerId,
    name: 'Produit non référencé',
    price4000m: null,
    purchasePrice: 80,
    listed: false
  });
  await insertProduct({
    id: margin12Id,
    partnerId,
    name: 'Produit marge 12',
    price4000m: 100,
    purchasePrice: 88
  });
  await insertProduct({
    id: margin991Id,
    partnerId,
    name: 'Produit marge 9,91',
    price4000m: 111,
    purchasePrice: 100
  });
  await insertProduct({
    id: margin17Id,
    partnerId,
    name: 'Produit marge 17',
    price4000m: 100,
    purchasePrice: 83
  });

  assert.equal((await syncProductOfferAnomalies(notListedId)).created_tasks, 1);
  assert.equal((await syncProductOfferAnomalies(margin12Id)).created_tasks, 1);
  assert.equal((await syncProductOfferAnomalies(margin991Id)).created_tasks, 1);
  assert.equal((await syncProductOfferAnomalies(margin17Id)).created_tasks, 0);

  const cards = await query(
    "SELECT * FROM crm_cards WHERE partner_id = $1 AND source = 'automatique'",
    [partnerId]
  );
  assert.equal(cards.rowCount, 1);

  const items = await query(
    `SELECT anomaly_code, label
     FROM crm_card_items
     WHERE card_id = $1
     ORDER BY anomaly_code, label`,
    [cards.rows[0].id]
  );
  assert.equal(items.rowCount, 3);
  assert.deepEqual(items.rows.map((item) => item.anomaly_code).sort(), [
    'MARGIN_BELOW_15',
    'MARGIN_BELOW_15',
    'PRODUCT_NOT_LISTED'
  ]);
  assert.ok(items.rows.some((item) => item.label.includes('Produit marge 12')));
  assert.ok(items.rows.some((item) => item.label.includes('Produit marge 9,91')));
  assert.ok(!items.rows.some((item) => item.label.includes('Produit marge 17')));

  assert.equal((await syncProductOfferAnomalies(margin12Id)).created_tasks, 0);

  const report = await runOfferControl();
  assert.equal(report.checked_products, 4);
  assert.equal(report.created_tasks, 0);
  assert.equal(report.existing_tasks, 3);

  const secondReport = await runOfferControl();
  assert.equal(secondReport.created_tasks, 0);
  assert.equal(secondReport.existing_tasks, 3);

  console.log('Offer control test passed.');
} finally {
  close();
  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}
