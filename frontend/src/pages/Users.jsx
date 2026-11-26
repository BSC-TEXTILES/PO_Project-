import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMessage, uploadFile, assetUrl } from '../api.js';
import PhoneInput from '../components/PhoneInput.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../auth.jsx';
import { TableSkeleton } from '../components/Skeletons.jsx';

/* ─── helpers ─────────────────────────────────────────────── */
function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
}

function UserAvatar({ user, size = 34 }) {
  if (user.profile_photo_url)
    return <img src={assetUrl(user.profile_photo_url)} alt={user.full_name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
  const colors = ['#1d4ed8', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
  const bg = colors[(user.full_name || '').charCodeAt(0) % colors.length] || '#1d4ed8';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0 }}>
      {initials(user.full_name)}
    </div>
  );
}

function validatePassword(pw) {
  if (!pw) return { valid: true, errors: [] };
  const errors = [];
  if (pw.length < 10) errors.push('at least 10 characters');
  if (pw.length > 128) errors.push('no more than 128 characters');
  if (!/[A-Z]/.test(pw)) errors.push('one uppercase letter');
  if (!/[a-z]/.test(pw)) errors.push('one lowercase letter');
  if (!/[0-9]/.test(pw)) errors.push('one number');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('one special character');
  if (/(.)\1{2,}/.test(pw)) errors.push('no 3 consecutive identical characters');
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(pw)) errors.push('no sequential characters (abc, 123)');
  return { valid: errors.length === 0, errors };
}

function Badge({ label, color }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + '22', color, marginRight: 3 }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  return status === 'active'
    ? <Badge label="Active" color="#059669" />
    : <Badge label="Inactive" color="#6b7280" />;
}

