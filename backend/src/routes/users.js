import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction, pool, newId } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { validate, createUserSchema, resetPasswordSchema } from '../middleware/validate.js';
import { badRequest, forbidden, notFoundError, ah } from '../utils/httpError.js';
import { logAudit } from '../utils/audit.js';

const r = Router();
r.use(authenticate);

function parseJsonArr(v) {
  if (!v) return [];
  const arr = typeof v === 'string' ? JSON.parse(v) : v;
  return Array.isArray(arr) ? [...new Set(arr.filter(Boolean))] : [];
}

function resolveEffectivePerms(row) {
  const rolePerms = parseJsonArr(row.role_permissions);
  const allows = parseJsonArr(row.user_allows);
  const denies = new Set(parseJsonArr(row.user_denies));
  return [...new Set([...rolePerms, ...allows])].filter((c) => !denies.has(c));
}

async function ensureNotLastSuperAdmin(client, targetUserId, nextRoles, nextStatus) {
  const { rows: [cur] } = await client.query(
    `SELECT u.status,
            EXISTS(SELECT 1 FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ur.user_id = u.id AND ro.code = 'super_admin') AS was_super
       FROM users u WHERE u.id = $1`, [targetUserId]);
  if (!cur || !cur.was_super) return;

  const willStaySuper = nextRoles === undefined ? true : nextRoles.includes('super_admin');
  const willStayActive = nextStatus === undefined ? cur.status === 'active' : nextStatus === 'active';
  if (willStaySuper && willStayActive) return;

  const { rows: [{ cnt }] } = await client.query(
    `SELECT count(DISTINCT u.id) AS cnt
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles ro ON ro.id = ur.role_id
      WHERE ro.code = 'super_admin' AND u.status = 'active' AND u.id <> $1`,
    [targetUserId]);
  if (Number(cnt) === 0) {
    throw badRequest('Cannot deactivate or remove Super Admin role from the last active Super Admin account');
  }
}

// ---------- SELF-SERVICE (any signed-in user) ----------
r.get('/me', ah(async (req, res) => {
  res.json({ data: req.user });
}));

r.patch('/me', ah(async (req, res) => {
  const { fullName, phone, designation, email } = req.body || {};
  if (!fullName || String(fullName).trim().length < 3) throw badRequest('Full name (min 3 characters) is required to complete your profile');
  await query(
    `UPDATE users SET full_name=$2, phone=COALESCE($3,phone),
            designation=COALESCE($4,designation), email=COALESCE($5,email), profile_updated_at=now(), updated_at=now()
     WHERE id=$1`,
    [req.user.id, String(fullName).trim(), phone || null, designation || null, email || null]);
  const { rows } = await query(`SELECT full_name, phone, designation, email, profile_updated_at FROM users WHERE id = $1`, [req.user.id]);
  await logAudit(pool, {
    userId: req.user.id, role: req.user.roles?.join(',') || '', actionType: 'profile_update', entityType: 'user', entityId: req.user.id,
  }).catch(() => {});
  res.json({ data: rows[0] });
}));

// ---------- ADMINISTRATION (users.manage) ----------
r.use(requirePermission('users.manage'));

