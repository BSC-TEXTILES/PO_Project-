#!/usr/bin/env node
// npm run db:integrity — read-only consistency checks on the MySQL database.
// Exit code 1 if any ERROR-level check fails (WARN checks are informational).
import mysql from 'mysql2/promise';
import { resolveDbConfig, describeDb } from '../src/config/dbConfig.js';

const cfg = resolveDbConfig();
const conn = await mysql.createConnection({
  host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, ssl: cfg.ssl,
});
const bt = (s) => '`' + s.replace(/`/g, '``') + '`';
console.log(`Integrity checks on ${describeDb(cfg)}\n`);
let errors = 0;
async function check(level, label, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  const n = Number(rows[0]?.n ?? rows.length);
  const bad = n > 0;
  if (bad && level === 'ERROR') errors++;
  console.log(`${bad ? (level === 'ERROR' ? '✗' : '!') : '✓'} ${label}${bad ? ` — ${n}` : ''}`);
}

// 1. every foreign key resolves
const [fks] = await conn.query(
  `SELECT TABLE_NAME t, COLUMN_NAME c, REFERENCED_TABLE_NAME rt, REFERENCED_COLUMN_NAME rc, CONSTRAINT_NAME name
     FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY t, name`);
let orphanTotal = 0;
for (const fk of fks) {
  const [[{ n }]] = await conn.query(
    `SELECT COUNT(*) n FROM ${bt(fk.t)} x LEFT JOIN ${bt(fk.rt)} y ON y.${bt(fk.rc)} = x.${bt(fk.c)}
      WHERE x.${bt(fk.c)} IS NOT NULL AND y.${bt(fk.rc)} IS NULL`);
  if (Number(n)) { orphanTotal += Number(n); console.log(`✗ orphan rows ${fk.t}.${fk.c} → ${fk.rt}.${fk.rc}: ${n}`); }
}
if (orphanTotal) errors++; else console.log(`✓ ${fks.length} foreign keys — no orphan rows`);

// 2. business invariants
await check('ERROR', 'PO line total_quantity equals the sum of its size quantities',
  `SELECT COUNT(*) n FROM purchase_order_items i
    WHERE i.total_quantity <> (SELECT COALESCE(SUM(q.quantity),0) FROM purchase_order_quantities q WHERE q.po_item_id = i.id)
      AND EXISTS (SELECT 1 FROM purchase_order_quantities q WHERE q.po_item_id = i.id)`);
await check('ERROR', 'accepted (posted) receipt quantity never exceeds ordered quantity (RB-013)',
  `SELECT COUNT(*) n FROM purchase_order_items i
    WHERE (SELECT COALESCE(SUM(ri.accepted_qty),0) FROM receipt_items ri JOIN receipts r ON r.id = ri.receipt_id
            WHERE ri.po_item_id = i.id AND r.status = 'posted') > i.total_quantity`);
await check('ERROR', 'PO line products belong to the PO section (RB-002)',
  `SELECT COUNT(*) n FROM purchase_order_items i JOIN purchase_orders po ON po.id = i.po_id
     JOIN products p ON p.id = i.product_id WHERE p.section_id <> po.section_id`);
await check('ERROR', 'duplicate user e-mails (case-insensitive)',
  'SELECT COUNT(*) n FROM (SELECT LOWER(email) e FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1) d');
await check('ERROR', 'duplicate product SKUs (case-insensitive)',
  'SELECT COUNT(*) n FROM (SELECT LOWER(sku) s FROM products GROUP BY LOWER(sku) HAVING COUNT(*) > 1) d');
await check('ERROR', 'inventory balance below zero for any division/product/size',
  `SELECT COUNT(*) n FROM (SELECT division_id, product_id, size_id FROM inventory_transactions
     GROUP BY division_id, product_id, size_id HAVING SUM(quantity) < 0) b`);
await check('WARN', 'active users without any role',
  `SELECT COUNT(*) n FROM users u WHERE u.status = 'active' AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)`);
await check('WARN', 'non-admin active users without a division (they will see no division data)',
  `SELECT COUNT(*) n FROM users u WHERE u.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.user_id = u.id)
     AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'super_admin')`);

// 3. table check (InnoDB corruption)
const [tables] = await conn.query('SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = \'BASE TABLE\'');
const [res] = await conn.query(`CHECK TABLE ${tables.map((x) => bt(x.t)).join(', ')}`);
const notOk = res.filter((r) => r.Msg_type === 'error' || (r.Msg_type === 'status' && r.Msg_text !== 'OK'));
if (notOk.length) { errors++; notOk.forEach((r) => console.log(`✗ CHECK TABLE ${r.Table}: ${r.Msg_text}`)); }
else console.log(`✓ CHECK TABLE: ${tables.length} tables OK`);

await conn.end();
console.log(errors ? `\n${errors} check(s) failed.` : '\nAll integrity checks passed.');
process.exit(errors ? 1 : 0);
