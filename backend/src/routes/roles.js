import { Router } from 'express';
import { query, withTransaction, newId, fetchById } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { badRequest, notFoundError, forbidden, ah } from '../utils/httpError.js';
import { logAudit } from '../utils/audit.js';

const r = Router();
r.use(authenticate, requirePermission('users.manage'));

// RBAC: defining roles and their permissions is the Administrator's decision.
const requireSuperAdmin = (req, res, next) => {
  if (req.user.isSuperAdmin || req.user.permissions?.includes('roles.manage')) return next();
  next(forbidden('Only the Administrator can manage roles and permissions'));
};

// List all roles with permission count and user count
r.get('/', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT r.*,
            (SELECT count(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
            (SELECT count(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
       FROM roles r
      ORDER BY r.code`);
  res.json({ data: rows });
}));

// List all available permissions (MUST be before /:id to avoid shadowing)
r.get('/meta/permissions', ah(async (req, res) => {
  const { rows } = await query(`SELECT * FROM permissions ORDER BY module, code`);
  res.json({ data: rows });
}));

// Get single role with permissions and assigned users
r.get('/:id', ah(async (req, res) => {
  const { rows: roles } = await query(`SELECT * FROM roles WHERE id=$1`, [req.params.id]);
  if (!roles.length) throw notFoundError('Role');
  const { rows: perms } = await query(
    `SELECT p.* FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id=$1 ORDER BY p.code`,
    [req.params.id]);
  const { rows: users } = await query(
    `SELECT u.id, u.full_name, u.username, u.email, u.status, u.employee_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role_id = $1
      ORDER BY u.full_name`,
    [req.params.id]);
  res.json({ data: { ...roles[0], permissions: perms, users } });
}));

// Create role (Administrator only)
r.post('/', requireSuperAdmin, ah(async (req, res) => {
  const { code, name, description, permissionIds = [] } = req.body || {};
  if (!code || !name) throw badRequest('code and name are required');
  const normalizedCode = String(code).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!normalizedCode) throw badRequest('Invalid role code');

  const id = newId();
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO roles (id, code, name, description, status) VALUES ($1,$2,$3,$4,'active')`,
      [id, normalizedCode, String(name).trim(), description || null]);
    if (Array.isArray(permissionIds) && permissionIds.length) {
      for (const pid of permissionIds) {
        await tx.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)
           ON DUPLICATE KEY UPDATE role_id = role_id`, [id, pid]);
      }
    }
    await logAudit(tx, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'create',
      entityType: 'role', entityId: id, afterValue: { code: normalizedCode, name, permissionCount: permissionIds.length },
    });
  });
  const created = await fetchById({ query }, 'roles', id);
  res.status(201).json({ data: created });
}));

// Duplicate role + permissions (Administrator only)
r.post('/:id/duplicate', requireSuperAdmin, ah(async (req, res) => {
  const { rows: srcRows } = await query(`SELECT * FROM roles WHERE id=$1`, [req.params.id]);
  if (!srcRows.length) throw notFoundError('Role');
  const src = srcRows[0];

  const customName = req.body?.name ? String(req.body.name).trim() : `${src.name} (Copy)`;
  const customCode = req.body?.code
    ? String(req.body.code).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    : `${src.code}_copy_${Date.now().toString(36).slice(-4)}`;

  const newRoleId = newId();
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO roles (id, code, name, description, status) VALUES ($1,$2,$3,$4,'active')`,
      [newRoleId, customCode, customName, src.description || null]);
    await tx.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, permission_id FROM role_permissions WHERE role_id = $2`,
      [newRoleId, src.id]);
    await logAudit(tx, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'create',
      entityType: 'role', entityId: newRoleId, afterValue: { duplicatedFrom: src.code, code: customCode, name: customName },
    });
  });
  const created = await fetchById({ query }, 'roles', newRoleId);
  res.status(201).json({ data: created });
}));

// Update role name/description/status (Administrator only)
r.patch('/:id', requireSuperAdmin, ah(async (req, res) => {
  const { rows: existing } = await query(`SELECT * FROM roles WHERE id=$1`, [req.params.id]);
  if (!existing.length) throw notFoundError('Role');
  const role = existing[0];
  if (role.code === 'super_admin' && req.body?.status === 'inactive') {
    throw badRequest('Cannot deactivate Super Admin role');
  }
  const { name, description, status } = req.body || {};
  if (role.code === 'super_admin' && name && name !== role.name) {
    throw badRequest('Cannot rename Super Admin role');
  }
  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE roles SET name=COALESCE($2,name), description=COALESCE($3,description), status=COALESCE($4,status) WHERE id=$1`,
      [req.params.id, name ?? null, description ?? null, status ?? null]);
    const updated = await fetchById(tx, 'roles', req.params.id);
    await logAudit(tx, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'edit',
      entityType: 'role', entityId: req.params.id, beforeValue: role, afterValue: updated,
    });
  });
  res.json({ data: await fetchById({ query }, 'roles', req.params.id) });
}));

// Replace role permissions (full set, Administrator only)
r.put('/:id/permissions', requireSuperAdmin, ah(async (req, res) => {
  const { rows: existing } = await query(`SELECT * FROM roles WHERE id=$1`, [req.params.id]);
  if (!existing.length) throw notFoundError('Role');
  if (existing[0].code === 'super_admin') throw badRequest('Cannot modify Super Admin permissions');
  const { permissionIds } = req.body || {};
  if (!Array.isArray(permissionIds)) throw badRequest('permissionIds must be an array');

  const beforePerms = (await query(
    `SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id=$1`,
    [req.params.id])).rows.map((x) => x.code);

  // All-or-nothing: a failure part-way must not leave the role with a partial permission set.
  await withTransaction(async (tx) => {
    await tx.query(`DELETE FROM role_permissions WHERE role_id=$1`, [req.params.id]);
    for (const pid of permissionIds) {
      await tx.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)
         ON DUPLICATE KEY UPDATE role_id = role_id`, [req.params.id, pid]);
    }
    const afterPerms = (await tx.query(
      `SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id=$1`,
      [req.params.id])).rows.map((x) => x.code);
    await logAudit(tx, {
      userId: req.user.id, role: req.user.roles.join(','), actionType: 'role_permissions_update',
      entityType: 'role', entityId: req.params.id,
      beforeValue: { role: existing[0].code, permissions: beforePerms },
      afterValue: { role: existing[0].code, permissions: afterPerms },
    });
  });
  const { rows: perms } = await query(
    `SELECT p.* FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id=$1 ORDER BY p.code`, [req.params.id]);
  res.json({ data: perms });
}));

export default r;