// GET /api/users — list all users with roles, locations, modules & effective permissions
r.get('/', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.username, u.employee_id, u.full_name, u.phone, u.status, u.mfa_enabled,
            u.profile_photo_url, u.designation, u.profile_updated_at,
            u.force_password_reset, u.last_login_at, u.locked_until, u.created_at,
            COALESCE((SELECT JSON_ARRAYAGG(ro.code) FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ur.user_id = u.id), JSON_ARRAY()) AS roles,
            COALESCE((SELECT JSON_ARRAYAGG(ud.division_id) FROM user_divisions ud WHERE ud.user_id = u.id), JSON_ARRAY()) AS division_ids,
            COALESCE((SELECT JSON_ARRAYAGG(us.section_id) FROM user_sections us WHERE us.user_id = u.id), JSON_ARRAY()) AS section_ids,
            COALESCE((SELECT JSON_ARRAYAGG(p.code)
                        FROM user_roles ur
                        JOIN roles ro ON ro.id = ur.role_id AND ro.status = 'active'
                        JOIN role_permissions rp ON rp.role_id = ur.role_id
                        JOIN permissions p ON p.id = rp.permission_id
                       WHERE ur.user_id = u.id), JSON_ARRAY()) AS role_permissions,
            COALESCE((SELECT JSON_ARRAYAGG(p.code)
                        FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
                       WHERE up.user_id = u.id AND up.effect = 'allow'), JSON_ARRAY()) AS user_allows,
            COALESCE((SELECT JSON_ARRAYAGG(p.code)
                        FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
                       WHERE up.user_id = u.id AND up.effect = 'deny'), JSON_ARRAY()) AS user_denies
       FROM users u
      ORDER BY u.created_at DESC`
  );
  const data = rows.map((u) => {
    const effective = resolveEffectivePerms(u);
    return {
      ...u,
      roles: parseJsonArr(u.roles),
      division_ids: parseJsonArr(u.division_ids),
      section_ids: parseJsonArr(u.section_ids),
      role_permissions: parseJsonArr(u.role_permissions),
      user_allows: parseJsonArr(u.user_allows),
      user_denies: parseJsonArr(u.user_denies),
      effective_permissions: effective,
      permission_count: effective.length,
    };
  });
  res.json({ data, total: data.length });
}));

// Reference data for the user-management screens (must be before /:id)
r.get('/_meta/roles', ah(async (req, res) => {
  const { rows } = await query(`SELECT id, code, name, description, status FROM roles ORDER BY code`);
  res.json({ data: rows });
}));

// GET /api/users/:id/access — full effective & overridden permissions + scope for Edit Access view
r.get('/:id/access', ah(async (req, res) => {
  const { id } = req.params;
  const { rows: [u] } = await query(
    `SELECT u.id, u.email, u.username, u.employee_id, u.full_name, u.phone, u.status, u.designation, u.last_login_at
       FROM users u WHERE u.id = $1`, [id]);
  if (!u) throw notFoundError('User');

  const roles = (await query(
    `SELECT ro.id, ro.code, ro.name, ro.status FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ur.user_id = $1`, [id])).rows;
  const divisionIds = (await query(`SELECT division_id FROM user_divisions WHERE user_id = $1`, [id])).rows.map((x) => x.division_id);
  const sectionIds = (await query(`SELECT section_id FROM user_sections WHERE user_id = $1`, [id])).rows.map((x) => x.section_id);
  const rolePermissions = (await query(
    `SELECT DISTINCT p.code FROM user_roles ur
       JOIN roles ro ON ro.id = ur.role_id AND ro.status = 'active'
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1`, [id])).rows.map((x) => x.code);
  const overrides = (await query(
    `SELECT p.id AS permission_id, p.code, up.effect
       FROM user_permissions up JOIN permissions p ON p.id = up.permission_id
      WHERE up.user_id = $1`, [id])).rows;

  const allowSet = new Set(overrides.filter((o) => o.effect === 'allow').map((o) => o.code));
  const denySet = new Set(overrides.filter((o) => o.effect === 'deny').map((o) => o.code));
  const effectivePermissions = [...new Set([...rolePermissions, ...allowSet])].filter((c) => !denySet.has(c));

  res.json({
    data: {
      user: u,
      roles: roles.map((x) => x.code),
      divisionIds,
      sectionIds,
      rolePermissions,
      overrides,
      effectivePermissions,
    },
  });
}));

// POST /api/users — create user + roles, divisions, sections, and custom permission overrides
r.post('/', rateLimit(20, 60 * 1000), validate({ body: createUserSchema }), ah(async (req, res) => {
  const {
    email, username, employeeId, fullName, phone, designation, password, status = 'active',
    roles = [], divisionIds = [], sections = [], sectionIds = [], permissionOverrides = [],
  } = req.body || {};

  if (!req.user.isSuperAdmin && (roles.length || divisionIds.length || sections.length || sectionIds.length || permissionOverrides.length)) {
    throw forbidden('Only the Administrator can assign roles, locations, and access scope — the account was not created');
  }

  const trimmedEmpId = employeeId ? String(employeeId).trim() : null;
  if (trimmedEmpId) {
    const dupEmp = await query(`SELECT id FROM users WHERE employee_id = $1 LIMIT 1`, [trimmedEmpId]);
    if (dupEmp.rows.length) {
      return res.status(409).json({ error: { message: `Employee ID "${trimmedEmpId}" is already assigned to another user`, code: 'DUPLICATE_EMPLOYEE_ID' } });
    }
  }

  const user = await withTransaction(async (client) => {
    const hash = await bcrypt.hash(password, 10);
    const newUserId = newId();
    await client.query(
      `INSERT INTO users (id, email, username, employee_id, password_hash, full_name, phone, designation, status)
       VALUES ($9, $1,$2,$3,$4,$5,$6,$7,$8)`,
      [email, username, trimmedEmpId, hash, fullName, phone || null, designation || null, status === 'inactive' ? 'inactive' : 'active', newUserId]);
    const { rows } = await client.query(`SELECT id, email, username, employee_id, full_name, phone, status, created_at FROM users WHERE id = $1`, [newUserId]);
    const u = rows[0];
    for (const code of roles) {
      await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code=$2 ON DUPLICATE KEY UPDATE user_id = user_id`, [u.id, code]);
    }
    for (const d of divisionIds) {
      await client.query(`INSERT INTO user_divisions (user_id, division_id) VALUES ($1,$2) ON DUPLICATE KEY UPDATE user_id = user_id`, [u.id, d]);
    }
    for (const s of [...sections, ...sectionIds]) {
      await client.query(`INSERT INTO user_sections (user_id, section_id) VALUES ($1,$2) ON DUPLICATE KEY UPDATE user_id = user_id`, [u.id, s]);
    }
    if (Array.isArray(permissionOverrides)) {
      for (const ov of permissionOverrides) {
        if (!ov?.permissionId || !['allow', 'deny'].includes(ov.effect)) continue;
        await client.query(
          `INSERT INTO user_permissions (user_id, permission_id, effect, updated_by)
           VALUES ($1, $2, $3, $4)
           ON DUPLICATE KEY UPDATE effect = VALUES(effect), updated_by = VALUES(updated_by)`,
          [u.id, ov.permissionId, ov.effect, req.user.id]);
      }
    }
    await logAudit(client, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'create',
      entityType: 'user', entityId: u.id,
      afterValue: { email, username, employeeId: trimmedEmpId, roles, divisionIds, sectionIds: [...sections, ...sectionIds], overrideCount: permissionOverrides.length },
    });
    return u;
  });
  res.status(201).json({ data: user });
}));

