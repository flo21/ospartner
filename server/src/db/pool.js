import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';

const projectRoot = path.basename(process.cwd()) === 'server' ? path.resolve(process.cwd(), '..') : process.cwd();
const dbPath = path.isAbsolute(env.databasePath) ? env.databasePath : path.resolve(projectRoot, env.databasePath);
export const databasePath = dbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function normalizeSql(sql, params = []) {
  const ordered = [];
  const text = sql.replace(/\$(\d+)/g, (_match, index) => {
    ordered.push(params[Number(index) - 1]);
    return '?';
  });
  return { text, params: ordered };
}

function isSelect(sql) {
  return /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql);
}

export async function query(sql, params = []) {
  const normalized = normalizeSql(sql, params);
  if (!normalized.params.length && normalized.text.trim().includes(';')) {
    db.exec(normalized.text);
    return { rows: [], rowCount: 0 };
  }
  const statement = db.prepare(normalized.text);
  if (isSelect(normalized.text)) {
    const rows = statement.all(normalized.params);
    return { rows, rowCount: rows.length };
  }
  if (/\bRETURNING\b/i.test(normalized.text)) {
    const rows = statement.all(normalized.params);
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(normalized.params);
  return { rows: [], rowCount: result.changes, lastID: result.lastInsertRowid };
}

export function transaction(callback) {
  const run = db.transaction(() => callback({ query }));
  return run();
}

export async function close() {
  db.close();
}
