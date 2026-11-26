import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const TARGET_CHARSET = 'utf8mb4';
const TARGET_COLLATION = 'utf8mb4_unicode_ci';

/** Parses every `CREATE TABLE IF NOT EXISTS` in the migration files → { table: [[col, definition], ...] }. */
function parseTableDefinitions(migrationsDir, files) {
  const tables = new Map();
  for (const file of files) {
    const text = fs.readFileSync(path.join(migrationsDir, file), 'utf8').replace(/\r\n/g, '\n');
    for (const m of text.matchAll(/CREATE TABLE IF NOT EXISTS `(\w+)` \(\n([\s\S]*?)\n\)\s*ENGINE=/g)) {
      const cols = [];
      for (const line of m[2].split('\n')) {
        const c = line.match(/^\s*`(\w+)`\s+(.+?),?\s*$/);
        if (c) cols.push([c[1], `\`${c[1]}\` ${c[2]}`]);
      }
      if (!tables.has(m[1])) tables.set(m[1], cols);
    }
  }
  return tables;
}

/**
 * Tables left behind by older deploys may use a different collation (the schema
 * once used utf8mb4_0900_ai_ci, which MariaDB 11.4+ maps to a uca1400 collation).
 * A FK between columns with different collations fails with errno 150, so every
 * POMS table is converted to the one collation the schema uses.
 */
async function normalizeCollations(conn, db, ownTables) {
  const [rows] = await conn.query(
    `SELECT DISTINCT t.TABLE_NAME AS name
       FROM information_schema.TABLES t
       LEFT JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
        AND c.COLLATION_NAME IS NOT NULL AND c.COLLATION_NAME <> ?
      WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE = 'BASE TABLE'
        AND (t.TABLE_COLLATION <> ? OR c.COLUMN_NAME IS NOT NULL)`,
    [TARGET_COLLATION, db, TARGET_COLLATION]);
  const todo = rows.map((r) => r.name).filter((n) => ownTables.has(n));
  if (!todo.length) return;
  await conn.query('SET SESSION FOREIGN_KEY_CHECKS = 0');
  try {
    for (const t of todo) {
      try {
        await conn.query(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET ${TARGET_CHARSET} COLLATE ${TARGET_COLLATION}`);
        console.log(`✓ Normalised collation of ${t} → ${TARGET_COLLATION}`);
      } catch (e) {
        console.warn(`⚠ Could not normalise collation of ${t}: ${e.message}`);
      }
    }
  } finally {
    await conn.query('SET SESSION FOREIGN_KEY_CHECKS = 1');
  }
}

/** Adds columns the schema defines but an older, already-existing table lacks. */
async function addMissingColumns(conn, db, tableDefs) {
  const [rows] = await conn.query(
    'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', [db]);
  const existing = new Map();
  for (const r of rows) {
    if (!existing.has(r.t)) existing.set(r.t, new Set());
    existing.get(r.t).add(r.c.toLowerCase());
  }
  for (const [table, cols] of tableDefs) {
    const have = existing.get(table);
    if (!have) continue; // table not created yet — the migration's CREATE TABLE builds it whole
    for (const [col, def] of cols) {
      if (have.has(col.toLowerCase())) continue;
      try {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${def}`);
        have.add(col.toLowerCase());
        console.log(`✓ Added missing column ${table}.${col}`);
      } catch (e) {
        console.warn(`⚠ Could not add column ${table}.${col}: ${e.message}`);
      }
    }
  }
}

