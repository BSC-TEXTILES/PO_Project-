// In-app notification writer — FRS §18 (Phase 1: in-app channel; email wiring is a transport concern).
// Every insert is also pushed to the live /ws/notify fan-out so open browsers
// update their bell badge + toast without polling.
import { query, newId, fetchById } from '../config/db.js';
import { notifyBus } from '../ws/chat.js';

export async function notifyUsers(client, userIds, n) {
  const executor = client || { query };
  for (const id of userIds) {
    const notificationId = newId();
    await executor.query(
      `INSERT INTO notifications (id, user_id, event_type, entity_type, entity_id, title, body)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [notificationId, id, n.eventType, n.entityType || null, n.entityId || null, n.title, n.body || null]
    );
    const notification = await fetchById(executor, 'notifications', notificationId);
    notifyBus.emit('notification', { userId: id, notification });
  }
}

export async function notifyRole(client, roleCode, n, divisionId = null) {
  const executor = client || { query };
  const { rows } = await executor.query(
    `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE r.code = $1 AND u.status = 'active'
        ${divisionId ? 'AND EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.user_id = u.id AND ud.division_id = $2)' : ''}`,
    divisionId ? [roleCode, divisionId] : [roleCode]
  );
  await notifyUsers(executor, rows.map((x) => x.id), n);
}