/* ─── User Form Modal (Create / Edit) ─────────────────────── */
function UserModal({ initial, roles, divisions, sections, onSave, onClose, busy, isAdmin }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    fullName: '', email: '', username: '', employeeId: '',
    phone: '', status: 'active',
    roles: ['viewer'], divisionIds: [], sectionIds: [],
    ...initial,
    password: '',
  });
  const photoRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function toggle(k, val) {
    setForm(f => {
      const arr = f[k] || [];
      return { ...f, [k]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  }

  async function uploadPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoUploading(true);
    try {
      const r = await uploadFile('/users/' + initial.id + '/photo', file);
      setForm(f => ({ ...f, profile_photo_url: r.data?.url || r.data?.data?.url }));
    } catch {}
    setPhotoUploading(false);
  }

  function submit(e) {
    e.preventDefault();
    onSave(form);
  }

  const pwCheck = validatePassword(form.password);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 580, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{isEdit ? `Edit — ${initial.full_name}` : 'Create New User'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={submit} style={{ overflowY: 'auto', padding: '18px 22px', flex: 1 }}>
          {/* photo row (edit only) */}
          {isEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <UserAvatar user={{ ...initial, ...form }} size={52} />
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Profile photo</div>
                <button type="button" onClick={() => photoRef.current?.click()} disabled={photoUploading}
                  style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, background: '#f9fafb', cursor: 'pointer' }}>
                  {photoUploading ? 'Uploading…' : '↑ Upload photo'}
                </button>
                <input ref={photoRef} type="file" accept="image/*" hidden onChange={uploadPhoto} />
              </div>
            </div>
          )}

          {/* basic fields grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Full Name *</label>
              <input value={form.fullName || ''} onChange={e => set('fullName', e.target.value)} required
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Employee ID</label>
              <input value={form.employeeId || ''} onChange={e => set('employeeId', e.target.value)}
                placeholder="e.g. EMP-001"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            {!isEdit && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Email *</label>
                  <input type="email" autoComplete="off" value={form.email || ''} onChange={e => set('email', e.target.value)} required
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Username *</label>
                  <input autoComplete="off" value={form.username || ''} onChange={e => set('username', e.target.value)} required
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Phone</label>
              <PhoneInput value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                {isEdit ? 'New Password (blank = keep)' : 'Password *'}
                <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 11, marginLeft: 4 }}>min 10 chars, A-Z, 0-9, special</span>
              </label>
              <input type="password" autoComplete="new-password" value={form.password || ''} onChange={e => set('password', e.target.value)} required={!isEdit}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              {form.password && !pwCheck.valid && (
                <div style={{ marginTop: 5, fontSize: 11, color: '#b91c1c' }}>
                  {pwCheck.errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </div>
            {isEdit && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Status</label>
                <select value={form.status || 'active'} onChange={e => set('status', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>

          {/* role/location/section assignment (admin only) */}
          {isAdmin ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Assign Role(s)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {roles.map(r => (
                    <label key={r.code} style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 10px',
                      borderRadius: 6, border: `1px solid ${(form.roles || []).includes(r.code) ? '#1d4ed8' : '#d1d5db'}`,
                      background: (form.roles || []).includes(r.code) ? '#eff6ff' : '#fff',
                      cursor: 'pointer', userSelect: 'none',
                    }}>
                      <input type="checkbox" checked={(form.roles || []).includes(r.code)} onChange={() => toggle('roles', r.code)} style={{ cursor: 'pointer' }} />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Division / Location Access</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {divisions.map(d => (
                    <label key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '4px 10px',
                      borderRadius: 6, border: `1px solid ${(form.divisionIds || []).includes(d.id) ? '#059669' : '#d1d5db'}`,
                      background: (form.divisionIds || []).includes(d.id) ? '#f0fdf4' : '#fff',
                      cursor: 'pointer', userSelect: 'none',
                    }}>
                      <input type="checkbox" checked={(form.divisionIds || []).includes(d.id)} onChange={() => toggle('divisionIds', d.id)} style={{ cursor: 'pointer' }} />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                  Collection / Section Scope <span style={{ fontWeight: 400, color: '#9ca3af' }}>(leave empty for all)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto', padding: '4px 2px' }}>
                  {sections.map(s => (
                    <label key={s.id} style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 8px',
                      borderRadius: 6, border: `1px solid ${(form.sectionIds || []).includes(s.id) ? '#7c3aed' : '#e5e7eb'}`,
                      background: (form.sectionIds || []).includes(s.id) ? '#faf5ff' : '#fafafa',
                      cursor: 'pointer', userSelect: 'none',
                    }}>
                      <input type="checkbox" checked={(form.sectionIds || []).includes(s.id)} onChange={() => toggle('sectionIds', s.id)} style={{ cursor: 'pointer' }} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: 12, marginBottom: 18 }}>
              Roles and location access are assigned by an Administrator after account creation.
            </div>
          )}

          {/* actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={busy || (form.password && !pwCheck.valid)}
              style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (busy || (form.password && !pwCheck.valid)) ? 0.6 : 1 }}>
              {busy ? 'Saving…' : isEdit ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Users Page ─────────────────────────────────────── */
export default function Users() {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const isAdmin = !!(me?.isSuperAdmin || (me?.roles || []).includes('domain_admin'));

  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [sections, setSections] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // modal
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/users'),
      api.get('/users/_meta/roles'),
      api.get('/divisions'),
      api.get('/sections'),
    ]).then(([u, r, d, s]) => {
      setRows(u.data.data || []);
      setRoles(r.data.data || []);
      setDivisions(d.data.data || []);
      setSections((s.data.data || []).filter(x => x.status !== 'archived'));
    }).catch(e => setError(errMessage(e))).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  function openNew() {
    setEditing({});
  }
  function openEdit(u) {
    setEditing({
      ...u,
      fullName: u.full_name,
      employeeId: u.employee_id || '',
      roles: u.roles || [],
      divisionIds: u.division_ids || [],
      sectionIds: u.section_ids || [],
      password: '',
    });
  }

  async function save(form) {
    setBusy(true); setError(''); setSuccess('');
    try {
      if (form.password) {
        const ch = validatePassword(form.password);
        if (!ch.valid) throw new Error('Password: ' + ch.errors.join(', '));
      }
      if (editing?.id) {
        const patch = {
          fullName: form.fullName, phone: form.phone, status: form.status,
          employeeId: form.employeeId || null,
          roles: form.roles, divisionIds: form.divisionIds, sectionIds: form.sectionIds,
        };
        await api.patch(`/users/${editing.id}`, patch);
        if (form.password) await api.post(`/users/${editing.id}/reset-password`, { newPassword: form.password });
        setSuccess(`User "${form.fullName}" updated.`);
      } else {
        await api.post('/users', {
          fullName: form.fullName, email: form.email, username: form.username,
          employeeId: form.employeeId || null, phone: form.phone, password: form.password,
          roles: isAdmin ? form.roles : [], divisionIds: form.divisionIds || [], sectionIds: form.sectionIds || [],
        });
        setSuccess(`User "${form.fullName}" created.`);
      }
      setEditing(null); load();
    } catch (e) { setError(errMessage(e)); }
    setBusy(false);
  }

  async function deactivate(u) {
    if (!window.confirm(`Deactivate account for "${u.full_name}"?`)) return;
    try {
      await api.patch(`/users/${u.id}`, { status: 'inactive' });
      setSuccess(`"${u.full_name}" deactivated.`);
      load();
    } catch (e) { setError(errMessage(e)); }
  }

  // filter
  const filtered = rows.filter(u => {
    if (search) {
      const q = search.toLowerCase();
      if (!(
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.employee_id || '').toLowerCase().includes(q)
      )) return false;
    }
    if (filterRole && !(u.roles || []).includes(filterRole)) return false;
    if (filterStatus && u.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="page">
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Users &amp; Roles</h1>
          <p className="page-sub" style={{ margin: '2px 0 0' }}>
            {rows.length} total · {rows.filter(r => r.status === 'active').length} active
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew}
            style={{ padding: '8px 16px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            + Create New User
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          {error} <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 16 }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: 13, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          {success} <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Filter toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, username, email, employee ID…"
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 }}
        />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff' }}>
          <option value="">All Roles</option>
          {roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff' }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={7} columns={7} />
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 40, textAlign: 'center', color: '#9ca3af' }}>No users found</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>User</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>Roles</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>Locations</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>Perms</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>Last Login</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#374151', fontSize: 12 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, idx) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    {/* User info */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <UserAvatar user={u} size={36} />
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{u.full_name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>@{u.username}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{u.email}</div>
                          {u.employee_id && <div style={{ fontSize: 10, color: '#1d4ed8', fontFamily: 'monospace', marginTop: 1 }}>#{u.employee_id}</div>}
                        </div>
                      </div>
                    </td>
                    {/* Roles */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(u.roles || []).map(r => {
                          const rObj = roles.find(x => x.code === r);
                          return <Badge key={r} label={rObj?.name || r} color="#1d4ed8" />;
                        })}
                      </div>
                    </td>
                    {/* Locations */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(u.division_ids || []).map(id => {
                          const d = divisions.find(x => x.id === id);
                          return d ? <Badge key={id} label={d.code || d.name} color="#059669" /> : null;
                        })}
                        {(!u.division_ids || u.division_ids.length === 0) && <span style={{ color: '#9ca3af', fontSize: 11 }}>All</span>}
                      </div>
                    </td>
                    {/* Permission count */}
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{u.permission_count ?? '—'}</span>
                    </td>
                    {/* Status */}
                    <td style={{ padding: '10px 14px' }}><StatusBadge status={u.status} /></td>
                    {/* Last login */}
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#9ca3af' }}>
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {isAdmin && (
                          <>
                            <button onClick={() => openEdit(u)} title="Edit user"
                              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', color: '#374151' }}>
                              Edit
                            </button>
                            <button onClick={() => navigate(`/users/${u.id}/access`)} title="Edit individual permissions"
                              style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid #818cf8', background: '#eef2ff', cursor: 'pointer', color: '#3730a3', fontWeight: 600 }}>
                              🔑 Access
                            </button>
                            {u.status === 'active' && u.id !== me?.id && (
                              <button onClick={() => deactivate(u)} title="Deactivate user"
                                style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', color: '#b91c1c' }}>
                                Deactivate
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {editing !== null && (
        <UserModal
          initial={editing}
          roles={roles}
          divisions={divisions}
          sections={sections}
          onSave={save}
          onClose={() => setEditing(null)}
          busy={busy}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
