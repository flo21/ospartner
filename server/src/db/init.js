import { query } from './pool.js';
import { migrate } from './migrate.js';
import { seedIfEmpty } from './seed.js';

export async function initializeDatabase() {
  await migrate();
  const result = await query('SELECT COUNT(*) AS count FROM users');
  if (Number(result.rows[0].count) === 0) {
    await seedIfEmpty();
  }
}