const isForeignKeyStatement = (sql) => /ADD\s+CONSTRAINT\s+`?\w+`?\s+FOREIGN\s+KEY/i.test(sql);

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
  const isLinuxOrRemote = process.platform === 'linux' || !cfg.host || cfg.host.includes('.hstgr.io');
  const candidateHosts = isLinuxOrRemote
    ? ['localhost', '127.0.0.1', cfg.host].filter((h, i, a) => Boolean(h) && a.indexOf(h) === i)
    : [cfg.host, 'localhost', '127.0.0.1'].filter((h, i, a) => Boolean(h) && a.indexOf(h) === i);

  let conn;
  let lastErr = null;
  const baseUser = cfg.user || 'u101820758_PO_1';
  const baseDb = cfg.database || 'u101820758_PO_PROJECT_1';

  const candidateCreds = [
    { user: baseUser, db: baseDb },
    { user: baseDb, db: baseUser },
    { user: 'u101820758_PO_1', db: 'u101820758_PO_PROJECT_1' },
    { user: 'u101820758_PO_PROJECT_1', db: 'u101820758_PO_1' },
    { user: 'u101820758_po_1', db: 'u101820758_po_project_1' },
    { user: 'u101820758_po_project_1', db: 'u101820758_po_1' },
    { user: cfg.user.replace(/_1$/i, ''), db: cfg.database.replace(/_1$/i, '') },
    { user: `${cfg.user}_1`, db: `${cfg.database}_1` },
  ].filter((c, i, a) => a.findIndex((x) => x.user.toLowerCase() === c.user.toLowerCase() && x.db.toLowerCase() === c.db.toLowerCase()) === i);

  for (const host of candidateHosts) {
    for (const cred of candidateCreds) {
      try {
        conn = await mysql.createConnection({
          host, port: cfg.port, user: cred.user, password: cfg.password,
          database: cred.db, ssl: cfg.ssl, timezone: 'Z', multipleStatements: false,
          connectTimeout: 2500,
        });
        cfg.host = host;
        cfg.user = cred.user;
        cfg.database = cred.db;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (conn) break;
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const [appliedRows] = await conn.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map((r) => [r.version, r.checksum]));

    // Safety check: if core tables (like users) do not exist, 001_schema.sql must run!
    const [existingUsersTable] = await conn.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
      [cfg.database]
    );
    if (!existingUsersTable || existingUsersTable.length === 0) {
      applied.delete('001_schema.sql');
      await conn.query("DELETE FROM schema_migrations WHERE version = '001_schema.sql'").catch(() => {});
    }

    const files = fs.readdirSync(migrationsDir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

    // Repair drift left by earlier deploys before applying anything.
    const tableDefs = parseTableDefinitions(migrationsDir, files);
    const ownTables = new Set([...tableDefs.keys(), 'schema_migrations']);
    await normalizeCollations(conn, cfg.database, ownTables);
    await addMissingColumns(conn, cfg.database, tableDefs);

    let ran = 0;
    let failed = 0;
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
          try {
            await conn.query(st.sql);
          } catch (stErr) {
            if ([
              'ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME',
              'ER_DUP_ENTRY', 'ER_CANT_DROP_FIELD_OR_KEY',
            ].includes(stErr.code) || /already exists/i.test(stErr.message)) {
              console.warn(`  ↳ skipped existing constraint/table (${stErr.code || 'EXISTS'})`);
              continue;
            }
            // A foreign key is referential hardening only; one that cannot be built
            // (legacy column type, orphan rows) must not block the rest of the schema.
            if (isForeignKeyStatement(st.sql)) {
              const name = st.sql.match(/ADD\s+CONSTRAINT\s+`?(\w+)`?/i)?.[1];
              console.warn(`⚠ ${file}: foreign key ${name} skipped — ${stErr.message}`);
              continue;
            }
            throw stErr;
          }
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
        // Keep going: later migrations are marker-guarded and independent, and
        // stopping here is what left roles.status (007) missing in production.
        failed++;
        console.error(`✗ Auto-migration ${file} failed: ${e.message}`);
      }
    }
    if (ran > 0) console.log(`✓ Database schema updated (${ran} migration(s) applied)`);
    if (failed > 0) console.error(`✗ ${failed} migration(s) failed — they will be retried on next start`);

    // Auto-seed only if users table is completely empty (e.g. fresh Hostinger DB)
    try {
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users');
      if (Number(n) === 0) {
        console.log('⏳ Empty database detected — running initial seed...');
        const seedScript = findSeedScript();
        const backendDir = path.dirname(path.dirname(seedScript));
        let seedModule = null;
        try {
          seedModule = await import(pathToFileURL(seedScript).href);
        } catch (importErr) {
          console.warn(`⚠ Could not load seed module in-process (${importErr.message}) — running it as a child process`);
        }
        if (seedModule && typeof seedModule.seedDatabase === 'function') {
          // Run in-process only. The old code then re-ran the script as a child
          // process on any error, which collided with the half-seeded data and
          // hid the real error behind "Command failed".
          try {
            await seedModule.seedDatabase();
            console.log('✓ Initial database seed completed in-process.');
          } catch (seedErr) {
            console.error('✗ Auto-seed failed:', seedErr?.stack || seedErr);
          }
        } else {
          execFile(process.execPath, [seedScript], { cwd: backendDir }, (err, _stdout, stderr) => {
            if (err) console.error('✗ Auto-seed failed:', stderr || err.message);
            else console.log('✓ Initial database seed completed via child process.');
          });
        }
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
