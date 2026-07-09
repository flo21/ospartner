CREATE TABLE benchmark_tables (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Benchmark',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE benchmark_columns (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  table_id TEXT NOT NULL REFERENCES benchmark_tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE benchmark_rows (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  table_id TEXT NOT NULL REFERENCES benchmark_tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom' CHECK (type IN ('partner', '4000m', 'competitor', 'note', 'custom')),
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE benchmark_cells (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))),
  row_id TEXT NOT NULL REFERENCES benchmark_rows(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL REFERENCES benchmark_columns(id) ON DELETE CASCADE,
  value TEXT,
  color TEXT CHECK (color IN ('none', 'green', 'orange', 'red', 'gray')),
  last_updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_url_id TEXT REFERENCES monitored_urls(id) ON DELETE SET NULL,
  UNIQUE(row_id, column_id)
);

CREATE INDEX idx_benchmark_tables_partner ON benchmark_tables(partner_id);
CREATE INDEX idx_benchmark_columns_table ON benchmark_columns(table_id, position);
CREATE INDEX idx_benchmark_rows_table ON benchmark_rows(table_id, position);
CREATE INDEX idx_benchmark_cells_lookup ON benchmark_cells(row_id, column_id);
