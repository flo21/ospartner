import bcrypt from 'bcryptjs';
import { query } from './pool.js';

async function insert(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0];
}

export async function seedIfEmpty({ force = false } = {}) {
  const existing = await query('SELECT COUNT(*) AS count FROM users');
  if (!force && Number(existing.rows[0].count) > 0) {
    return;
  }

  await query('BEGIN');
  try {
    if (force) {
      await query(`
        DELETE FROM ai_partner_reports;
        DELETE FROM alerts;
        DELETE FROM tasks;
        DELETE FROM invoice_lines;
        DELETE FROM orders;
        DELETE FROM invoices;
        DELETE FROM price_checks;
        DELETE FROM monitored_urls;
        DELETE FROM products;
        DELETE FROM contracts;
        DELETE FROM users;
        DELETE FROM partners;
      `);
    }

    const adminPassword = await bcrypt.hash('Admin4000m!', 10);
    const partnerPassword = await bcrypt.hash('Partner4000m!', 10);

    const partners = [];
    const partnerSeeds = [
      ['Alpes Tandem', 'Alpes Tandem SAS', 'contact@alpes-tandem.example', '+33450000001', '12 route des airs', 'Annecy', 'Auvergne-Rhône-Alpes', 'actif', 'Marie Blanc', 'Partenaire historique, bon volume.', "date('now','-8 days')", 86, 'stratégique', 10],
      ['Azur Parachutisme', 'Azur Para SARL', 'ops@azur-para.example', '+33493000002', '5 aérodrome du littoral', 'Fréjus', "Provence-Alpes-Côte d'Azur", 'actif', 'Nicolas Verdier', 'Surveiller les écarts de prix directs.', "date('now','-19 days')", 62, 'moyenne', 3],
      ['Ouest Chute Libre', 'Ouest Chute Libre', 'hello@ouest-chute.example', '+33240000003', 'Aérodrome nord', 'Nantes', 'Pays de la Loire', 'suspendu', 'Claire Moreau', 'Factures à régulariser avant reprise.', "date('now','-45 days')", 41, 'basse', null]
    ];

    for (const seed of partnerSeeds) {
      const partner = await insert(
        `INSERT INTO partners
          (name, company, email, phone, address, city, region, status, main_contact, internal_notes, last_exchange_date, health_score, business_priority, estimated_revenue_share)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${seed[10]}, $11, $12, $13)
         RETURNING *`,
        [seed[0], seed[1], seed[2], seed[3], seed[4], seed[5], seed[6], seed[7], seed[8], seed[9], seed[11], seed[12], seed[13]]
      );
      partners.push(partner);
    }

    await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ('admin@4000m.com', $1, 'admin')`,
      [adminPassword]
    );

    for (const partner of partners) {
      await query(
        `INSERT INTO users (email, password_hash, role, partner_id)
         VALUES ($1, $2, 'partner', $3)`,
        [`partner-${partner.name.toLowerCase().replaceAll(' ', '-')}@4000m.com`, partnerPassword, partner.id]
      );
    }

    const products = [];
    for (const [index, partner] of partners.entries()) {
      const contract = await insert(
        `INSERT INTO contracts
          (partner_id, start_date, end_date, commission_rate, partner_purchase_price, recommended_retail_price,
           special_terms, cancellation_rules, postponement_rules, exclusivity, status)
         VALUES ($1, date('now','-90 days'), date('now','+275 days'), $2, $3, $4,
           'Commission fixe MVP, facturation mensuelle.', 'Annulation possible J-7.', 'Report gratuit selon météo.', $5, 'actif')
         RETURNING *`,
        [partner.id, index === 1 ? 14 : 12, 185 + index * 12, 299 + index * 20, index === 0 ? 1 : 0]
      );
      const tandem = await insert(
        `INSERT INTO products
          (partner_id, contract_id, name, type, description, partner_public_price, partner_purchase_price, price_4000m, is_listed_on_4000m, listing_status, min_margin_rate, status, valid_from, valid_to, notes)
         VALUES ($1, $2, $3, 'tandem', 'Saut tandem vendu par le partenaire', $4, $5, $6, 1, 'référencé', $7, 'actif', date('now'), date('now','+1 year'), 'Produit principal')
         RETURNING *`,
        [partner.id, contract.id, `Saut tandem ${partner.city}`, 289 + index * 12, 185 + index * 12, 299 + index * 20, index === 1 ? 35 : 15]
      );
      const video = await insert(
        `INSERT INTO products
          (partner_id, contract_id, name, type, description, partner_public_price, partner_purchase_price, price_4000m, is_listed_on_4000m, listing_status, min_margin_rate, status, valid_from, valid_to, notes)
         VALUES ($1, $2, $3, 'option vidéo', 'Option vendue directement par le partenaire', $4, $5, $6, $7, $8, 20, 'actif', date('now'), date('now','+1 year'), 'Option vidéo montée')
         RETURNING *`,
        [partner.id, contract.id, `Option vidéo ${partner.city}`, 89, 55 + index * 5, index === 2 ? null : 99, index === 2 ? 0 : 1, index === 2 ? 'à_référencer' : 'référencé']
      );
      const gift = await insert(
        `INSERT INTO products
          (partner_id, contract_id, name, type, description, partner_public_price, partner_purchase_price, price_4000m, is_listed_on_4000m, listing_status, min_margin_rate, status, valid_from, valid_to, notes)
         VALUES ($1, $2, $3, 'bon cadeau', 'Bon cadeau partenaire non encore référencé 4000m', $4, $5, NULL, 0, 'à_référencer', 15, 'actif', date('now'), date('now','+1 year'), 'À analyser pour référencement')
         RETURNING *`,
        [partner.id, contract.id, `Week-end ${partner.city}`, 349 + index * 15, 280 + index * 10]
      );
      products.push(tandem, video, gift);
    }

    for (const product of products) {
      await query(
        `INSERT INTO monitored_urls (product_id, url, type, competitor_name, label, last_detected_price, last_checked_at, status)
         VALUES
          ($1, $2, 'partner', NULL, 'Site partenaire', $3, datetime('now','-1 day'), 'ok'),
          ($1, $4, 'competitor', 'Sport Découverte', 'Sport Découverte', $5, datetime('now','-1 day'), 'anomaly'),
          ($1, $6, 'competitor', 'Cap Adrénaline', 'Cap Adrénaline', $7, datetime('now','-1 day'), 'ok')`,
        [
          product.id,
          `https://partner.example/products/${product.id}`,
          Number(product.partner_public_price || product.price_4000m || 0),
          `https://sport-decouverte.example/products/${product.id}`,
          product.price_4000m == null ? Number(product.partner_public_price || 0) - 20 : Number(product.price_4000m) - 25,
          `https://cap-adrenaline.example/products/${product.id}`,
          product.price_4000m == null ? Number(product.partner_public_price || 0) + 5 : Number(product.price_4000m) + 5
        ]
      );
    }

    for (const [index, product] of products.entries()) {
      for (let n = 0; n < 3; n += 1) {
        const status = n === 0 ? 'consommé' : n === 1 ? 'commandé' : 'reporté';
        await query(
          `INSERT INTO orders
            (partner_id, product_id, client_name, client_email, order_date, jump_date, status,
             sale_price_ttc, sale_price_ht, partner_price_ht, commission_4000m_ht, gross_margin_ht, source)
           VALUES ($1, $2, $3, $4, date('now', $5), date('now', $6),
             $7, $8, $9, $10, $11, $12, $13)`,
          [
            product.partner_id,
            product.id,
            `Client ${index + 1}-${n + 1}`,
            `client${index}${n}@example.com`,
            `-${12 + n * 8} days`,
            `+${15 + n * 9} days`,
            status,
            Number(product.price_4000m || product.partner_public_price || 0),
            Number((Number(product.price_4000m || product.partner_public_price || 0) / 1.2).toFixed(2)),
            Number(product.partner_purchase_price),
            0,
            Number(product.margin_amount),
            ['web', 'téléphone', 'partenaire'][n]
          ]
        );
      }
    }

    const consumedOrders = await query("SELECT * FROM orders WHERE status = 'consommé' LIMIT 3");
    for (const order of consumedOrders.rows) {
      const invoice = await insert(
        `INSERT INTO invoices
          (partner_id, period_start, period_end, status, amount_ht, vat, amount_ttc, commission_4000m, partner_net_amount, submitted_at)
         VALUES ($1, date('now','-30 days'), date('now'), 'soumis', $2, $3, $4, $5, $2, datetime('now'))
         RETURNING *`,
        [
          order.partner_id,
          order.partner_price_ht,
          Number((Number(order.partner_price_ht) * 0.2).toFixed(2)),
          Number((Number(order.partner_price_ht) * 1.2).toFixed(2)),
          order.commission_4000m_ht
        ]
      );
      await query(
        `INSERT INTO invoice_lines (invoice_id, order_id, product_id, description, quantity, unit_price_ht, amount_ht)
         VALUES ($1, $2, $3, 'Commande consommée seed', 1, $4, $4)`,
        [invoice.id, order.id, order.product_id, order.partner_price_ht]
      );
      await query('UPDATE orders SET invoice_id = $1 WHERE id = $2', [invoice.id, order.id]);
    }

    const firstProduct = products[0];
    await query(
      `INSERT INTO alerts (partner_id, product_id, type, severity, message, status)
       VALUES
        ($1, $2, 'prix', 'critique', 'Concurrent détecté sous le prix 4000m.', 'ouverte'),
        ($1, $2, 'marge', 'moyenne', 'Marge produit à surveiller.', 'ouverte'),
        ($3, NULL, 'facture', 'faible', 'Facture en attente de validation.', 'ouverte')`,
      [firstProduct.partner_id, firstProduct.id, partners[2].id]
    );

    await query(
      `INSERT INTO tasks (partner_id, product_id, type, priority, title, description, status, source, due_date)
       SELECT partner_id, id, 'référencement', 'haute', 'Référencer le produit ' || name || ' chez 4000m',
              'Produit vendu par le partenaire mais absent du catalogue 4000m.', 'ouverte', 'automatique', date('now','+7 days')
       FROM products
       WHERE is_listed_on_4000m = 0
       LIMIT 3`
    );

    await query('COMMIT');
    console.log('Seed complete');
    console.log('Admin: admin@4000m.com / Admin4000m!');
    console.log('Partner password: Partner4000m!');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith('/seed.js')) {
  seedIfEmpty({ force: true }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
