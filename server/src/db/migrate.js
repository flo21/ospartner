import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../migrations');

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const exists = await query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (exists.rowCount) continue;

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    try {
      await query(sql);
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`Migrated ${file}`);
    } catch (error) {
      throw error;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
