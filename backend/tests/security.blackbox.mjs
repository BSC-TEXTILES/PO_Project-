// Black-box security tests — boots an ISOLATED API server by default (fresh
// rate-limit buckets on every run), or targets a live one:
//   node backend/tests/security.blackbox.mjs [http://localhost:4040]
// Covers: auth hardening (lockout limits), scope enforcement,
// permission walls, injection probes, header hygiene. No server internals used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_URL = process.argv[2] || '';
const PORT = process.env.SECURITY_TEST_PORT || '4401';
const BASE = LIVE_URL || `http://localhost:${PORT}`;
const results = [];

// Isolated server so repeat runs never trip the 10-logins/5-min limiter.

let server = null;
let serverLog = '';
if (!LIVE_URL) {
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT, JWT_SECRET: 'security-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  process.on('exit', () => server?.kill());
  let up = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) { up = true; break; } } catch { /* not up yet */ }
    await sleep(400);
  }
  if (!up) {
    console.error(`Security-test server failed to boot on port ${PORT}:\n${serverLog.slice(-800)}`);
    process.exit(1);
  }
}

async function req(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON (204 etc.) */ }
  return { status: res.status, headers: res.headers, data };
}

class SkipSignal extends Error {}

async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) {
    if (e instanceof SkipSignal) { results.push(['SKIP', `${name} — ${e.message}`]); return; }
    results.push(['FAIL', `${name} — ${e.message}`]);
  }
}

// Email/password login; returns { token, user } or throws.
async function login(email, password) {
  const res = await req('POST', '/api/auth/login', { body: { email, password } });
  assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

// ── 1. Unauthenticated access is refused everywhere ───────────────────────
await test('health endpoint is public and answers ok', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'ok');
});

await test('authenticated endpoints reject anonymous callers (401)', async () => {
  for (const path of ['/api/users', '/api/purchase-orders', '/api/tracking/live', '/api/files']) {
    const r = await req('GET', path);
    assert.ok([401, 403].includes(r.status), `${path} answered ${r.status} without a token`);
  }
});

// ── 2. Login hardening ────────────────────────────────────────────────────
await test('login rejects malformed credentials (400)', async () => {
  const r = await req('POST', '/api/auth/login', { body: { email: 'not-an-email', password: '' } });
  assert.equal(r.status, 400);
});

await test('login rejects unknown users without user enumeration', async () => {
  const r = await req('POST', '/api/auth/login', {
    body: { email: 'ghost.user@bsc.local', password: 'whatever123' },
  });
  assert.equal(r.status, 401);
  assert.match(r.data.error.message, /Invalid email or password/i);
  assert.ok(!/bcrypt|sql|syntax/i.test(JSON.stringify(r.data)));
});

await test('login with a wrong password fails without leaking info', async () => {
  const r = await req('POST', '/api/auth/login', {
    body: { email: 'admin@bsc.local', password: 'definitely-wrong' },
  });
  assert.equal(r.status, 401);
  assert.ok(!/bcrypt|sql|syntax/i.test(JSON.stringify(r.data)));
});

await test('brute-force throttling engages after repeated attempts (429)', async () => {
  let saw429 = false;
  // Use a distinct forwarded IP so this probe never exhausts the bucket used
  // by the legitimate logins later in this suite.
  const probeIp = '203.0.113.10';
  for (let i = 0; i < 14; i++) {
    const r = await req('POST', '/api/auth/login', {
      body: { email: 'ratelimit.probe@bsc.local', password: 'nope-nope' },
      headers: { 'X-Forwarded-For': probeIp },
    });
    if (r.status === 429) { saw429 = true; break; }
  }
  assert.ok(saw429, 'expected a 429 after repeated login attempts');
});

// ── 3. Injection / tampering probes ──────────────────────────────────────
await test('SQL injection in the login email is neutralised', async () => {
  const r = await req('POST', '/api/auth/login', {
    body: { email: "' OR 1=1 --", password: 'x' },
  });
  assert.ok(r.status < 500, `server errored instead of rejecting: ${r.status}`);
});

