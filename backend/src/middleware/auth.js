import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { ApiError, forbidden } from '../utils/httpError.js';

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseDurationMinutes(str, defaultMinutes = 15) {
  if (!str) return defaultMinutes;
  const s = String(str).trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(m|min|h|hr|d|day)?s?$/);
  if (!m) return defaultMinutes;
  const val = parseInt(m[1], 10);
  const unit = m[2] || 'm';
  if (unit === 'h' || unit === 'hr') return val * 60;
  if (unit === 'd' || unit === 'day') return val * 1440;
  return val;
}

// Access token lifetime: default 15 minutes (configurable via JWT_EXPIRES_IN e.g. 15M)
export const ACCESS_TOKEN_MINUTES = parseDurationMinutes(process.env.JWT_EXPIRES_IN, 15);

// Refresh token / session lifetime: default 60 minutes (configurable via JWT_REFRESH_EXPIRES_IN e.g. 1H)
export const REFRESH_TOKEN_MINUTES = parseDurationMinutes(
  process.env.JWT_REFRESH_EXPIRES_IN || (process.env.SESSION_MAX_AGE_HOURS ? `${process.env.SESSION_MAX_AGE_HOURS}h` : null),
  60
);

// An active access token must not be logged out and must have activity within ACCESS_TOKEN_MINUTES
const ACTIVE_SESSION_SQL = `SELECT user_id FROM user_sessions
   WHERE token_hash = $1 AND logout_at IS NULL
     AND last_seen_at > (UTC_TIMESTAMP(6) - INTERVAL ${ACCESS_TOKEN_MINUTES} MINUTE)
   LIMIT 1`;

export async function verifyToken(token) {
  const hashed = hashToken(token);
  const { rows } = await query(ACTIVE_SESSION_SQL, [hashed]);
  if (!rows || rows.length === 0) throw new Error('Session invalid or expired');
  return { userId: rows[0].user_id, sub: rows[0].user_id };
}

// One row per user; role / scope / permission lists as JSON arrays (deduped in parseRow).
const USER_COLUMNS = `
  SELECT u.id, u.email, u.username, u.employee_id, u.full_name, u.status, u.force_password_reset,
         u.profile_photo_url, u.designation, u.profile_updated_at,
         u.password_changed_at, u.failed_attempts, u.locked_until,
         (SELECT COALESCE(JSON_ARRAYAGG(r.code), JSON_ARRAY())
            FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.status = 'active') AS roles,
         (SELECT COALESCE(JSON_ARRAYAGG(ud.division_id), JSON_ARRAY())
            FROM user_divisions ud WHERE ud.user_id = u.id) AS division_ids,
         (SELECT COALESCE(JSON_ARRAYAGG(us.section_id), JSON_ARRAY())
            FROM user_sections us WHERE us.user_id = u.id) AS section_ids,
         (SELECT COALESCE(JSON_ARRAYAGG(p.code), JSON_ARRAY())
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id AND r.status = 'active'
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id
           WHERE ur.user_id = u.id) AS role_permissions,
         (SELECT COALESCE(JSON_ARRAYAGG(p.code), JSON_ARRAY())
            FROM user_permissions up
            JOIN permissions p ON p.id = up.permission_id
           WHERE up.user_id = u.id AND up.effect = 'allow') AS user_allows,
         (SELECT COALESCE(JSON_ARRAYAGG(p.code), JSON_ARRAY())
            FROM user_permissions up
            JOIN permissions p ON p.id = up.permission_id
           WHERE up.user_id = u.id AND up.effect = 'deny') AS user_denies
    FROM users u`;

const USER_SELECT = `${USER_COLUMNS} WHERE u.id = $1`;
// utf8mb4_0900_ai_ci makes this comparison case-insensitive (was lower() = lower()).
const USER_SELECT_BY_EMAIL = `${USER_COLUMNS} WHERE u.email = $1`;

// Resilient fallback query in case migration 007 (user_permissions / employee_id / roles.status) is pending
const FALLBACK_USER_COLUMNS = `
  SELECT u.id, u.email, u.username, u.full_name, u.status, u.force_password_reset,
         u.profile_photo_url, u.designation, u.profile_updated_at,
         u.password_changed_at, u.failed_attempts, u.locked_until,
         (SELECT COALESCE(JSON_ARRAYAGG(r.code), JSON_ARRAY())
            FROM user_roles ur JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = u.id) AS roles,
         (SELECT COALESCE(JSON_ARRAYAGG(ud.division_id), JSON_ARRAY())
            FROM user_divisions ud WHERE ud.user_id = u.id) AS division_ids,
         (SELECT COALESCE(JSON_ARRAYAGG(us.section_id), JSON_ARRAY())
            FROM user_sections us WHERE us.user_id = u.id) AS section_ids,
         (SELECT COALESCE(JSON_ARRAYAGG(p.code), JSON_ARRAY())
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id
           WHERE ur.user_id = u.id) AS role_permissions
    FROM users u`;
