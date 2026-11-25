import 'dotenv/config';
import { query, pool } from './src/config/db.js';

const perms = (await query('SELECT code, module FROM permissions ORDER BY code')).rows;
console.log(`PERMISSIONS (${perms.length}):`);
console.log(perms.map((x) => x.code).join(', '));

const rp = (await query(
  `SELECT r.code AS role, GROUP_CONCAT(p.code ORDER BY p.code) AS perms
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id
    GROUP BY r.code ORDER BY r.code`)).rows;
console.log('\nROLE GRANTS:');
for (const row of rp) console.log(`- ${row.role}: ${row.perms}`);

const missing = (await query(
  `SELECT r.code AS role, p.code AS perm
     FROM roles r CROSS JOIN permissions p
    WHERE NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id)
      AND p.code IN ('masters.view','catalogue.view')
    ORDER BY r.code, p.code`)).rows;
console.log('\nMissing view grants (role, perm):', missing);

await pool.end();
