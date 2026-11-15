import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.MONITOR_API_URL ?? 'http://127.0.0.1:3000';
const created = new Set();
let assertions = 0;

async function call(path, method = 'GET', body, expected = 200, headers = {}) {
  const response = await fetch(`${base}/api/monitors${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  assertions++;
  return data;
}

try {
  const name = `Disposable API verification ${randomUUID()}`;
  const { monitor } = await call('', 'POST', { name, url: 'https://example.com/health' }, 201, { Origin: new URL(base).origin });
  created.add(monitor.id);
  assert.equal(monitor.enabled, true);
  assert.equal(monitor.method, 'GET');
  assert.equal(monitor.interval_seconds, 60);
  const id = `/${monitor.id}`;
  const list = await call('');
  assert.ok(list.monitors.some((item) => item.id === monitor.id));

  const edited = await call(id, 'PATCH', { name: `${name} edited`, method: 'HEAD', expected_status: 204, interval_seconds: 120, timeout_ms: 20000 });
  assert.equal(edited.monitor.name, `${name} edited`);
  assert.equal(edited.monitor.method, 'HEAD');
  assert.equal(edited.monitor.expected_status, 204);
  assert.equal(edited.monitor.interval_seconds, 120);
  assert.equal(edited.monitor.timeout_ms, 20000);
  const paused = await call(id, 'PATCH', { enabled: false });
  assert.equal(paused.monitor.enabled, false);
  const enabled = await call(id, 'PATCH', { enabled: true });
  assert.equal(enabled.monitor.enabled, true);
  await Promise.all([
    call(id, 'PATCH', { name: `${name} concurrent` }),
    call(id, 'PATCH', { expected_status: 202 }),
  ]);
  const stored = (await call('')).monitors.find((item) => item.id === monitor.id);
  assert.equal(stored.name, `${name} concurrent`);
  assert.equal(stored.expected_status, 202);

  await call(id, 'PATCH', { timeout_ms: 60000 });
  await call(id, 'PATCH', { interval_seconds: 30 }, 400);
  assert.equal((await call('')).monitors.find((item) => item.id === monitor.id).interval_seconds, 120);

  for (const invalid of [
    { name: '', url: 'https://example.com' },
    { name: 'Invalid', url: 'file:///etc/passwd' },
    { name: 'Invalid', url: 'https://user:password@example.com' },
    { name: 'Invalid', url: 'https://example.com/#fragment' },
    { name: 'Invalid', url: 'https://example.com', interval_seconds: 0 },
    { name: 'Invalid', url: 'https://example.com', interval_seconds: 30, timeout_ms: 60000 },
    { name: 'Invalid', url: 'https://example.com', expected_status: 99 },
    { name: 'Invalid', url: 'https://example.com', enabled: 'false' },
    { name: 'Invalid', url: 'https://example.com', method: 'POST' },
  ]) await call('', 'POST', invalid, 400);
  await call(id, 'PATCH', { name: null }, 400);
  await call(id, 'PATCH', {}, 400);
  await call(id, 'PATCH', { id: randomUUID() }, 400);
  await call('/not-a-uuid', 'PATCH', { enabled: false }, 400);
  await call(`/${randomUUID()}`, 'PATCH', { enabled: false }, 404);
  await call(id, 'PATCH', { enabled: false }, 403, { Origin: 'https://unrelated.example' });
  await call('', 'POST', { name: 'Invalid' }, 415, { 'Content-Type': 'text/plain' });
  const malformed = await fetch(`${base}/api/monitors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{', signal: AbortSignal.timeout(20000) });
  assert.equal(malformed.status, 400);
  assertions++;

  await call(id, 'DELETE', undefined, 204);
  created.delete(monitor.id);
  assert.ok(!(await call('')).monitors.some((item) => item.id === monitor.id));
  await call(id, 'DELETE', undefined, 404);
  console.log(`PASS: ${assertions} HTTP checks; create, persistence, edit, pause/enable, concurrent updates, validation, and deletion.`);
} finally {
  for (const id of created) await call(`/${id}`, 'DELETE', undefined, 204);
}