const FALLBACK_USER_SELECT = `${FALLBACK_USER_COLUMNS} WHERE u.id = $1`;
const FALLBACK_USER_SELECT_BY_EMAIL = `${FALLBACK_USER_COLUMNS} WHERE u.email = $1`;

function dedupe(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.filter(Boolean))];
}

function parseJsonArr(v) {
  if (!v) return [];
  return dedupe(typeof v === 'string' ? JSON.parse(v) : v);
}

function parseRow(u) {
  if (!u) return null;
  const roles = parseJsonArr(u.roles);
  const rolePerms = parseJsonArr(u.role_permissions);
  const allows = parseJsonArr(u.user_allows);
  const denies = new Set(parseJsonArr(u.user_denies));
  const permissions = dedupe([...rolePerms, ...allows]).filter((c) => !denies.has(c));
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    employeeId: u.employee_id || null,
    fullName: u.full_name,
    status: u.status,
    forcePasswordReset: u.force_password_reset,
    profilePhotoUrl: u.profile_photo_url,
    designation: u.designation,
    roles,
    divisionIds: parseJsonArr(u.division_ids),
    sectionIds: parseJsonArr(u.section_ids),
    permissions,
    profileUpdatedAt: u.profile_updated_at,
    passwordChangedAt: u.password_changed_at,
    failedAttempts: u.failed_attempts,
    lockedUntil: u.locked_until,
    isSuperAdmin: roles.includes('super_admin'),
  };
}

export async function loadUser(userId) {
  try {
    const { rows } = await query(USER_SELECT, [userId]);
    return parseRow(rows[0]);
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
      try {
        const { rows } = await query(FALLBACK_USER_SELECT, [userId]);
        return parseRow(rows[0]);
      } catch (fallbackErr) {
        if (fallbackErr.code === 'ER_NO_SUCH_TABLE') return null;
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export async function loadUserByEmail(email) {
  try {
    const { rows } = await query(USER_SELECT_BY_EMAIL, [email]);
    return parseRow(rows[0]);
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
      try {
        const { rows } = await query(FALLBACK_USER_SELECT_BY_EMAIL, [email]);
        return parseRow(rows[0]);
      } catch (fallbackErr) {
        if (fallbackErr.code === 'ER_NO_SUCH_TABLE') return null;
        throw fallbackErr;
      }
    }
    throw err;
  }
}

/**
 * Authenticate middleware — verifies hashed token from DB and loads RBAC.
 */
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required');

    const hashed = hashToken(token);

    // Look up active session
    const { rows } = await query(ACTIVE_SESSION_SQL, [hashed]);

    if (rows.length === 0) {
      throw new ApiError(401, 'Session invalid or expired — please sign in again');
    }

    const userId = rows[0].user_id;
    let user = await loadUser(userId);

    if (!user || user.status !== 'active') throw new ApiError(401, 'Account inactive or missing');

    // Update last_seen_at for session
    await query(`UPDATE user_sessions SET last_seen_at = UTC_TIMESTAMP(6) WHERE token_hash = $1`, [hashed]).catch(() => {});

    req.user = user;
    req.sessionId = hashed; // Attach session hash for logout
    req.requestId = req.headers['x-request-id'] || null;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Middleware: require a specific permission (or super_admin).
 */
export function requirePermission(code) {
  return (req, res, next) => {
    if (req.user.isSuperAdmin || req.user.permissions.includes(code)) return next();
    next(forbidden(`Missing permission: ${code}`));
  };
}

/**
 * Middleware: require ANY of the listed permissions (or super_admin).
 */
export function requireAnyPermission(codes) {
  return (req, res, next) => {
    if (req.user.isSuperAdmin) return next();
    if (codes.some(c => req.user.permissions.includes(c))) return next();
    next(forbidden(`Missing any of permissions: ${codes.join(', ')}`));
  };
}

// RB-001: user may act only within divisions granted by authorization policy.
export function scopeDivision(req, divisionId) {
  if (req.user.isSuperAdmin) return;
  if (!req.user.divisionIds.includes(String(divisionId))) {
    throw forbidden('Division out of authorized scope (RB-001)');
  }
}

// Collection (section) scope: a user assigned specific collections may only
// operate on those. Super admin and users without a collection restriction
// (empty scope) pass through.
export function scopeSection(req, sectionId) {
  if (req.user.isSuperAdmin) return;
  const ids = req.user.sectionIds || [];
  if (ids.length && !ids.includes(String(sectionId))) {
    throw forbidden('Collection out of authorized scope — you are not assigned to this collection');
  }
}
