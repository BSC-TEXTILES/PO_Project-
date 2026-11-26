// MySQL connection settings from the environment — shared by the app pool
// (config/db.js) and the maintenance scripts (scripts/db-*.mjs).
// Credentials come only from environment variables / backend/.env (never hard-coded).
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load environment in priority: .env.production (if in prod), .env, then repo root
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env.production'), quiet: true });
  dotenv.config({ path: path.resolve(__dirname, '../../../.env.production'), quiet: true });
}
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../.env.production'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.production'), quiet: true });

export function resolveDbConfig(env = process.env) {
  let cfg;
  if (env.DB_HOST || env.DB_NAME || env.DB_USER) {
    const rawUser = env.DB_USER || '';
    const rawDb = env.DB_NAME || '';
    const host = (process.platform === 'linux' && env.DB_HOST && env.DB_HOST.includes('.hstgr.io'))
      ? 'localhost'
      : (env.DB_HOST || 'localhost');
    cfg = {
      host,
      port: parseInt(env.DB_PORT || '3306', 10),
      user: rawUser,
      password: env.DB_PASSWORD ?? '',
      database: rawDb,
    };
  } else if (env.DATABASE_URL) {
    let u;
    try { u = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL is not a valid URL'); }
    if (u.protocol !== 'mysql:') {
      throw new Error(`DATABASE_URL must use mysql:// — "${u.protocol.replace(':', '')}" is not supported. POMS runs on MySQL only.`);
    }
    cfg = {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '3306', 10),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password || ''),
      database: u.pathname.replace(/^\//, ''),
    };
  } else {
    throw new Error('MySQL is not configured. Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME in backend/.env (see backend/.env.example).');
  }
  if (!cfg.user) throw new Error('DB_USER is required');
  if (!cfg.database) throw new Error('DB_NAME is required');
  if (!/^[A-Za-z0-9_$]+$/.test(cfg.database)) throw new Error('DB_NAME may contain only letters, digits, _ and $');
  cfg.connectionLimit = Math.max(1, parseInt(env.DB_CONNECTION_LIMIT || '10', 10));
  cfg.ssl = /^(1|true|required)$/i.test(env.DB_SSL || '')
    ? { rejectUnauthorized: !/^false$/i.test(env.DB_SSL_REJECT_UNAUTHORIZED || '') }
    : undefined;
  return cfg;
}

/** Safe description for logs (never includes the password). */
export const describeDb = (cfg) => `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`;
