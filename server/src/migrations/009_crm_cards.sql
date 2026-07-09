CREATE TABLE crm_cards (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT REFERENCES partners(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'autre' CHECK (type IN ('référencement', 'prix', 'marge', 'benchmark', 'contrat', 'autre', 'facture')),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'moyenne' CHECK (priority IN ('basse', 'moyenne', 'haute', 'critique')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'ignored')),
  source TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel', 'automatique', 'ia')),
  due_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE crm_card_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  card_id TEXT NOT NULL REFERENCES crm_cards(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO crm_cards (
  id, partner_id, product_id, type, title, description, priority, status, source, due_date, notes, created_at, updated_at, resolved_at
)
SELECT
  id, partner_id, product_id, type, title, description, priority, status, source, due_date, NULL, created_at, updated_at, resolved_at
FROM tasks
WHERE NOT EXISTS (SELECT 1 FROM crm_cards c WHERE c.id = tasks.id);

INSERT INTO crm_card_items (card_id, label, completed, position, created_at, updated_at)
SELECT
  id, title, CASE WHEN status = 'done' THEN 1 ELSE 0 END, 0, created_at, updated_at
FROM tasks
WHERE NOT EXISTS (SELECT 1 FROM crm_card_items item WHERE item.card_id = tasks.id);

CREATE INDEX idx_crm_cards_status ON crm_cards(status, priority, type);
CREATE INDEX idx_crm_cards_owner ON crm_cards(partner_id, product_id, type);
CREATE INDEX idx_crm_items_card ON crm_card_items(card_id, position);
