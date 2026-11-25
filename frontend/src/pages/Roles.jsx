import { useEffect, useState, useMemo } from 'react';
import api, { errMessage } from '../api.js';
import { useAuth } from '../auth.jsx';

/* ─── tiny helpers ─────────────────────────────────────────── */
function Badge({ label, color = '#6b7280' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: color + '22', color,
    }}>{label}</span>
  );
}

function Alert({ type = 'error', children, onClose }) {
  const bg = type === 'error' ? '#fef2f2' : '#f0fdf4';
  const border = type === 'error' ? '#fca5a5' : '#86efac';
  const color = type === 'error' ? '#b91c1c' : '#166534';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 8, background: bg, border: `1px solid ${border}`, color, fontSize: 13, marginBottom: 12 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
    </div>
  );
}

/* ─── Create / Edit Role Modal ──────────────────────────────── */
function RoleModal({ initial, onSave, onClose, busy }) {
  const [form, setForm] = useState({ name: '', code: '', description: '', ...initial });
  const isEdit = !!initial?.id;

  function submit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Edit Role' : 'Create New Role'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding: '20px 22px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Role Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          {!isEdit && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Role Code * <span style={{ color: '#9ca3af', fontWeight: 400 }}>(snake_case, e.g. purchase_lead)</span></label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })} required
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>
          )}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Description</label>
            <textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              {busy ? 'Saving…' : isEdit ? 'Update Role' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Roles Page ───────────────────────────────────────── */
export default function Roles() {
  const { user } = useAuth();
  const canManage = user?.isSuperAdmin || user?.roles?.includes('domain_admin');

  const [roles, setRoles] = useState([]);
  const [allPerms, setAllPerms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rolePerms, setRolePerms] = useState([]); // array of permission codes checked for selected role
  const [roleDetails, setRoleDetails] = useState(null); // { permissions, users }

  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [permBusy, setPermBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});

  /* load */
  const load = () => {
    api.get('/roles').then(r => setRoles(r.data.data || [])).catch(e => setMsg({ type: 'error', text: errMessage(e) }));
    api.get('/roles/meta/permissions').then(r => setAllPerms(r.data.data || [])).catch(() => {});
  };
  useEffect(load, []);

  /* select role */
  const selectRole = async (role) => {
    setSelected(role);
    setRoleDetails(null);
    setRolePerms([]);
    try {
      const r = await api.get(`/roles/${role.id}`);
      const data = r.data.data || {};
      setRoleDetails(data);
      setRolePerms((data.permissions || []).map(p => p.code));
      // auto-expand modules that have granted permissions
      const mods = {};
      (data.permissions || []).forEach(p => { mods[p.module] = true; });
      setExpandedModules(mods);
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
  };

  /* grouped permissions */
  const grouped = useMemo(() => {
    const g = {};
    allPerms.forEach(p => {
      if (!g[p.module]) g[p.module] = [];
      g[p.module].push(p);
    });
    return g;
  }, [allPerms]);

  const moduleNames = Object.keys(grouped).sort();

  /* toggle single perm */
  const togglePerm = (code) => {
    setRolePerms(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  /* select/deselect all in a module */
  const toggleModule = (module) => {
    const codes = grouped[module].map(p => p.code);
    const allChecked = codes.every(c => rolePerms.includes(c));
    if (allChecked) {
      setRolePerms(prev => prev.filter(c => !codes.includes(c)));
    } else {
      setRolePerms(prev => [...new Set([...prev, ...codes])]);
    }
  };

  /* save permissions */
  const savePerms = async () => {
    if (!selected || !canManage) return;
    setPermBusy(true); setMsg({ type: '', text: '' });
    try {
      const permIds = allPerms.filter(p => rolePerms.includes(p.code)).map(p => p.id);
      await api.put(`/roles/${selected.id}/permissions`, { permissionIds: permIds });
      setMsg({ type: 'success', text: `Permissions for "${selected.name}" saved successfully.` });
      load();
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
    setPermBusy(false);
  };

  /* create role */
  const createRole = async (form) => {
    setBusy(true);
    try {
      await api.post('/roles', form);
      setMsg({ type: 'success', text: `Role "${form.name}" created.` });
      setShowCreate(false);
      load();
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
    setBusy(false);
  };

  /* update role */
  const updateRole = async (form) => {
    setBusy(true);
    try {
      await api.patch(`/roles/${editingRole.id}`, { name: form.name, description: form.description });
      setMsg({ type: 'success', text: `Role "${form.name}" updated.` });
      setEditingRole(null);
      load();
      if (selected?.id === editingRole.id) setSelected(r => ({ ...r, name: form.name }));
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
    setBusy(false);
  };

  /* duplicate role */
  const duplicateRole = async (role) => {
    if (!window.confirm(`Duplicate role "${role.name}"? A copy will be created with all current permissions.`)) return;
    try {
      await api.post(`/roles/${role.id}/duplicate`);
      setMsg({ type: 'success', text: `Role "${role.name}" duplicated.` });
      load();
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
  };

  /* deactivate / reactivate role */
  const toggleStatus = async (role) => {
    const newStatus = role.status === 'active' ? 'inactive' : 'active';
    if (newStatus === 'inactive' && !window.confirm(`Deactivate role "${role.name}"? Users with this role will lose its permissions.`)) return;
    try {
      await api.patch(`/roles/${role.id}`, { status: newStatus });
      setMsg({ type: 'success', text: `Role "${role.name}" ${newStatus === 'active' ? 'reactivated' : 'deactivated'}.` });
      load();
      if (selected?.id === role.id) setSelected(r => ({ ...r, status: newStatus }));
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
  };

  const filteredRoles = roles.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase())
  );

  const isSuperAdmin = selected?.code === 'super_admin';

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Roles &amp; Permissions</h1>
          <p className="page-sub" style={{ margin: '2px 0 0' }}>Manage role-based access control for all users</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            + Create Role
          </button>
        )}
      </div>

      {/* Alert */}
      {msg.text && <Alert type={msg.type} onClose={() => setMsg({ type: '', text: '' })}>{msg.text}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left panel: role list ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search roles…"
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {filteredRoles.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No roles found</div>
            )}
            {filteredRoles.map(role => {
              const isSelected = selected?.id === role.id;
              const isActive = role.status !== 'inactive';
              return (
                <div
                  key={role.id}
                  onClick={() => selectRole(role)}
                  style={{
                    padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                    background: isSelected ? '#eff6ff' : '#fff',
                    borderLeft: isSelected ? '3px solid #1d4ed8' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: isActive ? '#111827' : '#9ca3af', flex: 1 }}>{role.name}</span>
                    {!isActive && <Badge label="Inactive" color="#f59e0b" />}
                    {role.code === 'super_admin' && <Badge label="Protected" color="#7c3aed" />}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b7280' }}>
                    <span>🔑 {role.permission_count || 0} perms</span>
                    <span>👥 {role.user_count || 0} users</span>
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 7 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditingRole(role)} title="Edit role name & description"
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', color: '#374151' }}>
                        Edit
                      </button>
                      <button onClick={() => duplicateRole(role)} title="Duplicate this role"
                        style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', color: '#374151' }}>
                        Duplicate
                      </button>
                      {role.code !== 'super_admin' && (
                        <button onClick={() => toggleStatus(role)} title={isActive ? 'Deactivate role' : 'Reactivate role'}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: `1px solid ${isActive ? '#fca5a5' : '#86efac'}`, background: isActive ? '#fef2f2' : '#f0fdf4', cursor: 'pointer', color: isActive ? '#b91c1c' : '#166534' }}>
                          {isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel: permission editor ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, minHeight: 400 }}>
          {!selected ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Select a Role</div>
              <div style={{ fontSize: 13 }}>Choose a role from the left panel to view and edit its permissions.</div>
            </div>
          ) : (
            <>
              {/* Role info bar */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</span>
                    {selected.status === 'inactive' && <Badge label="Inactive" color="#f59e0b" />}
                    {isSuperAdmin && <Badge label="Super Admin – All Permissions" color="#7c3aed" />}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>{selected.code}</code>
                    &nbsp;· {rolePerms.length} of {allPerms.length} permissions granted
                  </div>
                  {roleDetails?.description && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{roleDetails.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {canManage && !isSuperAdmin && (
                    <>
                      <button onClick={() => { setRolePerms(allPerms.map(p => p.code)); }}
                        style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
                        Grant All
                      </button>
                      <button onClick={() => setRolePerms([])}
                        style={{ fontSize: 12, padding: '5px 12px', borderRadius: 5, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer' }}>
                        Revoke All
                      </button>
                      <button onClick={savePerms} disabled={permBusy}
                        style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        {permBusy ? 'Saving…' : '💾 Save Permissions'}
                      </button>
                    </>
                  )}
                  {isSuperAdmin && (
                    <span style={{ fontSize: 12, color: '#7c3aed', fontStyle: 'italic' }}>Super Admin permissions cannot be edited</span>
                  )}
                </div>
              </div>

              {/* Users assigned */}
              {roleDetails?.users && roleDetails.users.length > 0 && (
                <div style={{ padding: '10px 18px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Assigned users: </span>
                  {roleDetails.users.slice(0, 8).map(u => (
                    <span key={u.id} style={{ fontSize: 12, color: '#6b7280', marginRight: 10 }}>{u.full_name || u.username}</span>
                  ))}
                  {roleDetails.users.length > 8 && <span style={{ fontSize: 12, color: '#9ca3af' }}>+{roleDetails.users.length - 8} more</span>}
                </div>
              )}

              {/* Permission groups */}
              <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', padding: '12px 18px' }}>
                {moduleNames.map(module => {
                  const perms = grouped[module];
                  const checked = perms.filter(p => rolePerms.includes(p.code));
                  const allChecked = checked.length === perms.length;
                  const expanded = expandedModules[module] !== false && (expandedModules[module] === true || checked.length > 0);

                  return (
                    <div key={module} style={{ marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                      {/* Module header */}
                      <div
                        onClick={() => setExpandedModules(prev => ({ ...prev, [module]: !expanded }))}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', color: '#374151', flex: 1 }}>
                          {expanded ? '▾' : '▸'} {module.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{checked.length}/{perms.length}</span>
                        {canManage && !isSuperAdmin && (
                          <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#374151', cursor: 'pointer' }}>
                            <input type="checkbox"
                              checked={allChecked}
                              onChange={() => toggleModule(module)}
                              style={{ cursor: 'pointer' }}
                            />
                            All
                          </label>
                        )}
                      </div>
                      {/* Permission rows */}
                      {expanded && (
                        <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {perms.map(p => (
                            <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canManage && !isSuperAdmin ? 'pointer' : 'default', fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={rolePerms.includes(p.code)}
                                onChange={() => canManage && !isSuperAdmin && togglePerm(p.code)}
                                disabled={!canManage || isSuperAdmin}
                                style={{ cursor: canManage && !isSuperAdmin ? 'pointer' : 'default' }}
                              />
                              <code style={{ fontSize: 11, color: '#1d4ed8', background: '#eff6ff', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>{p.code}</code>
                              <span style={{ color: '#6b7280', fontSize: 12 }}>{p.description}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreate && (
        <RoleModal
          onSave={createRole}
          onClose={() => setShowCreate(false)}
          busy={busy}
        />
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <RoleModal
          initial={editingRole}
          onSave={updateRole}
          onClose={() => setEditingRole(null)}
          busy={busy}
        />
      )}
    </div>
  );
}
