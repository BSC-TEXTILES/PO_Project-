// Temporary read-only verification harness — logs in every demo account and
// exercises catalogue search/brand/category filters plus permission gates.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 4002;
const BASE = `http://localhost:${PORT}/api`;

let passed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  OK   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function api(method, p, { token, body } = {}) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 */ }
  return { status: res.status, json };
}

const ACCOUNTS = [
  ['admin@bsc.local', 'Admin@123', 'super_admin'],
  ['dvg.admin@bsc.local', 'Admin@123', 'domain_admin'],
  ['pm.dvg@bsc.local', 'PM@12345', 'purchase_manager'],
  ['buyer.dvg@bsc.local', 'PE@12345', 'purchase_executive'],
  ['approver.dvg@bsc.local', 'AP@12345', 'approver'],
  ['receiver.dvg@bsc.local', 'RC@12345', 'receiving_user'],
  ['viewer@bsc.local', 'VW@12345', 'viewer'],
  ['auditor@bsc.local', 'AU@12345', 'auditor'],
  ['sureshmen@bsc.local', 'Buyer@12345', 'purchase_executive'],
  ['men.supervisor@bsc.local', 'DS@12345', 'division_supervisor'],
];

async function login(email, password) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch { /* not up */ }
    await sleep(300);
  }
  return false;
}

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: BACKEND_DIR,
  env: { ...process.env, PORT: String(PORT), JWT_SECRET: 'verify-secret' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

try {
  check('server boots', await waitForHealth(), serverLog.slice(-600));
  if (failures.length) throw new Error('server did not boot');

  // ---------- all ten accounts ----------
  const sessions = {};
  for (const [email, password, role] of ACCOUNTS) {
    try {
      const s = await login(email, password);
      sessions[email] = s;
      const u = s.user;
      check(`login ${email}`, !!s.token && u.email === email, JSON.stringify(s).slice(0, 160));
      check(`role ${email} = ${role}`, (u.roles || []).includes(role), JSON.stringify(u.roles));
      check(`permissions ${email}`, Array.isArray(u.permissions) && u.permissions.includes('masters.view'), JSON.stringify(u.permissions || []));
      const me = await api('GET', '/auth/me', { token: s.token });
      check(`session ${email}`, me.status === 200 && me.json.user?.email === email, `${me.status}`);
    } catch (e) {
      check(`login ${email}`, false, e.message);
    }
  }

  const admin = sessions['admin@bsc.local'];
  const tok = admin.token;

  // ---------- permission-gated reads for every account ----------
  const deps = (await api('GET', '/departments', { token: tok })).json.data || [];
  const men = deps.find((d) => d.code === 'MEN');
  check('MEN department resolves', !!men);

  for (const [email] of ACCOUNTS) {
    const s = sessions[email];
    if (!s) continue;
    const probes = [
      ['departments', '/departments'],
      ['sections', '/sections?status=active'],
      ['brands', '/brands?departmentId=' + men.id],
      ['products', '/products?departmentId=' + men.id + '&pageSize=3'],
      ['categories', '/categories'],
      ['colours', '/colours'],
      ['suppliers', '/suppliers?status=active'],
      ['locations', '/locations'],
      ['divisions', '/divisions'],
      ['purchase-orders', '/purchase-orders?pageSize=3'],
      ['dashboard', '/reports/dashboard'],
    ];
    for (const [label, p] of probes) {
      const r = await api('GET', p, { token: s.token });
      check(`${label} accessible: ${email}`, r.status === 200, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
    }
  }

  // Role-specific pages.
  const approver = sessions['approver.dvg@bsc.local'];
  check('approver queue', (await api('GET', '/approvals/queue', { token: approver.token })).status === 200);
  const receiver = sessions['receiver.dvg@bsc.local'];
  check('receiver receipts', (await api('GET', '/receipts?pageSize=3', { token: receiver.token })).status === 200);
  const auditor = sessions['auditor@bsc.local'];
  check('auditor audit trail', (await api('GET', '/audit-logs?pageSize=3', { token: auditor.token })).status === 200);
  const viewer = sessions['viewer@bsc.local'];
  check('viewer denied audit trail (RBAC enforced)', (await api('GET', '/audit-logs?pageSize=3', { token: viewer.token })).status === 403);
  const buyer = sessions['buyer.dvg@bsc.local'];
  check('buyer denied user admin (RBAC enforced)', (await api('GET', '/users', { token: buyer.token })).status === 403);

  // Supervisor section scope.
  const supervisor = sessions['men.supervisor@bsc.local'];
  const supProducts = (await api('GET', '/products?pageSize=100', { token: supervisor.token })).json.data || [];
  const supSections = new Set(supervisor.user.sectionIds || []);
  check('supervisor product list is section-scoped',
    supProducts.length > 0 && supProducts.every((p) => supSections.has(String(p.section_id))),
    `rows=${supProducts.length} sections=${JSON.stringify([...supSections])}`);

  // ---------- catalogue filters with real data ----------
  const sections = (await api('GET', '/sections?status=active&departmentId=' + men.id, { token: tok })).json.data || [];
  check('MEN has the six requested categories', ['MEN-SHIRTS', 'MEN-TROUSERS', 'MEN-TSHIRTS', 'MEN-ETHNIC', 'MEN-INNERWEAR', 'FOOTWEAR-M'].every((c) => sections.some((s) => s.code === c)), sections.map((s) => s.code).join(','));

  const brands = (await api('GET', '/brands?departmentId=' + men.id, { token: tok })).json.data || [];
  check('brands load dynamically for MEN', brands.length > 0, `brands=${brands.length}`);
  check('brand product counts are numeric', brands.every((b) => Number.isFinite(Number(b.product_count))));

  const base = (await api('GET', `/products?departmentId=${men.id}&pageSize=50`, { token: tok })).json;
  check('MEN catalogue loads', base.total > 0 && base.data.length > 0, `total=${base.total}`);
  const sample = base.data[0];
  const shirtSection = sections.find((s) => s.code === 'MEN-SHIRTS');
  const sampleBrand = brands.find((b) => b.id === sample.brand_id) || brands[0];
  check('sample product has name/sku/brand/section/hsn', !!(sample.name && sample.sku && sample.brand_name && sample.section_name && sample.hsn_sac), JSON.stringify(sample).slice(0, 220));

  const q = (v) => encodeURIComponent(v);
  const search = async (term, extra = '') =>
    (await api('GET', `/products?departmentId=${men.id}&pageSize=100&search=${q(term)}${extra}`, { token: tok })).json;

  const fullName = await search(sample.name);
  check('search: complete product name finds it', fullName.data.some((p) => p.id === sample.id), `total=${fullName.total}`);

  const firstWord = sample.name.split(/\s+/).find((w) => w.length >= 3) || sample.name;
  const partial = await search(firstWord);
  check(`search: partial name "${firstWord}" finds it`, partial.data.some((p) => p.id === sample.id), `total=${partial.total}`);

  const fullSku = await search(sample.sku);
  check('search: complete SKU finds it', fullSku.data.some((p) => p.id === sample.id), `total=${fullSku.total}`);

  const skuPart = sample.sku.slice(1, Math.min(7, sample.sku.length));
  const skuPartial = await search(skuPart);
  check(`search: partial SKU "${skuPart}" finds it`, skuPartial.data.some((p) => p.id === sample.id), `total=${skuPartial.total}`);

  const brandSearch = await search(sampleBrand.brand_name);
  check('search: brand name finds its products', brandSearch.data.some((p) => p.brand_id === sampleBrand.id), `total=${brandSearch.total}`);

  if (sample.manufacturer) {
    const mfr = await search(sample.manufacturer);
    check('search: manufacturer finds its products', mfr.data.some((p) => p.id === sample.id), `total=${mfr.total}`);
  } else {
    check('search: manufacturer data available on sample', false, 'sample has no manufacturer');
  }

  const catSearch = await search(sample.section_name);
  check('search: category/section name finds its products', catSearch.data.some((p) => p.section_id === sample.section_id), `total=${catSearch.total}`);

  const lowerBrand = await search(sampleBrand.brand_name.toLowerCase());
  check('search: case-insensitive', lowerBrand.data.some((p) => p.id === sample.id), `total=${lowerBrand.total}`);

  const combinedNameBrand = await search(firstWord, `&brandId=${sampleBrand.id}`);
  check('filter: search + brand combine', combinedNameBrand.data.every((p) => p.brand_id === sampleBrand.id) && combinedNameBrand.data.some((p) => p.id === sample.id), `total=${combinedNameBrand.total}`);

  const combinedSkuSection = await search(skuPart, `&sectionId=${sample.section_id}`);
  check('filter: SKU search + category combine', combinedSkuSection.data.every((p) => p.section_id === sample.section_id) && combinedSkuSection.data.some((p) => p.id === sample.id), `total=${combinedSkuSection.total}`);

  const brandOnly = await search('', `&brandId=${sampleBrand.id}`);
  check('filter: brand only', brandOnly.data.every((p) => p.brand_id === sampleBrand.id) && brandOnly.total > 0, `total=${brandOnly.total}`);

  const sectionOnly = await search('', `&sectionId=${sample.section_id}`);
  check('filter: category only', sectionOnly.data.every((p) => p.section_id === sample.section_id) && sectionOnly.total > 0, `total=${sectionOnly.total}`);

  const empty = await search('zzzz-no-such-product-9999');
  check('search: no-match returns empty state data', empty.total === 0 && empty.data.length === 0, `total=${empty.total}`);

  const cleared = await search('');
  check('search: clearing restores full list', cleared.total === base.total, `${cleared.total} vs ${base.total}`);

  const facetSum = Object.values(base.sectionCounts || {}).reduce((a, b) => a + Number(b), 0);
  check('category counts sum to department total', facetSum === base.total, `facets=${facetSum} total=${base.total}`);
  check('category count matches filtered total', base.sectionCounts?.[shirtSection.id] === (await search('', `&sectionId=${shirtSection.id}`)).total,
    `facet=${base.sectionCounts?.[shirtSection.id]}`);

  const page1 = (await api('GET', `/products?departmentId=${men.id}&pageSize=5&page=1`, { token: tok })).json;
  const page2 = (await api('GET', `/products?departmentId=${men.id}&pageSize=5&page=2`, { token: tok })).json;
  check('pagination: page 2 is a different slice', page1.data.length === 5 && page2.data.length > 0 && page1.data[0].id !== page2.data[0].id, `p1=${page1.data[0]?.id} p2=${page2.data[0]?.id}`);
} finally {
  server.kill();
  await sleep(300);
}

console.log(`\n=== API VERIFY: ${passed} passed, ${failures.length} failed ===`);
if (failures.length) {
  console.log('Failed checks:', failures);
  process.exitCode = 1;
}
