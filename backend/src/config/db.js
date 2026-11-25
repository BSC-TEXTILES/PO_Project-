// ============================================================================
// POMS — centralized MySQL data access (the ONLY database layer in the app)
//
//   import { query, withTransaction, newId, nextNumber } from '../config/db.js';
//
//   const { rows, rowCount, insertId } = await query(
//     'SELECT * FROM products WHERE brand_id = $1 AND status = $2', [brandId, 'active']);
//
//   await withTransaction(async (tx) => {
//     await tx.query('UPDATE ... WHERE id = ?', [id]);
//   });
//
// * Placeholders: positional `?` or numbered `$1..$n` (a numbered placeholder may be
//   reused; values are always sent through mysql2's escaping — never concatenated).
// * Array values expand to a list for `IN ($1)`; an empty array becomes NULL so
//   `IN ()` never produces a syntax error and simply matches nothing.
// * Plain-object values are JSON-encoded (for JSON columns).
// * Timestamps are stored as UTC DATETIME(6); every session runs with time_zone '+00:00'
//   and the driver reads/writes Date objects in UTC. DATE columns are returned as
//   'YYYY-MM-DD' strings so calendar dates never shift across time zones.
// * TINYINT(1) columns are returned as booleans; DECIMAL as numbers; JSON parsed.
//
// Configuration (environment only — never hard-coded):
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_CONNECTION_LIMIT
//   or DATABASE_URL=mysql://user:pass@host:3306/dbname
// There is deliberately NO fallback to any other database engine.
// ============================================================================
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { resolveDbConfig } from './dbConfig.js';

export { resolveDbConfig };

const SESSION_SQL_MODE = 'STRICT_TRANS_TABLES,ONLY_FULL_GROUP_BY,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

function typeCast(field, next) {
  if (field.type === 'TINY' && field.length === 1) {
    const v = field.string();
    return v === null ? null : v === '1';
  }
  return next();
}

const cfg = resolveDbConfig();
export const dbName = cfg.database;

function createPool(host = cfg.host, user = cfg.user, database = cfg.database) {
  const p = mysql.createPool({
    host,
    port: cfg.port,
    user,
    password: cfg.password,
    database,
    ssl: cfg.ssl,
    charset: 'utf8mb4_0900_ai_ci',
    timezone: 'Z',
    dateStrings: ['DATE'],
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    typeCast,
    waitForConnections: true,
    connectionLimit: cfg.connectionLimit,
    maxIdle: cfg.connectionLimit,
    idleTimeout: 60_000,
    queueLimit: 0,
    connectTimeout: 5_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    multipleStatements: false,
  });
  // Every physical connection: UTC session clock + strict SQL mode.
  p.on('connection', (conn) => {
    conn.query(`SET SESSION time_zone = '+00:00', SESSION sql_mode = '${SESSION_SQL_MODE}'`);
  });
  return p;
}

let rawPool = createPool(cfg.host);

const CONNECTION_ERRORS = new Set([
  'ER_ACCESS_DENIED_ERROR', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND',
  'EAI_AGAIN', 'PROTOCOL_CONNECTION_LOST', 'ER_BAD_DB_ERROR',
]);

let fallbackPromise = null;
async function tryFallback() {
  if (fallbackPromise) return fallbackPromise;
  fallbackPromise = (async () => {
    // When deployed on Hostinger, MySQL is local: prioritize localhost and 127.0.0.1 over remote domain
    const candidateHosts = [cfg.host, 'localhost', '127.0.0.1'].filter((h, i, a) => Boolean(h) && a.indexOf(h) === i);
    const candidateCreds = [
      { user: cfg.user, db: cfg.database },
      { user: cfg.user.replace(/_1$/i, ''), db: cfg.database.replace(/_1$/i, '') },
      { user: `${cfg.user}_1`, db: `${cfg.database}_1` },
    ].filter((c, i, a) => a.findIndex((x) => x.user.toLowerCase() === c.user.toLowerCase() && x.db.toLowerCase() === c.db.toLowerCase()) === i);

    for (const host of candidateHosts) {
      for (const cred of candidateCreds) {
        if (host === cfg.host && cred.user === cfg.user && cred.db === cfg.database) continue;
        try {
          const testPool = createPool(host, cred.user, cred.db);
          const [r] = await testPool.query('SELECT VERSION() AS version, DATABASE() AS db');
          await rawPool.end().catch(() => {});
          rawPool = testPool;
          cfg.host = host;
          cfg.user = cred.user;
          cfg.database = cred.db;
          process.env.DB_HOST = host;
          process.env.DB_USER = cred.user;
          process.env.DB_NAME = cred.db;
          console.log(`✓ Resilient MySQL switch: connected to ${cred.user}@${host}/${cred.db} (${r[0]?.version || 'ok'})`);
          return true;
        } catch (_) {}
      }
    }
    return false;
  })();
  const result = await fallbackPromise;
  fallbackPromise = null;
  return result;
}

