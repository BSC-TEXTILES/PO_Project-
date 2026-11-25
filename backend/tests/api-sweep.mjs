// API sweep — boots the server on MySQL and calls EVERY GET route (parsed from the
// route files) as three users with different scopes. Any 5xx response is a failure;
// 2xx/4xx are reported (4xx = correctly refused / not found).
//   node tests/api-sweep.mjs            (MySQL target from DB_* env / backend/.env)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.SWEEP_PORT || '4403';
const BASE = `http://localhost:${PORT}`;
const { query, pool } = await import('../src/config/db.js');

// mount points from src/app.js
const appSrc = fs.readFileSync(path.join(BACKEND, 'src/app.js'), 'utf8');
const imports = Object.fromEntries([...appSrc.matchAll(/import (\w+) from '\.\/routes\/(\w+)\.js'/g)].map((m) => [m[1], m[2]]));
const mounts = [...appSrc.matchAll(/app\.use\('([^']+)',\s*(\w+)\)/g)].filter((m) => imports[m[2]]).map((m) => ({ base: m[1], file: imports[m[2]] }));

const routes = [];
for (const { base, file } of mounts) {
  const src = fs.readFileSync(path.join(BACKEND, 'src/routes', `${file}.js`), 'utf8');
  for (const m of src.matchAll(/\br\.get\('([^']+)'/g)) routes.push({ file, path: (base + m[1]).replace(/\/+/g, '/').replace(/\/$/, '') });
}

// real ids for path parameters
const one = async (sql, p = []) => (await query(sql, p)).rows[0];
const ids = {
  purchase_orders: (await one('SELECT id FROM purchase_orders ORDER BY created_at LIMIT 1'))?.id,
  users: (await one("SELECT id FROM users WHERE email='buyer.dvg@bsc.local'"))?.id,
  roles: (await one('SELECT id FROM roles LIMIT 1'))?.id,
  sections: (await one("SELECT id FROM sections WHERE code='MEN-SHIRTS'"))?.id || (await one('SELECT id FROM sections LIMIT 1'))?.id,
  products: (await one('SELECT id FROM products LIMIT 1'))?.id,
  brands: (await one('SELECT id FROM brands LIMIT 1'))?.id,
  collections: (await one('SELECT id FROM collections LIMIT 1'))?.id,
  videos: (await one('SELECT id FROM videos LIMIT 1'))?.id,
  locations: (await one('SELECT id FROM locations LIMIT 1'))?.id,
  product_types: (await one('SELECT id FROM product_types LIMIT 1'))?.id,
  manufacturers: (await one('SELECT id FROM manufacturers LIMIT 1'))?.id,
  file_attachments: (await one('SELECT id FROM file_attachments LIMIT 1'))?.id,
  import_history: (await one('SELECT id FROM import_history LIMIT 1'))?.id,
  receipts: (await one('SELECT id FROM receipts LIMIT 1'))?.id,
  suppliers: (await one('SELECT id FROM suppliers LIMIT 1'))?.id,
  divisions: (await one('SELECT id FROM divisions LIMIT 1'))?.id,
  dealers: (await one('SELECT id FROM dealers LIMIT 1'))?.id,
};
const MISSING = '00000000-0000-0000-0000-000000000000';
const FILE_TABLE = { purchaseOrders: 'purchase_orders', users: 'users', roles: 'roles', videos: 'videos', locations: 'locations',
  productTypes: 'product_types', manufacturers: 'manufacturers', files: 'file_attachments', import: 'import_history',
  receipts: 'receipts', collections: 'collections', uploads: 'products' };
function fill(route) {
  return route.path.replace(/:(\w+)/g, (_, name, offset) => {
    if (name === 'name') return 'po-register';
    if (name === 'date') return new Date().toISOString().slice(0, 10);
    if (name === 'key') return 'security';
    if (name === 'poId') return ids.purchase_orders;
    if (name === 'productId') return ids.products;
    const seg = route.path.slice(0, offset).split('/').filter(Boolean).pop()?.replace(/-/g, '_');
    const table = ids[seg] !== undefined ? seg : FILE_TABLE[route.file];
    return ids[table] || MISSING;
  });
}

const server = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
process.on('exit', () => server.kill());
let up = false;
for (let i = 0; i < 50 && !up; i++) { try { up = (await fetch(`${BASE}/api/health`)).ok; } catch { await sleep(300); } }
if (!up) { console.error(`server did not boot:\n${log.slice(-1500)}`); process.exit(1); }

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`login ${email}: ${JSON.stringify(j)}`);
  return j.token || j.accessToken;
}
const users = {
  admin: await login('admin@bsc.local', 'Admin@123'),
  buyer: await login('buyer.dvg@bsc.local', 'PE@12345'),
  auditor: await login('auditor@bsc.local', 'AU@12345'),
};

const skip = new Set(['/api/auth/captcha']); // pure in-memory
let failures = 0; const tally = {};
for (const route of routes) {
  if (skip.has(route.path)) continue;
  const url = fill(route) + (route.path.endsWith('/search') ? '?q=lev' : '');
  for (const [who, token] of Object.entries(users)) {
    const r = await fetch(BASE + url, { headers: { Authorization: `Bearer ${token}` } });
    const cls = `${String(r.status)[0]}xx`;
    tally[cls] = (tally[cls] || 0) + 1;
    if (process.env.SWEEP_SHOW_4XX && who === "admin" && r.status >= 400 && r.status < 500) console.log(`  ${r.status} admin GET ${url} ${(await r.clone().text()).slice(0, 120)}`);
    if (r.status >= 500) {
      failures++;
      console.log(`✗ ${r.status} ${who.padEnd(7)} GET ${url}  ${(await r.text()).slice(0, 160)}`);
    }
  }
}
console.log(`\n${routes.length} GET routes × ${Object.keys(users).length} users: ${JSON.stringify(tally)}`);
if (failures) console.log(`Server error log tail:\n${log.split('\n').filter((l) => /Error|SQL/.test(l)).slice(-20).join('\n')}`);
console.log(failures ? `${failures} request(s) returned 5xx` : 'No 5xx responses.');
server.kill();
await pool.end();
process.exit(failures ? 1 : 0);
