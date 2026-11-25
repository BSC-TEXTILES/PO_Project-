#!/usr/bin/env node
// Launcher step (run.bat): verify MySQL, apply pending schema migrations, and seed
// demo/master data ONLY into a brand-new, empty database. Never touches existing data.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { resolveDbConfig, describeDb } from '../src/config/dbConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

function run(script, args = []) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: backendDir, stdio: 'inherit' });
  return r.status ?? 1;
}

try {
  const cfg = resolveDbConfig();
  console.log(`[....] MySQL target: ${describeDb(cfg)}`);

  // 1. schema (creates the database first if the account is allowed to)
  if (run('scripts/db-migrate.mjs', ['--create-db']) === 1) throw new Error('schema migration failed');

  // 2. seed only an empty database
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, ssl: cfg.ssl,
  });
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users');
  await conn.end();
  if (Number(n) === 0) {
    console.log('[....] Empty database — seeding master data and demo users...');
    if (run('scripts/seed.js') !== 0) throw new Error('seed failed');
    console.log('[OK]   Database seeded.');
  } else {
    console.log(`[OK]   Existing data found (${n} users) — no seeding performed.`);
  }
  console.log('[OK]   Database is ready.');
} catch (e) {
  const reason = e.code === 'ECONNREFUSED' ? 'connection refused — MySQL is not running' : e.message;
  console.error(`[ERROR] MySQL setup failed: ${reason}`);
  process.exit(1);
}