// ---------------------------------------------------------------- params ---
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function normalizeValue(v) {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.length ? v.map(normalizeValue) : [null];
  if (v instanceof Date || Buffer.isBuffer(v) || v === null) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  // ISO-8601 with offset (e.g. from the browser) -> Date, stored as UTC.
  if (typeof v === 'string' && v.length <= 35 && ISO_TS.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return v;
}

/**
 * Converts `$n` placeholders to `?` (outside string literals, identifiers and
 * comments) and orders the values to match. `?` placeholders pass through.
 */
export function bindParams(sql, params = []) {
  if (!/\$\d/.test(sql)) return { sql, values: (params || []).map(normalizeValue) };
  let out = '';
  const values = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\\' && ch !== '`') { j += 2; continue; }
        if (sql[j] === ch) { if (sql[j + 1] === ch) { j += 2; continue; } break; }
        j++;
      }
      out += sql.slice(i, j + 1); i = j + 1; continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const j = sql.indexOf('\n', i); const end = j === -1 ? sql.length : j;
      out += sql.slice(i, end); i = end; continue;
    }
    if (ch === '$' && /\d/.test(sql[i + 1] || '')) {
      let j = i + 1; while (/\d/.test(sql[j] || '')) j++;
      const idx = parseInt(sql.slice(i + 1, j), 10) - 1;
      if (idx < 0 || idx >= params.length) throw new Error(`SQL placeholder $${idx + 1} has no bound value`);
      // LIMIT/OFFSET need integers: a quoted '10' is a syntax error in MySQL.
      if (/\b(LIMIT|OFFSET)\s*$/i.test(out) || /\bLIMIT\s+\?\s*,\s*$/i.test(out)) {
        const raw = params[idx];
        const n = typeof raw === 'number' ? raw : (/^\s*\d+\s*$/.test(String(raw)) ? Number(raw) : NaN);
        if (!Number.isInteger(n) || n < 0) throw new Error('LIMIT/OFFSET must be a non-negative integer');
        values.push(n);
      } else {
        values.push(normalizeValue(params[idx]));
      }
      out += '?'; i = j; continue;
    }
    out += ch; i++;
  }
  return { sql: out, values };
}

// --------------------------------------------------------------- execute ---
const TRANSIENT = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ER_CON_COUNT_ERROR']);

async function run(executor, sql, params) {
  const { sql: text, values } = bindParams(sql, params);
  const [result] = await executor.query(text, values);
  if (Array.isArray(result)) return { rows: result, rowCount: result.length };
  return {
    rows: [],
    rowCount: result?.affectedRows ?? 0,
    insertId: result?.insertId,
    changedRows: result?.changedRows,
  };
}

/** Pool-level query. Retries once on a dropped/refused connection for reads only. */
export async function query(sql, params = []) {
  try {
    return await run(rawPool, sql, params);
  } catch (e) {
    if (CONNECTION_ERRORS.has(e.code)) {
      const recovered = await tryFallback();
      if (recovered) {
        return await run(rawPool, sql, params);
      }
    }
    if (TRANSIENT.has(e.code) && /^\s*(SELECT|SHOW|WITH)\b/i.test(sql)) {
      await new Promise((r) => setTimeout(r, 250));
      return run(rawPool, sql, params);
    }
    throw e;
  }
}

function wrapConnection(conn) {
  return {
    query: (sql, params) => run(conn, sql, params),
    release: () => conn.release(),
    raw: conn,
  };
}

/** Runs fn(tx) inside START TRANSACTION / COMMIT; rolls back on any error. */
export async function withTransaction(fn) {
  let conn;
  try {
    conn = await rawPool.getConnection();
  } catch (e) {
    if (CONNECTION_ERRORS.has(e.code)) {
      const recovered = await tryFallback();
      if (recovered) {
        conn = await rawPool.getConnection();
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }
  const tx = wrapConnection(conn);
  try {
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch { /* connection already gone */ }
    throw e;
  } finally {
    conn.release();
  }
}

export const pool = {
  query,
  async connect() { return wrapConnection(await rawPool.getConnection()); },
  end: () => rawPool.end(),
  get raw() { return rawPool; },
};

// --------------------------------------------------------------- helpers ---
export const newId = () => crypto.randomUUID();

const IDENT = /^[a-z_][a-z0-9_]*$/;
/** SELECT the row with this id (table/column names are compile-time constants, validated). */
export async function fetchById(db, table, id, columns = '*') {
  if (!IDENT.test(table)) throw new Error(`invalid table name ${table}`);
  const { rows } = await db.query(`SELECT ${columns} FROM \`${table}\` WHERE id = ?`, [id]);
  return rows[0] || null;
}