// PATCH /api/users/:id — update user details, status, role/location/section assignment
r.patch('/:id', ah(async (req, res) => {
  if (!req.user.isSuperAdmin) throw forbidden('Only the Administrator can edit users');
  const { id } = req.params;
  const { fullName, employeeId, phone, designation, status, forcePasswordReset, roles, divisionIds, sectionIds } = req.body || {};
  const before = (await query(`SELECT full_name, employee_id, phone, designation, status, force_password_reset FROM users WHERE id=$1`, [id])).rows[0];
  if (!before) throw notFoundError('User');

  const trimmedEmpId = employeeId === undefined ? undefined : (employeeId ? String(employeeId).trim() : null);
  if (trimmedEmpId) {
    const dupEmp = await query(`SELECT id FROM users WHERE employee_id = $1 AND id <> $2 LIMIT 1`, [trimmedEmpId, id]);
    if (dupEmp.rows.length) {
      return res.status(409).json({ error: { message: `Employee ID "${trimmedEmpId}" is already assigned to another user`, code: 'DUPLICATE_EMPLOYEE_ID' } });
    }
  }

  await withTransaction(async (client) => {
    await ensureNotLastSuperAdmin(client, id, roles, status);
    await client.query(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         employee_id = ${trimmedEmpId === undefined ? 'employee_id' : '$3'},
         phone = COALESCE($4, phone),
         designation = COALESCE($5, designation),
         status = COALESCE($6, status),
         force_password_reset = COALESCE($7, force_password_reset)
       WHERE id = $1`,
      [id, fullName || null, trimmedEmpId ?? null, phone ?? null, designation ?? null, status || null, forcePasswordReset === undefined ? null : forcePasswordReset]);
    const { rows } = await client.query(`SELECT id, email, username, employee_id, full_name, phone, designation, status, force_password_reset, updated_at FROM users WHERE id = $1`, [id]);
    if (roles) {
      await client.query(`DELETE FROM user_roles WHERE user_id=$1`, [id]);
      for (const code of roles) {
        await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code=$2`, [id, code]);
      }
    }
    if (divisionIds) {
      await client.query(`DELETE FROM user_divisions WHERE user_id=$1`, [id]);
      for (const d of divisionIds) {
        await client.query(`INSERT INTO user_divisions (user_id, division_id) VALUES ($1,$2) ON DUPLICATE KEY UPDATE user_id = user_id`, [id, d]);
      }
    }
    if (sectionIds) {
      await client.query(`DELETE FROM user_sections WHERE user_id=$1`, [id]);
      for (const s of sectionIds) {
        await client.query(`INSERT INTO user_sections (user_id, section_id) VALUES ($1,$2) ON DUPLICATE KEY UPDATE user_id = user_id`, [id, s]);
      }
    }
    await logAudit(client, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'edit', entityType: 'user', entityId: id,
      beforeValue: before, afterValue: { ...rows[0], roles, divisionIds, sectionIds },
    });
  });
  res.json({ ok: true });
}));

