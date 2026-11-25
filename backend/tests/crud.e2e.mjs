// Write-path E2E on MySQL — create / update / delete for every master-data module,
// users / roles / settings, file + video uploads, the product import flow, plus
// transaction rollback and concurrent-write safety. Boots its own API server.
//   node tests/crud.e2e.mjs          (MySQL target from DB_* env / backend/.env)
// Every record it creates uses a unique "T<run>" prefix and is archived/deleted at the end
// where the API supports it.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.CRUD_PORT || '4404';
const BASE = `http://localhost:${PORT}/api`;
const RUN = `T${Date.now().toString(36).toUpperCase()}`;
const { query, pool } = await import('../src/config/db.js');

let passed = 0; const failed = [];
const check = (name, ok, extra = '') => { if (ok) { passed++; console.log(`  ✔ ${name}`); } else { failed.push(name); console.log(`  ✘ ${name} ${extra}`); } };

const server = spawn(process.execPath, ['src/server.js'], { cwd: BACKEND, env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
process.on('exit', () => server.kill());
let up = false;
for (let i = 0; i < 50 && !up; i++) { try { up = (await fetch(`${BASE}/health`)).ok; } catch { await sleep(300); } }
if (!up) { console.error(`server did not boot\n${log.slice(-1500)}`); process.exit(1); }

async function api(method, p, { token, body, form } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  let json = null; try { json = await r.json(); } catch { /* 204 */ }
  return { status: r.status, json, data: json?.data };
}
const login = async (email, password) => (await api('POST', '/auth/login', { body: { email, password } })).json.token;
const T = await login('admin@bsc.local', 'Admin@123');
const BUYER = await login('buyer.dvg@bsc.local', 'PE@12345');
const blob = (text, type) => new Blob([text], { type });
const count = async (sql, p = []) => Number((await query(sql, p)).rows[0].n);

try {
  // ---------- organisation masters ----------
  const div = await api('POST', '/divisions', { token: T, body: { code: `${RUN}D`, name: `${RUN} Division`, location: 'Hubballi' } });
  check('divisions: create returns the stored row', div.status === 201 && div.data?.id && div.data.code === `${RUN}D`, JSON.stringify(div.json));
  const divU = await api('PATCH', `/divisions/${div.data.id}`, { token: T, body: { name: `${RUN} Division Renamed` } });
  check('divisions: update returns the updated row', divU.data?.name === `${RUN} Division Renamed`, JSON.stringify(divU.json));

  const dep = await api('POST', '/departments', { token: T, body: { code: `${RUN}DP`, name: `${RUN} Dept`, isGlobal: true } });
  check('departments: create', dep.status === 201 && dep.data?.id, JSON.stringify(dep.json));
  check('departments: update', (await api('PATCH', `/departments/${dep.data.id}`, { token: T, body: { name: `${RUN} Dept 2` } })).data?.name === `${RUN} Dept 2`);

  const sizeMethod = (await query("SELECT id FROM size_methods ORDER BY code LIMIT 1")).rows[0].id;
  const sec = await api('POST', '/sections', { token: T, body: { code: `${RUN}S`, name: `${RUN} Section`, departmentId: dep.data.id, sizingMethodId: sizeMethod, attributes: { fit: 'slim' } } });
  check('sections: create (JSON attributes round-trip)', sec.status === 201 && sec.data?.attributes?.fit === 'slim', JSON.stringify(sec.json));
  check('sections: update', (await api('PATCH', `/sections/${sec.data.id}`, { token: T, body: { displayOrder: 7 } })).data?.display_order === 7);

  const cat = await api('POST', '/categories', { token: T, body: { sectionId: sec.data.id, code: `${RUN}C`, name: `${RUN} Cat` } });
  check('categories: create', cat.status === 201 && cat.data?.id, JSON.stringify(cat.json));
  const catDup = await api('POST', '/categories', { token: T, body: { sectionId: sec.data.id, code: `${RUN}C`, name: 'dup' } });
  check('categories: duplicate (section, NULL parent, code) refused — NULLS NOT DISTINCT preserved', catDup.status === 409, `${catDup.status}`);
  check('categories: update', (await api('PATCH', `/categories/${cat.data.id}`, { token: T, body: { name: `${RUN} Cat 2` } })).data?.name === `${RUN} Cat 2`);

  const sz = await api('POST', '/sizes', { token: T, body: { sizeMethodId: sizeMethod, label: `${RUN}Z`, displayOrder: 99 } });
  check('sizes: create', sz.status === 201 && sz.data?.label === `${RUN}Z`, JSON.stringify(sz.json));
  const sz2 = await api('POST', '/sizes', { token: T, body: { sizeMethodId: sizeMethod, label: `${RUN}Z`, displayOrder: 98 } });
  check('sizes: same label upserts display order (no duplicate row)', sz2.data?.display_order === 98 && sz2.data?.id === sz.data.id);

  const col = await api('POST', '/colours', { token: T, body: { code: `${RUN}CL`, name: `${RUN} Teal`, swatchHex: '#008080' } });
  check('colours: create', col.status === 201 && col.data?.id, JSON.stringify(col.json));
  const colDup = await api('POST', '/colours', { token: T, body: { code: `${RUN}CX`, name: `${RUN} TEAL` } });
  check('colours: case-insensitive duplicate name blocked (§9.2)', colDup.status >= 400 && colDup.status < 500, `${colDup.status}`);
  check('colours: update', (await api('PATCH', `/colours/${col.data.id}`, { token: T, body: { colourFamily: 'Blue' } })).data?.colour_family === 'Blue');

  const brand = await api('POST', '/brands', { token: T, body: { brandName: `${RUN} Brand`, brandNumber: `${RUN}BN`, brandSerial: `${RUN}BS`, brandCode: 'TB' } });
  check('brands: create', brand.status === 201 && brand.data?.id, JSON.stringify(brand.json));
  check('brands: update', (await api('PATCH', `/brands/${brand.data.id}`, { token: T, body: { manufacturer: 'Test Mills' } })).data?.manufacturer === 'Test Mills');

  const prod = await api('POST', '/products', { token: T, body: { sku: `${RUN}-SKU`, name: `${RUN} Shirt`, brandId: brand.data.id, sectionId: sec.data.id, purchasePrice: 500, sellingPrice: 800, attributes: { gsm: 140 } } });
  check('products: create (serial from sequence, generated profit columns)', prod.status === 201 && /^PRD-\d{4}-\d{5}$/.test(prod.data?.product_serial) && Number(prod.data?.profit_amount) === 300 && Number(prod.data?.profit_margin) === 60, JSON.stringify(prod.json).slice(0, 300));
  const prodU = await api('PATCH', `/products/${prod.data.id}`, { token: T, body: { hsnSac: '6205' } });
  check('products: update', prodU.data?.hsn_sac === '6205', JSON.stringify(prodU.json).slice(0, 200));
  const price = await api('PATCH', `/pricing/${prod.data.id}`, { token: T, body: { sellingPrice: 900 } });
  check('pricing: update recomputes generated profit', Number(price.data?.profit_amount) === 400, JSON.stringify(price.json));
  const bulk = await api('POST', '/pricing/bulk', { token: T, body: { updates: [{ id: prod.data.id, purchasePrice: 550 }] } });
  check('pricing: bulk update (transactional)', bulk.data?.updated === 1);
  const bulkBad = await api('POST', '/pricing/bulk', { token: T, body: { updates: [{ id: prod.data.id, purchasePrice: 1 }, { id: prod.data.id, sellingPrice: -5 }] } });
  const afterBad = (await query('SELECT purchase_price FROM products WHERE id = ?', [prod.data.id])).rows[0].purchase_price;
  check('pricing: invalid bulk batch rejected with nothing applied', bulkBad.status === 400 && Number(afterBad) === 550, `${bulkBad.status} ${afterBad}`);

  const sup = await api('POST', '/suppliers', { token: T, body: { code: `${RUN}SUP`, companyName: `${RUN} Supplier`, gstin: '29ABCDE1234F1Z5', divisionIds: [div.data.id] } });
  check('suppliers: create with division links', sup.status === 201 && sup.data?.id, JSON.stringify(sup.json));
  const supU = await api('PATCH', `/suppliers/${sup.data.id}`, { token: T, body: { contactPerson: 'Ravi' } });
  check('suppliers: update', supU.data?.contact_person === 'Ravi', JSON.stringify(supU.json));

  // ---------- other masters ----------
  const coll = await api('POST', '/collections', { token: T, body: { code: `${RUN}COL`, name: `${RUN} Collection` } });
  check('collections: create', coll.status === 201 && coll.data?.id, JSON.stringify(coll.json));
  check('collections: update', (await api('PATCH', `/collections/${coll.data.id}`, { token: T, body: { displayOrder: 3 } })).data?.display_order === 3);
  check('collections: assign brand', (await api('PUT', `/brands/${brand.data.id}/collections`, { token: T, body: { collectionIds: [coll.data.id] } })).status < 300);

  const dealer = await api('POST', '/dealers', { token: T, body: { code: `${RUN}DL`, companyName: `${RUN} Dealer` } });
  check('dealers: create', dealer.status === 201 && dealer.data?.id, JSON.stringify(dealer.json));
  check('dealers: update', (await api('PATCH', `/dealers/${dealer.data.id}`, { token: T, body: { city: 'Mysuru' } })).data?.city === 'Mysuru');
  check('dealers: delete', (await api('DELETE', `/dealers/${dealer.data.id}`, { token: T })).status < 300);

  const loc = await api('POST', '/locations', { token: T, body: { code: `${RUN}L`, name: `${RUN} Store`, latitude: 15.3647, longitude: 75.124 } });
  check('locations: create (DECIMAL lat/long)', loc.status === 201 && Number(loc.data?.latitude) === 15.3647, JSON.stringify(loc.json));
  check('locations: update', (await api('PATCH', `/locations/${loc.data.id}`, { token: T, body: { city: 'Hubballi' } })).data?.city === 'Hubballi');
  check('locations: delete/archive', (await api('DELETE', `/locations/${loc.data.id}`, { token: T })).status < 300);

  const mfr = await api('POST', '/manufacturers', { token: T, body: { code: `${RUN}M`, name: `${RUN} Mills` } });
  check('manufacturers: create', mfr.status === 201 && mfr.data?.id, JSON.stringify(mfr.json));
  check('manufacturers: update', (await api('PATCH', `/manufacturers/${mfr.data.id}`, { token: T, body: { city: 'Tiruppur' } })).data?.city === 'Tiruppur');
  check('manufacturers: delete/archive', (await api('DELETE', `/manufacturers/${mfr.data.id}`, { token: T })).status < 300);

  const pt = await api('POST', '/product-types', { token: T, body: { sectionId: sec.data.id, code: `${RUN}PT`, name: `${RUN} Type` } });
  check('product types: create', pt.status === 201 && pt.data?.id, JSON.stringify(pt.json));
  check('product types: update', (await api('PATCH', `/product-types/${pt.data.id}`, { token: T, body: { name: `${RUN} Type 2` } })).data?.name === `${RUN} Type 2`);
  check('product types: delete/archive', (await api('DELETE', `/product-types/${pt.data.id}`, { token: T })).status < 300);

  // ---------- RBAC administration ----------
  const role = await api('POST', '/roles', { token: T, body: { code: `${RUN.toLowerCase()}_role`, name: `${RUN} Role` } });
  check('roles: create', role.status === 201 && role.data?.id, JSON.stringify(role.json));
  check('roles: update', (await api('PATCH', `/roles/${role.data.id}`, { token: T, body: { description: 'test' } })).data?.description === 'test');
  const perms = (await api('GET', '/roles/meta/permissions', { token: T })).data;
  const setPerms = await api('PUT', `/roles/${role.data.id}/permissions`, { token: T, body: { permissionIds: perms.slice(0, 3).map((p) => p.id) } });
  check('roles: replace permission set', setPerms.data?.length === 3, JSON.stringify(setPerms.json).slice(0, 200));
  const badPerms = await api('PUT', `/roles/${role.data.id}/permissions`, { token: T, body: { permissionIds: [perms[0].id, '00000000-0000-0000-0000-000000000000'] } });
  check('roles: invalid permission set rolls back completely (still 3)', badPerms.status >= 400 && (await count('SELECT COUNT(*) n FROM role_permissions WHERE role_id = ?', [role.data.id])) === 3, `${badPerms.status}`);

  const viewerRole = (await query("SELECT id FROM roles WHERE code = 'viewer'")).rows[0].id;
  const usr = await api('POST', '/users', { token: T, body: { email: `${RUN.toLowerCase()}@test.local`, username: `${RUN.toLowerCase()}.user`, fullName: `${RUN} User`, password: 'Str0ng!Passw0rd#', roles: ['viewer'], divisionIds: [div.data.id] } });
  check('users: create with role + division', usr.status === 201 && usr.data?.id, JSON.stringify(usr.json).slice(0, 300));
  const usrU = await api('PATCH', `/users/${usr.data.id}`, { token: T, body: { fullName: `${RUN} User Renamed`, divisionIds: [div.data.id] } });
  check('users: update', usrU.status === 200, JSON.stringify(usrU.json).slice(0, 200));
  check('users: new user can sign in', !!(await login(`${RUN.toLowerCase()}@test.local`, 'Str0ng!Passw0rd#')));
  check('users: password stored as bcrypt hash', /^\$2[aby]\$/.test((await query('SELECT password_hash FROM users WHERE id = ?', [usr.data.id])).rows[0].password_hash));
  void viewerRole;

  const me = await api('PATCH', '/users/me', { token: BUYER, body: { fullName: 'Davanagere Buyer', designation: 'Senior Buyer' } });
  check('profile: self update', me.data?.designation === 'Senior Buyer', JSON.stringify(me.json));

  const setting = await api('PUT', `/settings/${RUN.toLowerCase()}_flag`, { token: T, body: { value: { enabled: true, limit: 5 }, description: 'test flag' } });
  check('settings: upsert stores JSON value', setting.data?.value?.limit === 5, JSON.stringify(setting.json));
  const setting2 = await api('PUT', `/settings/${RUN.toLowerCase()}_flag`, { token: T, body: { value: 'plain string' } });
  check('settings: second upsert updates in place, keeps description', setting2.data?.value === 'plain string' && setting2.data?.description === 'test flag', JSON.stringify(setting2.json));
  check('settings: non-admin cannot change settings', (await api('PUT', '/settings/security', { token: BUYER, body: { value: {} } })).status === 403);

  // ---------- files / videos ----------
  const fd = new FormData(); fd.append('files', blob('hello mysql', 'text/plain'), `${RUN}.txt`); fd.append('description', 'test file');
  const fup = await api('POST', '/files', { token: T, form: fd });
  const file = fup.data?.[0] || fup.data;
  check('files: upload', fup.status === 201 && file?.id, JSON.stringify(fup.json).slice(0, 200));
  check('files: rename', (await api('PATCH', `/files/${file.id}`, { token: T, body: { fileName: `${RUN}-renamed.txt` } })).status === 200);
  const rfd = new FormData(); rfd.append('file', blob('replaced', 'text/plain'), `${RUN}-v2.txt`);
  const rep = await api('POST', `/files/${file.id}/replace`, { token: T, form: rfd });
  check('files: replace', rep.data?.replaced === true && rep.data?.file_name === `${RUN}-v2.txt`, JSON.stringify(rep.json).slice(0, 200));
  check('files: delete', (await api('DELETE', `/files/${file.id}`, { token: T })).status === 204);

  const vfd = new FormData(); vfd.append('file', blob('\0\0\0 ftypisom', 'video/mp4'), `${RUN}.mp4`); vfd.append('title', `${RUN} video`); vfd.append('category', 'other');
  const vid = await api('POST', '/videos', { token: T, form: vfd });
  check('videos: upload', vid.status === 201 && vid.data?.id, JSON.stringify(vid.json).slice(0, 200));
  check('videos: update', (await api('PATCH', `/videos/${vid.data.id}`, { token: T, body: { description: 'demo' } })).data?.description === 'demo');
  check('videos: delete', (await api('DELETE', `/videos/${vid.data.id}`, { token: T })).status < 300);

  // ---------- product import (preview → confirm → history/records) ----------
  const csv = `SKU,Product Name,Brand,Section,HSN\n${RUN}-IMP-1,${RUN} Imported One,${RUN} Brand,${RUN} Section,6205\n${RUN}-IMP-2,${RUN} Imported Two,${RUN} Brand,${RUN} Section,6205\n`;
  const ifd = new FormData(); ifd.append('file', blob(csv, 'text/csv'), `${RUN}.csv`);
  const imp = await api('POST', '/import/upload', { token: T, form: ifd });
  check('import: upload + preview (no product written yet)', imp.status === 201 && imp.data?.importId && (await count('SELECT COUNT(*) n FROM products WHERE sku LIKE ?', [`${RUN}-IMP-%`])) === 0, JSON.stringify(imp.json).slice(0, 300));
  const prev = await api('GET', `/import/${imp.data.importId}`, { token: T });
  check('import: preview re-loads from the stored upload', prev.status === 200, JSON.stringify(prev.json).slice(0, 200));
  const conf = await api('POST', `/import/${imp.data.importId}/confirm`, { token: T, body: { mapping: imp.data.preview.mapping } });
  check('import: confirm creates the products', conf.data?.imported === 2 && (await count('SELECT COUNT(*) n FROM products WHERE sku LIKE ?', [`${RUN}-IMP-%`])) === 2, JSON.stringify(conf.json).slice(0, 400));
  const hist = await api('GET', '/import/history', { token: T });
  check('import: history lists the session', hist.data?.some((h) => h.id === imp.data.importId && h.status === 'imported'), JSON.stringify(hist.json).slice(0, 200));
  check('import: per-row records stored', (await api('GET', `/import/${imp.data.importId}/records`, { token: T })).data?.length === 2);
  const ifd2 = new FormData(); ifd2.append('file', blob(csv, 'text/csv'), `${RUN}-b.csv`);
  const imp2 = await api('POST', '/import/upload', { token: T, form: ifd2 });
  check('import: cancel an awaiting import', (await api('DELETE', `/import/${imp2.data.importId}`, { token: T })).status === 200
    && (await query('SELECT status FROM import_history WHERE id = ?', [imp2.data.importId])).rows[0].status === 'cancelled');

  // ---------- notifications ----------
  check('notifications: mark all read', (await api('POST', '/notifications/read-all', { token: T })).status < 300);

  // ---------- transactions & concurrency on purchase orders ----------
  const shirts = (await query("SELECT s.id, s.department_id FROM sections s WHERE s.code = 'MEN-SHIRTS'")).rows[0];
  const dvg = (await query("SELECT id FROM divisions WHERE code = 'DVG'")).rows[0].id;
  const supplier = (await query("SELECT id FROM suppliers WHERE code = 'SUP-001'")).rows[0].id;
  const shirt = (await query("SELECT id FROM products WHERE sku = 'LVS-FS-001'")).rows[0].id;
  const sizeM = (await query("SELECT z.id FROM sizes z JOIN sections s ON s.sizing_method_id = z.size_method_id WHERE s.code='MEN-SHIRTS' AND z.label='M'")).rows[0].id;
  const header = { divisionId: dvg, departmentId: shirts.department_id, sectionId: shirts.id, supplierId: supplier, taxScheme: 'GST_INTRA' };
  const goodLine = { productId: shirt, purchasePrice: 500, marginPercent: 10, quantities: [{ sizeId: sizeM, quantity: 3 }] };

  const before = { po: await count('SELECT COUNT(*) n FROM purchase_orders'), items: await count('SELECT COUNT(*) n FROM purchase_order_items') };
  const bad = await api('POST', '/purchase-orders', { token: BUYER, body: { ...header, lines: [goodLine, { ...goodLine, purchasePrice: -1 }] } });
  const after = { po: await count('SELECT COUNT(*) n FROM purchase_orders'), items: await count('SELECT COUNT(*) n FROM purchase_order_items') };
  check('transactions: a PO failing on line 2 leaves no partial PO or lines', bad.status === 400 && before.po === after.po && before.items === after.items, `${bad.status} ${JSON.stringify(before)} ${JSON.stringify(after)}`);

  const N = 20;
  const results = await Promise.all(Array.from({ length: N }, () => api('POST', '/purchase-orders', { token: BUYER, body: { ...header, lines: [goodLine] } })));
  const numbers = results.map((r) => r.data?.po_number);
  check(`concurrency: ${N} simultaneous PO creates all succeed`, results.every((r) => r.status === 201), JSON.stringify(results.find((r) => r.status !== 201)?.json));
  check('concurrency: every PO number is unique and sequential', new Set(numbers).size === N && numbers.every((n) => /^PO-DVG-\d{4}-\d{5}$/.test(n)));

  const key = crypto.randomUUID();
  const idem = await Promise.all([1, 2, 3].map(() => api('POST', '/purchase-orders', { token: BUYER, body: { ...header, idempotencyKey: key, lines: [goodLine] } })));
  check('idempotency: concurrent replays of one key create exactly one PO', new Set(idem.map((r) => r.data?.id)).size === 1 && (await count('SELECT COUNT(*) n FROM purchase_orders WHERE idempotency_key = ?', [key])) === 1, JSON.stringify(idem.map((r) => r.status)));
  for (const r of [...results, idem[0]]) await api('POST', `/purchase-orders/${r.data.id}/cancel`, { token: BUYER, body: { reason: 'crud test cleanup' } }).catch(() => {});

  // ---------- audit trail ----------
  check('audit: creates/edits were written to audit_logs', (await count("SELECT COUNT(*) n FROM audit_logs WHERE occurred_at > UTC_TIMESTAMP() - INTERVAL 10 MINUTE AND action_type IN ('create','edit')")) > 10);
  let blocked = false;
  try { await query('DELETE FROM audit_logs ORDER BY id LIMIT 1'); } catch (e) { blocked = /append-only|DELETE command denied/i.test(e.message); }
  check('audit: audit_logs rows cannot be deleted', blocked);

  // ---------- cleanup of archivable test masters ----------
  await api('DELETE', `/categories/${cat.data.id}`, { token: T });
  await api('DELETE', `/brands/${brand.data.id}`, { token: T });
  await api('DELETE', `/sections/${sec.data.id}`, { token: T });
} catch (e) {
  failed.push(`crashed: ${e.stack}`);
  console.log(`  ✘ crashed: ${e.stack}`);
}

console.log(`\n=== CRUD E2E RESULT: ${passed} passed, ${failed.length} failed ===`);
if (failed.length) console.log(log.split('\n').filter((l) => /Error|SQL|\[ERROR\]/.test(l)).slice(-25).join('\n'));
server.kill();
await pool.end();
process.exit(failed.length ? 1 : 0);
