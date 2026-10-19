// Reloads db/init.sql (schema + seed data). Used by global setup and `npm run db:reset`.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function resetDatabase(connectionString: string): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sql = await readFile(path.join(root, 'db', 'init.sql'), 'utf8');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql); // multi-statement script, run as one simple query
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await resetDatabase(process.env.DATABASE_URL ?? 'postgres://qa:qa@localhost:5432/servicedesk');
  console.log('Database reset from db/init.sql');
}
