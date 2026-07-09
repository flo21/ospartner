PRAGMA foreign_keys = OFF;

CREATE TABLE tasks_kanban_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT REFERENCES partners(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('référencement', 'prix', 'marge', 'benchmark', 'contrat', 'autre', 'facture')),
  priority TEXT NOT NULL CHECK (priority IN ('basse', 'moyenne', 'haute', 'critique')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done', 'ignored')),
  source TEXT NOT NULL DEFAULT 'automatique' CHECK (source IN ('automatique', 'manuel', 'ia')),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

INSERT INTO tasks_kanban_new (
  id, partner_id, product_id, type, priority, title, description, status, source, due_date, created_at, updated_at, resolved_at
)
SELECT
  id,
  partner_id,
  product_id,
  CASE WHEN type IN ('référencement', 'prix', 'marge', 'benchmark', 'contrat', 'facture') THEN type ELSE 'autre' END,
  priority,
  title,
  description,
  CASE status
    WHEN 'ouverte' THEN 'todo'
    WHEN 'en_cours' THEN 'doing'
    WHEN 'traitée' THEN 'done'
    WHEN 'ignorée' THEN 'ignored'
    ELSE 'todo'
  END,
  source,
  due_date,
  created_at,
  COALESCE(resolved_at, created_at),
  resolved_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_kanban_new RENAME TO tasks;

CREATE INDEX idx_tasks_status ON tasks(status, priority, type);
CREATE INDEX idx_tasks_owner ON tasks(partner_id, product_id, type);

PRAGMA foreign_keys = ON;
