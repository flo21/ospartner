PRAGMA foreign_keys = OFF;

CREATE TABLE products_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tandem', 'option vidéo', 'altitude spécifique', 'bon cadeau', 'promotion')),
  price_4000m REAL NOT NULL,
  partner_purchase_price REAL NOT NULL,
  margin_amount REAL GENERATED ALWAYS AS (price_4000m - partner_purchase_price) STORED,
  margin_rate REAL GENERATED ALWAYS AS (
    CASE WHEN price_4000m = 0 THEN 0
    ELSE ROUND(((price_4000m - partner_purchase_price) / price_4000m) * 100, 2)
    END
  ) STORED,
  status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'inactif')),
  valid_from TEXT,
  valid_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products_new (
  id,
  partner_id,
  contract_id,
  name,
  type,
  price_4000m,
  partner_purchase_price,
  status,
  valid_from,
  valid_to,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  partner_id,
  contract_id,
  name,
  type,
  COALESCE(public_price_4000m, 0),
  COALESCE(partner_price, 0),
  status,
  valid_from,
  valid_to,
  notes,
  created_at,
  updated_at
FROM products;

DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

CREATE INDEX idx_products_partner ON products(partner_id);

PRAGMA foreign_keys = ON;
