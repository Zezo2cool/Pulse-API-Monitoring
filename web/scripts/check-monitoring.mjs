import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { createPool } from './database.mjs';
import { checkEndpoint } from './http-check.mjs';
import { runMonitor } from './run-monitor.mjs';

// All database changes are confined to a uniquely named verification schema.
const schema = `monitor_test_${randomUUID().replaceAll('-', '')}`;
const admin = createPool();
let database;
let worker;
let workerExit;
let workerOutput = '';
let schemaCreated = false;
let releaseResponse;
let receivedRequest;
const server = createServer((request, response) => {
  if (request.url === '/gated') {
    releaseResponse = () => response.end('ok');
    receivedRequest?.();
  } else if (request.url === '/slow') {
    setTimeout(() => response.end('slow'), 300);
  } else {
    response.statusCode = request.url === '/bad' ? 503 : request.url === '/redirect' ? 302 : 200;
    if (request.url === '/redirect') response.setHeader('Location', '/ok');
    response.end('ok');
  }
});

async function waitUntil(predicate, description) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}. ${workerOutput}`);
}

try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  database = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema}`,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  await database.query(await readFile(new URL('../db/migrations/001_monitoring.sql', import.meta.url), 'utf8'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const settings = { url: `${base}/ok`, method: 'GET', expected_status: 200, timeout_ms: 1000 };

  const success = await checkEndpoint(settings);
  assert.equal(success.success, true);
  assert.equal(success.status_code, 200);
  assert.ok(Number.isInteger(success.response_time_ms) && success.response_time_ms >= 0);
  assert.equal((await checkEndpoint({ ...settings, method: 'HEAD' })).success, true);
  const failure = await checkEndpoint({ ...settings, url: `${base}/bad` });
  assert.equal(failure.success, false);
  assert.equal(failure.status_code, 503);
  assert.equal((await checkEndpoint({ ...settings, url: `${base}/redirect` })).status_code, 302);
  const timeout = await checkEndpoint({ ...settings, url: `${base}/slow`, timeout_ms: 100 });
  assert.equal(timeout.success, false);
  assert.equal(timeout.status_code, null);
  assert.match(timeout.error_message, /timed out/);
  const refused = await checkEndpoint({ ...settings, url: 'http://127.0.0.1:1/' });
  assert.equal(refused.success, false);
  assert.equal(refused.status_code, null);
  console.log('PASS: HTTP success, HEAD, unexpected status, redirects, timeout, and connection failure.');

  const { rows: [monitor] } = await database.query(
    'INSERT INTO monitors (name, url, interval_seconds, timeout_ms) VALUES ($1,$2,30,1000) RETURNING id',
    ['Isolated verification', settings.url],
  );
  const saved = await runMonitor(database, monitor.id, { onlyIfDue: true });
  assert.equal(saved.success, true);
  const { rows: [scheduled] } = await database.query(
    `SELECT next_check_at > now() AS future,
      (SELECT count(*)::int FROM check_results WHERE monitor_id = $1) AS count
     FROM monitors WHERE id = $1`, [monitor.id],
  );
  assert.equal(scheduled.future, true);
  assert.equal(scheduled.count, 1);
  assert.equal(await runMonitor(database, monitor.id, { onlyIfDue: true }), null);
  await database.query('UPDATE monitors SET enabled = false WHERE id = $1', [monitor.id]);
  assert.equal(await runMonitor(database, monitor.id), null);

  await database.query('UPDATE monitors SET enabled = true, url = $2 WHERE id = $1', [monitor.id, `${base}/bad`]);
  assert.equal((await runMonitor(database, monitor.id)).success, false);
  await database.query('UPDATE monitors SET url = $2 WHERE id = $1', [monitor.id, `${base}/gated`]);
  const requestReceived = new Promise((resolve) => { receivedRequest = resolve; });
  const pending = runMonitor(database, monitor.id);
  await requestReceived;
  await database.query('UPDATE monitors SET updated_at = clock_timestamp(), name = $2 WHERE id = $1', [monitor.id, 'Edited during request']);
  releaseResponse();
  assert.equal(await pending, null);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM check_results')).rows[0].count, 2);
  console.log('PASS: result persistence, next due time, not-due and paused skips, failed result storage, and changed settings.');

  await database.query('UPDATE monitors SET url = $2, next_check_at = now() WHERE id = $1', [monitor.id, settings.url]);
  worker = spawn(process.execPath, [fileURLToPath(new URL('./monitor-worker.mjs', import.meta.url))], {
    env: { ...process.env, PGOPTIONS: `-c search_path=${schema}` },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  workerExit = once(worker, 'exit');
  worker.stdout.on('data', (chunk) => { workerOutput += chunk; });
  worker.stderr.on('data', (chunk) => { workerOutput += chunk; });
  const count = async () => (await database.query('SELECT count(*)::int AS count FROM check_results')).rows[0].count;
  await waitUntil(async () => await count() === 3, 'worker first check');
  await sleep(1200);
  assert.equal(await count(), 3);
  await database.query('UPDATE monitors SET next_check_at = now() WHERE id = $1', [monitor.id]);
  await waitUntil(async () => await count() === 4, 'worker next polling pass');
  await database.query('UPDATE monitors SET enabled = false, next_check_at = now() WHERE id = $1', [monitor.id]);
  await sleep(1200);
  assert.equal(await count(), 4);
  console.log('PASS: worker polling, no early repeat, rescheduled check, and paused monitor.');
} finally {
  releaseResponse?.();
  if (worker && worker.exitCode === null && worker.signalCode === null) worker.kill();
  if (workerExit) await workerExit;
  if (server.listening) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (database) await database.end();
  if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