await test('search endpoint handles XSS payloads without echoing executable markup', async () => {
  const admin = await login('admin@bsc.local', 'Admin@123');
  const r = await req('GET', `/api/search?q=${encodeURIComponent('<script>alert(1)</script>')}`, { token: admin.token });
  assert.ok(r.status < 500);
  const raw = JSON.stringify(r.data);
  assert.ok(!raw.includes('<script>'), 'script tag must not be reflected verbatim');
});

// ── 4. Role / scope enforcement (RBAC) ───────────────────────────────────
const admin = await login('admin@bsc.local', 'Admin@123');
// Use a non-admin user from seed (domain_admin) - dvg.admin@bsc.local with Admin@123
const vlad = await login('dvg.admin@bsc.local', 'Admin@123');

await test('admin can list users; the account manager cannot assign roles', async () => {
  const users = await req('GET', '/api/users', { token: admin.token });
  assert.equal(users.status, 200);
  const target = users.data.data.find((u) => u.username === 'sureshmen');
  const r = await req('PATCH', `/api/users/${target?.id || admin.user.id}`, {
    token: vlad.token,
    body: { roles: ['super_admin'], divisionIds: [], sectionIds: [] },
  });
  assert.equal(r.status, 403, 'non-admin must never assign roles');
});

await test('account manager cannot create/modify roles or role permissions', async () => {
  const r1 = await req('POST', '/api/roles', { token: vlad.token, body: { code: 'pwn', name: 'Pwn' } });
  assert.equal(r1.status, 403);
  const r2 = await req('PUT', `/api/roles/00000000-0000-0000-0000-000000000000/permissions`, {
    token: vlad.token, body: { permissionIds: [] },
  });
  assert.ok([403, 404].includes(r2.status));
  assert.notEqual(r2.status, 200);
});

await test('account manager cannot edit users or reset passwords', async () => {
  // The account manager has no users.manage permission, so even listing is blocked.
  const users = await req('GET', '/api/users', { token: vlad.token });
  assert.equal(users.status, 403);
  const someId = admin.user.id;
  const r = await req('PATCH', `/api/users/${someId}`, { token: vlad.token, body: { status: 'inactive' } });
  assert.equal(r.status, 403);
  const rp = await req('POST', `/api/users/${someId}/reset-password`, { token: vlad.token, body: { newPassword: 'whatever123' } });
  assert.equal(rp.status, 403);
});

await test('collection-scoped buyer sees only their collection and is blocked outside it', async () => {
  const suresh = await login('sureshmen@bsc.local', 'Buyer@12345');
  const list = await req('GET', '/api/purchase-orders', { token: suresh.token });
  assert.equal(list.status, 200);
  const sections = new Set(list.data.data.map((p) => p.section_name));
  for (const s of sections) assert.match(s, /Men's Shirts/, `leaked section: ${s}`);
  // live monitor is administrator-only
  const live = await req('GET', '/api/tracking/live', { token: suresh.token });
  assert.equal(live.status, 403);
});

await test('sensitive settings changes are rejected for non-admins', async () => {
  const r = await req('PUT', '/api/settings/security', { token: vlad.token, body: { value: { devtoolsBlock: false } } });
  assert.ok([403, 401].includes(r.status));
});

// ── 5. Header hygiene ─────────────────────────────────────────────────────
await test('security headers are present on API responses', async () => {
  const r = await req('GET', '/api/health');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('x-frame-options') || '', /SAMEORIGIN|DENY/);
  assert.ok((r.headers.get('referrer-policy') || '').length > 0);
});

// ── summary ───────────────────────────────────────────────────────────────
const icon = (s) => (s === 'PASS' ? '✅' : s === 'SKIP' ? '⏭️ ' : '❌');
console.log(results.map(([s, n]) => `${icon(s)} ${n}`).join('\n'));
const failed = results.filter((r) => r[0] === 'FAIL').length;
const skipped = results.filter((r) => r[0] === 'SKIP').length;
const summary = `${results.length - failed - skipped}/${results.length} black-box security tests passed` +
  (skipped ? ` (${skipped} skipped)` : '');
console.log(`\n${summary}`);
process.exit(failed ? 1 : 0);
