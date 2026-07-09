CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'partner')),
  partner_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE partners (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'suspendu', 'archive')),
  main_contact TEXT,
  internal_notes TEXT,
  last_exchange_date TEXT,
  health_score INTEGER NOT NULL DEFAULT 70 CHECK (health_score >= 0 AND health_score <= 100),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT,
  commission_rate REAL NOT NULL DEFAULT 0,
  partner_purchase_price REAL NOT NULL DEFAULT 0,
  recommended_retail_price REAL NOT NULL DEFAULT 0,
  special_terms TEXT,
  cancellation_rules TEXT,
  postponement_rules TEXT,
  exclusivity INTEGER NOT NULL DEFAULT 0,
  pdf_path TEXT,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('actif', 'expiré', 'brouillon')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tandem', 'option vidéo', 'altitude spécifique', 'bon cadeau', 'promotion')),
  public_price_4000m REAL NOT NULL,
  partner_price REAL NOT NULL,
  commission REAL NOT NULL DEFAULT 0,
  gross_margin REAL GENERATED ALWAYS AS (public_price_4000m - partner_price - commission) STORED,
  margin_percent REAL GENERATED ALWAYS AS (
    CASE WHEN public_price_4000m = 0 THEN 0
    ELSE ROUND(((public_price_4000m - partner_price - commission) / public_price_4000m) * 100, 2)
    END
  ) STORED,
  status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'inactif')),
  valid_from TEXT,
  valid_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE monitored_urls (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  url_type TEXT NOT NULL CHECK (url_type IN ('partenaire', 'concurrent', '4000m')),
  label TEXT,
  last_detected_price REAL,
  last_checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'anomalie', 'erreur')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE price_checks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  url_id TEXT NOT NULL REFERENCES monitored_urls(id) ON DELETE CASCADE,
  detected_price REAL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL CHECK (status IN ('ok', 'anomalie', 'erreur')),
  error_message TEXT,
  gap_with_4000m REAL,
  gap_with_contract REAL,
  alert_level TEXT NOT NULL DEFAULT 'faible' CHECK (alert_level IN ('faible', 'moyen', 'critique'))
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  order_date TEXT NOT NULL DEFAULT (date('now')),
  jump_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('commandé', 'consommé', 'annulé', 'reporté', 'remboursé')),
  sale_price_ttc REAL NOT NULL,
  sale_price_ht REAL NOT NULL,
  partner_price_ht REAL NOT NULL,
  commission_4000m_ht REAL NOT NULL,
  gross_margin_ht REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('téléphone', 'web', 'partenaire', 'autre')),
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'soumis', 'validé', 'payé', 'rejeté')),
  amount_ht REAL NOT NULL DEFAULT 0,
  vat REAL NOT NULL DEFAULT 0,
  amount_ttc REAL NOT NULL DEFAULT 0,
  commission_4000m REAL NOT NULL DEFAULT 0,
  partner_net_amount REAL NOT NULL DEFAULT 0,
  pdf_file TEXT,
  submitted_at TEXT,
  validated_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice_lines (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_ht REAL NOT NULL,
  amount_ht REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT REFERENCES partners(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('prix', 'contrat', 'marge', 'disponibilité', 'facture')),
  severity TEXT NOT NULL CHECK (severity IN ('faible', 'moyenne', 'critique')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte', 'traitée', 'ignorée')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE ai_partner_reports (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  anomalies TEXT NOT NULL DEFAULT '[]',
  recommendations TEXT NOT NULL DEFAULT '[]',
  renegotiation_opportunities TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contracts_partner ON contracts(partner_id);
CREATE INDEX idx_products_partner ON products(partner_id);
CREATE INDEX idx_urls_product ON monitored_urls(product_id);
CREATE INDEX idx_price_checks_url ON price_checks(url_id);
CREATE INDEX idx_orders_partner ON orders(partner_id);
CREATE INDEX idx_orders_filters ON orders(status, order_date, product_id, source);
CREATE INDEX idx_invoices_partner ON invoices(partner_id);
CREATE INDEX idx_alerts_status ON alerts(status, severity);
