#!/usr/bin/env node
// npm run db:check — precise MySQL diagnostics (service, credentials, database,
// privileges, schema version). Read-only; prints no secrets.
import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbConfig, describeDb } from '../src/config/dbConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HINTS = {
  ECONNREFUSED: 'MySQL is not listening on that host/port. Start it: net start MySQL80 (Windows) or check DB_HOST/DB_PORT.',
  ENOTFOUND: 'DB_HOST does not resolve.',
  ETIMEDOUT: 'Connection timed out — firewall, wrong host, or server overloaded.',
  ER_ACCESS_DENIED_ERROR: 'Wrong DB_USER / DB_PASSWORD, or the account is not allowed from this host.',
  ER_BAD_DB_ERROR: 'The database in DB_NAME does not exist yet. Run: npm run db:migrate -- --create-db',
  ER_DBACCESS_DENIED_ERROR: 'The account has no privileges on DB_NAME.',
};

let cfg;
try { cfg = resolveDbConfig(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
console.log(`Target: ${describeDb(cfg)} (connection limit ${cfg.connectionLimit})`);

const started = Date.now();
let conn;
try {
  conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database,
    ssl: cfg.ssl, connectTimeout: 8000,
  });
} catch (e) {
  console.error(`✗ Cannot connect: ${e.code || ''} ${e.message}`);
  if (HINTS[e.code]) console.error(`  → ${HINTS[e.code]}`);
  process.exit(1);
}
const [[info]] = await conn.query('SELECT VERSION() AS version, DATABASE() AS db, CURRENT_USER() AS user, @@global.time_zone AS tz, @@character_set_server AS charset');
console.log(`✓ Connected in ${Date.now() - started} ms — MySQL ${info.version}, database ${info.db}, account ${info.user}`);

const [grants] = await conn.query('SHOW GRANTS');
const g = grants.map((r) => Object.values(r)[0]).join('\n');
const need = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const all = /ALL PRIVILEGES/i.test(g);
const missing = all ? [] : need.filter((p) => !new RegExp(`\\b${p}\\b`, 'i').test(g));
console.log(missing.length ? `✗ Missing privileges: ${missing.join(', ')}` : '✓ Data privileges present (SELECT/INSERT/UPDATE/DELETE)');

const [[mt]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations'");
if (!Number(mt.n)) {
  console.log('✗ Schema not initialised — run: npm run db:migrate');
} else {
  const [applied] = await conn.query('SELECT version FROM schema_migrations ORDER BY version');
  const files = fs.readdirSync(path.resolve(__dirname, '../../database/mysql')).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const pending = files.filter((f) => !applied.some((a) => a.version === f));
  console.log(pending.length ? `✗ Pending migrations: ${pending.join(', ')} — run: npm run db:migrate` : `✓ Schema up to date (${applied.length} migrations)`);
  const [[t]] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  const [[u]] = await conn.query('SELECT COUNT(*) AS n FROM users').catch(() => [[{ n: '?' }]]);
  console.log(`  ${t.n} tables, ${u.n} users`);
}
await conn.end();
process.exit(missing.length ? 1 : 0);
