import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createPool } from './database.mjs';

const pool = createPool();
let client;
try {
  client = await pool.connect();
  // One transaction protects both schema changes and migration bookkeeping.
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(71402511)');
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = new URL('../db/migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${name} has changed. Add a new migration instead.`);
      }
      console.log(`Already applied: ${name}`);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
    console.log(`Applied: ${name}`);
  }
  await client.query('COMMIT');
  console.log('Database migrations complete.');
} catch (error) {
  if (client) await client.query('ROLLBACK');
  console.error('Migration failed:', error.code ?? error.message);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
