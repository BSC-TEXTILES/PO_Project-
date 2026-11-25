import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from './src/config/db.js';

const EXPECTED = [
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

const rows = (await query(
  `SELECT u.id, u.email, u.username, u.full_name, u.status, u.password_hash,
          GROUP_CONCAT(DISTINCT r.code) AS roles,
          GROUP_CONCAT(DISTINCT d.code) AS divisions,
          GROUP_CONCAT(DISTINCT s.code) AS sections
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     LEFT JOIN user_divisions ud ON ud.user_id = u.id
     LEFT JOIN divisions d ON d.id = ud.division_id
     LEFT JOIN user_sections us ON us.user_id = u.id
     LEFT JOIN sections s ON s.id = us.section_id
    GROUP BY u.id ORDER BY u.email`)).rows;

console.log(`Users in DB: ${rows.length}`);
for (const r of rows) {
  console.log(`- ${r.email} | ${r.full_name} | status=${r.status} | roles=${r.roles || '-'} | div=${r.divisions || '-'} | sec=${r.sections || '-'}`);
}

console.log('\nPassword verification against expected credentials:');
let failures = 0;
for (const [email, password, role] of EXPECTED) {
  const u = rows.find((x) => x.email === email);
  if (!u) { console.log(`  MISSING USER: ${email}`); failures++; continue; }
  const ok = await bcrypt.compare(password, u.password_hash);
  const roleOk = (u.roles || '').split(',').includes(role);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${email.padEnd(26)} role=${role}${roleOk ? '' : ' (MISMATCH: ' + u.roles + ')'}`);
  if (!ok || !roleOk) failures++;
}
console.log(failures === 0 ? '\nAll expected users verified.' : `\n${failures} user(s) need fixing.`);

// Data counts that the Men's Collection depends on
const counts = {};
for (const [label, sql] of [
  ['departments', 'SELECT count(*) c FROM departments'],
  ['sections', 'SELECT count(*) c FROM sections'],
  ['brands', 'SELECT count(*) c FROM brands'],
  ['products', 'SELECT count(*) c FROM products'],
  ['product_images', 'SELECT count(*) c FROM product_images'],
  ['colours', 'SELECT count(*) c FROM colours'],
  ['suppliers', 'SELECT count(*) c FROM suppliers'],
  ['locations', 'SELECT count(*) c FROM locations'],
  ['divisions', 'SELECT count(*) c FROM divisions'],
  ['categories', 'SELECT count(*) c FROM categories'],
  ['purchase_orders', 'SELECT count(*) c FROM purchase_orders'],
]) {
  counts[label] = (await query(sql)).rows[0].c;
}
console.log('\nData counts:', counts);

await pool.end();
