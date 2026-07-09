import { databasePath, query, close } from './pool.js';

const tableName = process.argv[2];
const limit = Math.min(Number(process.argv[3] || 20), 200);

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

async function listTables() {
  const tables = await query(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);

  console.log(`SQLite database: ${databasePath}`);
  console.log('');
  for (const table of tables.rows) {
    const count = await query(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)}`);
    console.log(`${table.name.padEnd(24)} ${count.rows[0].count}`);
  }
}

async function showTable(name) {
  const exists = await query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = $1`,
    [name]
  );
  if (!exists.rowCount) {
    console.error(`Table not found: ${name}`);
    process.exitCode = 1;
    return;
  }

  const rows = await query(`SELECT * FROM ${quoteIdentifier(name)} LIMIT $1`, [limit]);
  console.log(`SQLite database: ${databasePath}`);
  console.log(`Table: ${name} (${rows.rowCount} row(s), limit ${limit})`);
  console.log(JSON.stringify(rows.rows, null, 2));
}

try {
  if (tableName) {
    await showTable(tableName);
  } else {
    await listTables();
  }
} finally {
  await close();
}
