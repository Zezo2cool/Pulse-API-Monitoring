import assert from 'node:assert/strict';
import { createPool } from './database.mjs';

const pool = createPool();
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  const { rows: [monitor] } = await client.query(
    'INSERT INTO monitors (name, url) VALUES ($1, $2) RETURNING id, method, interval_seconds',
    ['Database verification', 'https://example.com/health'],
  );
  assert.equal(monitor.method, 'GET');
  assert.equal(monitor.interval_seconds, 60);
  await client.query(
    'INSERT INTO check_results (monitor_id, success, status_code, response_time_ms) VALUES ($1, $2, $3, $4)',
    [monitor.id, true, 200, 42],
  );
  const { rows: [history] } = await client.query(
    'SELECT count(*)::int AS count FROM check_results WHERE monitor_id = $1', [monitor.id],
  );
  assert.equal(history.count, 1);
  await client.query('SAVEPOINT invalid_monitor');
  await assert.rejects(
    client.query('INSERT INTO monitors (name, url, interval_seconds) VALUES ($1, $2, $3)', ['Invalid', 'https://example.com', 0]),
    { code: '23514' },
  );
  await client.query('ROLLBACK TO SAVEPOINT invalid_monitor');
  await client.query('SAVEPOINT missing_monitor');
  await assert.rejects(
    client.query('INSERT INTO check_results (monitor_id, success, response_time_ms) VALUES (gen_random_uuid(), false, 0)'),
    { code: '23503' },
  );
  await client.query('ROLLBACK TO SAVEPOINT missing_monitor');
  await client.query('DELETE FROM monitors WHERE id = $1', [monitor.id]);
  const { rows: [deleted] } = await client.query(
    'SELECT count(*)::int AS count FROM check_results WHERE monitor_id = $1', [monitor.id],
  );
  assert.equal(deleted.count, 0);
  console.log('PASS: connection, monitor defaults, result storage, constraints, and cascading deletion.');
} catch (error) {
  console.error('Database check failed:', error.code ?? error.message);
  process.exitCode = 1;
} finally {
  if (client) {
    await client.query('ROLLBACK');
    client.release();
  }
  await pool.end();
}
