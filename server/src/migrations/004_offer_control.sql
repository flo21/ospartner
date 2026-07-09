PRAGMA foreign_keys = OFF;

CREATE TABLE products_offer_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tandem', 'option vidéo', 'altitude spécifique', 'bon cadeau', 'promotion')),
  description TEXT,
  partner_public_price REAL,
  partner_purchase_price REAL NOT NULL DEFAULT 0,
  price_4000m REAL,
  is_listed_on_4000m INTEGER NOT NULL DEFAULT 0,
  listing_status TEXT NOT NULL DEFAULT 'non_référencé' CHECK (listing_status IN ('non_référencé', 'à_référencer', 'référencé', 'suspendu')),
  margin_amount REAL GENERATED ALWAYS AS (
    CASE WHEN price_4000m IS NULL OR price_4000m = 0 THEN NULL ELSE price_4000m - partner_purchase_price END
  ) STORED,
  margin_rate REAL GENERATED ALWAYS AS (
    CASE WHEN price_4000m IS NULL OR price_4000m = 0 THEN NULL ELSE ROUND(((price_4000m - partner_purchase_price) / price_4000m) * 100, 2) END
  ) STORED,
  min_margin_rate REAL NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'inactif')),
  valid_from TEXT,
  valid_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products_offer_new (
  id, partner_id, contract_id, name, type, description, partner_public_price,
  partner_purchase_price, price_4000m, is_listed_on_4000m, listing_status,
  min_margin_rate, status, valid_from, valid_to, notes, created_at, updated_at
)
SELECT
  id,
  partner_id,
  contract_id,
  name,
  type,
  notes,
  price_4000m,
  partner_purchase_price,
  price_4000m,
  CASE WHEN price_4000m IS NULL THEN 0 ELSE 1 END,
  CASE WHEN price_4000m IS NULL THEN 'à_référencer' ELSE 'référencé' END,
  15,
  status,
  valid_from,
  valid_to,
  notes,
  created_at,
  updated_at
FROM products;

DROP TABLE products;
ALTER TABLE products_offer_new RENAME TO products;
CREATE INDEX idx_products_partner ON products(partner_id);
CREATE INDEX idx_products_listing ON products(listing_status, is_listed_on_4000m);

CREATE TABLE monitored_urls_offer_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('partner', '4000m', 'competitor')),
  competitor_name TEXT,
  url TEXT NOT NULL,
  last_detected_price REAL,
  last_checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'anomaly', 'error')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO monitored_urls_offer_new (
  id, product_id, label, type, competitor_name, url, last_detected_price,
  last_checked_at, status, notes, created_at, updated_at
)
SELECT
  id,
  product_id,
  COALESCE(label, url_type),
  CASE WHEN url_type = 'partenaire' THEN 'partner' WHEN url_type = '4000m' THEN '4000m' ELSE 'competitor' END,
  CASE WHEN url_type = 'concurrent' THEN label ELSE NULL END,
  url,
  last_detected_price,
  last_checked_at,
  CASE WHEN status = 'anomalie' THEN 'anomaly' WHEN status = 'erreur' THEN 'error' ELSE 'ok' END,
  NULL,
  created_at,
  updated_at
FROM monitored_urls;

DROP TABLE monitored_urls;
ALTER TABLE monitored_urls_offer_new RENAME TO monitored_urls;
CREATE INDEX idx_urls_product ON monitored_urls(product_id);
CREATE INDEX idx_urls_status ON monitored_urls(status, type);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT REFERENCES partners(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('référencement', 'prix', 'marge', 'contrat', 'benchmark', 'facture')),
  priority TEXT NOT NULL CHECK (priority IN ('basse', 'moyenne', 'haute', 'critique')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte', 'en_cours', 'traitée', 'ignorée')),
  source TEXT NOT NULL DEFAULT 'automatique' CHECK (source IN ('automatique', 'manuel', 'ia')),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status, priority, type);
CREATE INDEX idx_tasks_owner ON tasks(partner_id, product_id, type);

PRAGMA foreign_keys = ON;