/**
 * Atomic document number generator (replaces the legacy next_number() SQL function):
 * returns e.g. "PO-BEL-2026-00042". Must be called inside withTransaction for the
 * number to be released on rollback; it is safe under concurrency either way
 * (row lock taken by INSERT ... ON DUPLICATE KEY UPDATE).
 */
export async function nextNumber(db, entity, divisionId, year) {
  const prefix = `${entity}-${year}-`;
  await db.query(
    `INSERT INTO number_sequences (id, entity_type, division_id, seq_year, prefix, current_value)
     VALUES (?, ?, ?, ?, ?, LAST_INSERT_ID(1))
     ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value + 1)`,
    [newId(), entity, divisionId ?? null, year, prefix]);
  const { rows: [{ v }] } = await db.query('SELECT LAST_INSERT_ID() AS v');
  const { rows: [seq] } = await db.query(
    'SELECT prefix FROM number_sequences WHERE entity_type = ? AND division_id <=> ? AND seq_year = ?',
    [entity, divisionId ?? null, year]);
  return `${seq?.prefix ?? prefix}${String(v).padStart(5, '0')}`;
}

/**
 * Business time zone for "today"-style boundaries (data itself is stored in UTC).
 * APP_UTC_OFFSET like +05:30 (default: India Standard Time, where all POMS locations are).
 */
const OFFSET_RE = /^[+-](0\d|1[0-4]):[0-5]\d$/;
export const APP_UTC_OFFSET = OFFSET_RE.test(process.env.APP_UTC_OFFSET || '') ? process.env.APP_UTC_OFFSET : '+05:30';
/** SQL expression: the UTC instant at which the current business day began. */
export const SQL_TODAY_START_UTC =
  `CONVERT_TZ(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${APP_UTC_OFFSET}')), '${APP_UTC_OFFSET}', '+00:00')`;

/** SQL expression: today's calendar date in the business time zone (for DATE columns). */
export const SQL_BUSINESS_DATE = `DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${APP_UTC_OFFSET}'))`;

/** 'YYYY-MM-DD' calendar date in the business time zone (optionally for a given instant). */
export function businessDate(at = new Date()) {
  const [, sign, hh, mm] = APP_UTC_OFFSET.match(/([+-])(\d{2}):(\d{2})/);
  const offsetMs = (sign === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm)) * 60_000;
  return new Date(at.getTime() + offsetMs).toISOString().slice(0, 10);
}

/** Health probe used by /api/health and server boot. */
export async function ping() {
  const started = Date.now();
  try {
    const { rows: [r] } = await query('SELECT VERSION() AS version, DATABASE() AS db');
    return { ms: Date.now() - started, version: r.version, database: r.db };
  } catch (e) {
    if (CONNECTION_ERRORS.has(e.code)) {
      const recovered = await tryFallback();
      if (recovered) {
        const { rows: [r] } = await run(rawPool, 'SELECT VERSION() AS version, DATABASE() AS db', []);
        return { ms: Date.now() - started, version: r.version, database: r.db };
      }
    }
    throw e;
  }
}

export const engine = 'mysql';
