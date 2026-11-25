#!/usr/bin/env node
/**
 * POMS MySQL migration runner — applies database/mysql/NNN_*.sql in order.
 *
 *   npm run db:migrate              apply pending migrations
 *   npm run db:migrate -- --status  list applied / pending, change nothing
 *   npm run db:migrate -- --create-db   also CREATE DATABASE if it does not exist
 *
 * Guarantees
 *   * Applied versions are recorded in `schema_migrations` with a SHA-256 checksum.
 *     An already-applied file whose contents changed is refused (write a new migration).
 *   * Additive and idempotent: CREATE TABLE IF NOT EXISTS; "-- @fk table.name" and
 *     "-- @column table.col" markers skip foreign keys / columns that already exist.
 *   * Never drops or truncates tables holding data. Files whose header contains
 *     "@optional" (e.g. the audit-log triggers, which need extra privileges) are
 *     reported and skipped on failure instead of aborting the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { resolveDbConfig, describeDb } from '../src/config/dbConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/mysql');
const args = new Set(process.argv.slice(2));
const STATUS_ONLY = args.has('--status');
const CREATE_DB = args.has('--create-db');

/** Split a SQL file into statements, keeping the marker comment that precedes each. */
export function splitStatements(sqlText) {
  const out = [];
  let cur = '';
  let markers = [];
  let q = null;
  const lines = sqlText.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (!q && !cur.trim()) {
      const m = line.match(/^--\s*@(fk|column)\s+([a-z0-9_]+)\.([a-z0-9_]+)\s*$/i);
      if (m) { markers.push({ kind: m[1].toLowerCase(), table: m[2], name: m[3] }); continue; }
      if (/^\s*--/.test(line) || !line.trim()) continue;
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '-' && line[i + 1] === '-') break;
    }
    cur += line + '\n';
    if (!q && /;\s*(--.*)?$/.test(line)) {
      out.push({ sql: cur.trim().replace(/;\s*(--.*)?$/, ''), markers });
      cur = ''; markers = [];
    }
  }
  if (cur.trim()) out.push({ sql: cur.trim(), markers });
  return out;
}

async function exists(conn, db, marker) {
  if (marker.kind === 'fk') {
    const [r] = await conn.query(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [db, marker.table, marker.name]);
    return r.length > 0;
  }
  const [r] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [db, marker.table, marker.name]);
  return r.length > 0;
}

async function main() {
  const cfg = resolveDbConfig();
  console.log(`MySQL target: ${describeDb(cfg)}`);

  if (CREATE_DB) {
    let admin;
    try {
      admin = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, ssl: cfg.ssl });
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
      console.log(`Database ${cfg.database} is present.`);
    } catch (e) {
      if (e.code === 'ER_DBACCESS_DENIED_ERROR' || e.code === 'ER_ACCESS_DENIED_ERROR') {
        console.log(`Skipping CREATE DATABASE (${e.code}) — connecting directly to ${cfg.database}.`);
      } else {
        throw e;
      }
    } finally {
      if (admin) await admin.end().catch(() => {});
    }
  }

  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database,
    ssl: cfg.ssl, timezone: 'Z', multipleStatements: false,
  });
  await conn.query("SET SESSION time_zone = '+00:00'");
  const [[ver]] = await conn.query('SELECT VERSION() AS v');
  const [maj, min, patch] = ver.v.split(/[.-]/).map(Number);
  if (maj < 8 || (maj === 8 && min === 0 && patch < 19)) {
    throw new Error(`MySQL ${ver.v} is too old: POMS needs MySQL 8.0.19 or newer (expression defaults, CHECK constraints, LATERAL).`);
  }
  console.log(`Server: MySQL ${ver.v}`);

  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      duration_ms INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  const [appliedRows] = await conn.query('SELECT version, checksum FROM schema_migrations');
  const applied = new Map(appliedRows.map((r) => [r.version, r.checksum]));

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  let ran = 0; let failedOptional = 0;
  for (const file of files) {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`${file} was already applied but its contents changed. Never edit an applied migration — add a new one.`);
      }
      if (STATUS_ONLY) console.log(`  applied  ${file}`);
      continue;
    }
    if (STATUS_ONLY) { console.log(`  PENDING  ${file}`); continue; }

    const optional = /@optional/.test(text.split('\n').slice(0, 15).join('\n'));
    const started = Date.now();
    let skipped = 0;
    try {
      for (const st of splitStatements(text)) {
        let skip = false;
        for (const m of st.markers) if (await exists(conn, cfg.database, m)) skip = true;
        if (skip) { skipped++; continue; }
        await conn.query(st.sql);
      }
      await conn.query('INSERT INTO schema_migrations (version, checksum, duration_ms) VALUES (?, ?, ?)',
        [file, checksum, Date.now() - started]);
      ran++;
      console.log(`  ✓ ${file} (${Date.now() - started} ms${skipped ? `, ${skipped} already present` : ''})`);
    } catch (e) {
      if (optional) {
        failedOptional++;
        console.warn(`  ⚠ ${file} skipped (optional): ${e.message}`);
        if (/SUPER privilege|log_bin_trust_function_creators/i.test(e.message)) {
          console.warn('    Ask the DBA to run: SET GLOBAL log_bin_trust_function_creators = 1;  then re-run db:migrate.');
        }
        continue;
      }
      throw new Error(`${file} failed: ${e.message}`);
    }
  }
  await conn.end();
  if (!STATUS_ONLY) console.log(ran ? `Applied ${ran} migration(s).` : 'Database schema is up to date.');
  if (failedOptional) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`✗ Migration failed: ${e.message}`); process.exit(1); });
}