// PUT /api/users/:id/access — dedicated Edit Access save (roles, locations, sections, per-user permission overrides)
r.put('/:id/access', ah(async (req, res) => {
  if (!req.user.isSuperAdmin) throw forbidden('Only the Administrator can configure user access');
  const { id } = req.params;
  const { roles, divisionIds, sectionIds, permissionOverrides } = req.body || {};

  const target = (await query(`SELECT id, username, full_name, status FROM users WHERE id=$1`, [id])).rows[0];
  if (!target) throw notFoundError('User');

  const beforeAccess = {
    roles: (await query(`SELECT ro.code FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ur.user_id=$1`, [id])).rows.map((x) => x.code),
    divisionIds: (await query(`SELECT division_id FROM user_divisions WHERE user_id=$1`, [id])).rows.map((x) => x.division_id),
    sectionIds: (await query(`SELECT section_id FROM user_sections WHERE user_id=$1`, [id])).rows.map((x) => x.section_id),
    overrides: (await query(`SELECT p.code, up.effect FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id=$1`, [id])).rows,
  };

  await withTransaction(async (client) => {
    if (Array.isArray(roles)) {
      await ensureNotLastSuperAdmin(client, id, roles, undefined);
      await client.query(`DELETE FROM user_roles WHERE user_id=$1`, [id]);
      for (const code of roles) {
        await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code=$2`, [id, code]);
      }
    }
    if (Array.isArray(divisionIds)) {
      await client.query(`DELETE FROM user_divisions WHERE user_id=$1`, [id]);
      for (const d of divisionIds) {
        await client.query(`INSERT INTO user_divisions (user_id, division_id) VALUES ($1,$2) ON DUPLICATE KEY UPDATE user_id = user_id`, [id, d]);
      }
    }
    if (Array.isArray(sectionIds)) {
      await client.query(`DELETE FROM user_sections WHERE user_id=$1`, [id]);
      for (const s of sectionIds) {
        await client.query(`INSERT INTO user_sections (user_id, section_id) VALUES ($1,$2) ON DUPLICATE KEY UPDATE user_id = user_id`, [id, s]);
      }
    }
    if (Array.isArray(permissionOverrides)) {
      await client.query(`DELETE FROM user_permissions WHERE user_id=$1`, [id]);
      for (const ov of permissionOverrides) {
        if (!ov?.permissionId || !['allow', 'deny'].includes(ov.effect)) continue;
        await client.query(
          `INSERT INTO user_permissions (user_id, permission_id, effect, updated_by)
           VALUES ($1, $2, $3, $4)`,
          [id, ov.permissionId, ov.effect, req.user.id]);
      }
    }
    const afterOverrides = (await client.query(
      `SELECT p.code, up.effect FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id=$1`, [id])).rows;
    await logAudit(client, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'user_access_update',
      entityType: 'user', entityId: id,
      beforeValue: beforeAccess,
      afterValue: {
        roles: roles ?? beforeAccess.roles,
        divisionIds: divisionIds ?? beforeAccess.divisionIds,
        sectionIds: sectionIds ?? beforeAccess.sectionIds,
        overrides: afterOverrides,
      },
    });
  });

  res.json({ ok: true });
}));

// POST /api/users/:id/access/reset — clear all per-user permission overrides (reset to role defaults)
r.post('/:id/access/reset', ah(async (req, res) => {
  if (!req.user.isSuperAdmin) throw forbidden('Only the Administrator can reset user permissions');
  const { id } = req.params;
  await withTransaction(async (client) => {
    const before = (await client.query(
      `SELECT p.code, up.effect FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id=$1`, [id])).rows;
    await client.query(`DELETE FROM user_permissions WHERE user_id=$1`, [id]);
    await logAudit(client, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'user_access_reset',
      entityType: 'user', entityId: id, beforeValue: { overrides: before }, afterValue: { overrides: [] },
    });
  });
  res.json({ ok: true });
}));

// POST /api/users/:id/reset-password — admin reset
r.post('/:id/reset-password', rateLimit(5, 60 * 1000), validate({ body: resetPasswordSchema }), ah(async (req, res) => {
  if (!req.user.isSuperAdmin) throw forbidden('Only the Administrator can reset passwords');
  const { newPassword } = req.body || {};
  const hash = await bcrypt.hash(newPassword, 10);
  await withTransaction(async (client) => {
    await client.query(`UPDATE users SET password_hash=$1, force_password_reset=true WHERE id=$2`, [hash, req.params.id]);
    await logAudit(client, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'password_reset', entityType: 'user', entityId: req.params.id,
    });
  });
  res.json({ ok: true });
}));

export default r;
