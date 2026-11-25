import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { resolveDbConfig } from './dbConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findMigrationsDir() {
  const candidates = [
    path.resolve(__dirname, '../../../database/mysql'),
    path.resolve(__dirname, '../../database/mysql'),
    path.resolve(__dirname, '../database/mysql'),
    path.resolve(__dirname, '../../backend/database/mysql'),
    path.resolve(process.cwd(), 'database/mysql'),
    path.resolve(process.cwd(), '../database/mysql'),
    path.resolve(process.cwd(), 'backend/database/mysql'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /^\d{3}_.+\.sql$/.test(f))) {
      return dir;
    }
  }
  return candidates[0];
}

function findSeedScript() {
  const candidates = [
    path.resolve(__dirname, '../../scripts/seed.js'),
    path.resolve(__dirname, '../scripts/seed.js'),
    path.resolve(process.cwd(), 'scripts/seed.js'),
    path.resolve(process.cwd(), 'backend/scripts/seed.js'),
    path.resolve(process.cwd(), '../backend/scripts/seed.js'),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return f;
  }
  return candidates[0];
}

function splitStatements(sqlText) {
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

async function markerExists(conn, db, marker) {
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

/**
 * Applies any pending database/mysql/NNN_*.sql migrations idempotently on startup.
 * Never throws on unreachable MySQL (boot diagnostics handle that); logs applied migrations.
 */
export async function ensureMigrations() {
  const migrationsDir = findMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`[AutoMigrate] Migrations directory not found at ${migrationsDir}`);
    return;
  }
  const cfg = resolveDbConfig();
  const candidateHosts = [cfg.host];
  if (cfg.host !== 'localhost' && cfg.host !== '127.0.0.1') {
    candidateHosts.push('localhost', '127.0.0.1');
  }

  let conn;
  let lastErr = null;
  for (const host of candidateHosts) {
    try {
      conn = await mysql.createConnection({
        host, port: cfg.port, user: cfg.user, password: cfg.password,
        database: cfg.database, ssl: cfg.ssl, timezone: 'Z', multipleStatements: false,
        connectTimeout: 5000,
      });
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!conn) {
    console.warn(`⚠ Auto-migration skipped: unable to connect to MySQL (${lastErr?.message})`);
    return;
  }

  try {
    await conn.query("SET SESSION time_zone = '+00:00'");
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        duration_ms INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    const [appliedRows] = await conn.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map((r) => [r.version, r.checksum]));
    const files = fs.readdirSync(migrationsDir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

    let ran = 0;
    for (const file of files) {
      const text = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
      if (applied.has(file)) continue;

      const optional = /@optional/.test(text.split('\n').slice(0, 15).join('\n'));
      const started = Date.now();
      try {
        for (const st of splitStatements(text)) {
          let skip = false;
          for (const m of st.markers) {
            if (await markerExists(conn, cfg.database, m)) skip = true;
          }
          if (skip) continue;
          await conn.query(st.sql);
        }
        await conn.query(
          'INSERT INTO schema_migrations (version, checksum, duration_ms) VALUES (?, ?, ?)',
          [file, checksum, Date.now() - started]);
        ran++;
        console.log(`✓ Auto-applied migration ${file} (${Date.now() - started} ms)`);
      } catch (e) {
        if (optional) {
          console.warn(`⚠ Optional migration ${file} skipped: ${e.message}`);
          continue;
        }
        console.error(`✗ Auto-migration ${file} failed: ${e.message}`);
        break;
      }
    }
    if (ran > 0) console.log(`✓ Database schema updated (${ran} migration(s) applied)`);

    // Auto-seed only if users table is completely empty (e.g. fresh Hostinger DB)
    try {
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users');
      if (Number(n) === 0) {
        console.log('⏳ Empty database detected — running initial seed in background...');
        const seedScript = findSeedScript();
        const backendDir = path.dirname(path.dirname(seedScript));
        execFile(process.execPath, [seedScript], { cwd: backendDir }, (err, stdout, stderr) => {
          if (err) console.error('✗ Auto-seed failed:', stderr || err.message);
          else console.log('✓ Initial database seed completed.');
        });
      }
    } catch (e) {
      console.warn('⚠ Could not check users table for seeding:', e.message);
    }
  } catch (e) {
    console.warn(`⚠ Auto-migration error: ${e.message}`);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}
