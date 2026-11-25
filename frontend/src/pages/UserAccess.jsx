/**
 * UserAccess.jsx — Per-user permission override editor.
 * Route: /users/:id/access
 * Loads GET /users/:id/access, allows editing roles, divisions,
 * and per-permission allow/deny overrides, then PUTs back.
 */
import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { errMessage } from '../api.js';
import { useAuth } from '../auth.jsx';

/* ─── tiny helpers ─────────────────────────────────────────── */
function Badge({ label, color = '#6b7280', small }) {
  return (
    <span style={{
      display: 'inline-block', padding: small ? '1px 6px' : '2px 8px',
      borderRadius: 20, fontSize: small ? 10 : 11, fontWeight: 600,
      background: color + '22', color,
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

/* ─── Permission row: 3-state toggle ─────────────────────────
 * state: 'inherited' | 'allow' | 'deny'
 */
function PermRow({ perm, state, roleGranted, onChange }) {
  const isInherited = state === 'inherited';
  const isAllow = state === 'allow';
  const isDeny = state === 'deny';

  function cycle() {
    if (isInherited) onChange('allow');
    else if (isAllow) onChange('deny');
    else onChange('inherited');
  }

  let indicatorColor = '#d1d5db';
  let indicatorText = roleGranted ? '✓ Role' : '—';
  let indicatorBg = '#f3f4f6';
  let textColor = roleGranted ? '#374151' : '#9ca3af';

  if (isAllow) { indicatorColor = '#059669'; indicatorText = '✓ Allow'; indicatorBg = '#f0fdf4'; textColor = '#111827'; }
  if (isDeny) { indicatorColor = '#dc2626'; indicatorText = '✗ Deny'; indicatorBg = '#fef2f2'; textColor = '#6b7280'; }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderRadius: 6, background: indicatorBg, marginBottom: 3, cursor: 'pointer' }} onClick={cycle} title="Click to cycle: Inherited → Allow override → Deny override → Inherited">
      <span style={{
        display: 'inline-block', minWidth: 72, padding: '2px 7px', borderRadius: 12,
        fontSize: 10, fontWeight: 700, textAlign: 'center',
        background: indicatorColor + '22', color: indicatorColor, flexShrink: 0,
      }}>{indicatorText}</span>
      <code style={{ fontSize: 11, color: '#1d4ed8', fontFamily: 'monospace', background: '#eff6ff', padding: '1px 5px', borderRadius: 3 }}>{perm.code}</code>
      <span style={{ fontSize: 12, color: textColor, flex: 1 }}>{perm.description}</span>
      {!isInherited && (
        <button onClick={e => { e.stopPropagation(); onChange('inherited'); }}
          style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#9ca3af', padding: 0 }} title="Reset to role default">↺</button>
      )}
    </div>
  );
}

/* ─── Main UserAccess page ──────────────────────────────────── */
export default function UserAccess() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const isAdmin = !!(me?.isSuperAdmin || (me?.roles || []).includes('domain_admin'));

  const [data, setData] = useState(null); // GET /users/:id/access response
  const [allPerms, setAllPerms] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [divisions, setDivisions] = useState([]);

  // Editable state
  const [selRoles, setSelRoles] = useState([]); // array of role codes
  const [selDivisions, setSelDivisions] = useState([]); // array of division ids
  const [selSections, setSelSections] = useState([]); // array of section ids
  const [overrides, setOverrides] = useState({}); // { [permCode]: 'allow' | 'deny' | 'inherited' }

  const [expandedModules, setExpandedModules] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  /* load */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/users/${id}/access`),
      api.get('/roles/meta/permissions'),
      api.get('/users/_meta/roles'),
      api.get('/divisions'),
    ]).then(([acc, perms, roles, divs]) => {
      const d = acc.data.data || {};
      setData(d);
      setSelRoles((d.roles || []).map(r => typeof r === 'string' ? r : r.code));
      setSelDivisions(d.divisionIds || d.division_ids || []);
      setSelSections(d.sectionIds || d.section_ids || []);
      setAllPerms(perms.data.data || []);
      setAllRoles(roles.data.data || []);
      setDivisions(divs.data.data || []);

      // Build initial overrides map from user_permissions
      const ov = {};
      (d.overrides || []).forEach(o => {
        ov[o.permission_code || o.code] = o.effect; // 'allow' | 'deny'
      });
      setOverrides(ov);
    }).catch(e => setMsg({ type: 'error', text: errMessage(e) }))
      .finally(() => setLoading(false));
  }, [id]);

  /* grouped permissions */
  const grouped = useMemo(() => {
    const g = {};
    allPerms.forEach(p => {
      if (!g[p.module]) g[p.module] = [];
      g[p.module].push(p);
    });
    return g;
  }, [allPerms]);

  /* role-granted permission codes (from effective perms of assigned roles) */
  const roleGrantedCodes = useMemo(() => {
    const raw = data?.rolePermissions || data?.role_permissions || [];
    return new Set(raw.map(rp => (typeof rp === 'string' ? rp : rp.code)).filter(Boolean));
  }, [data]);

  /* effective permission state for a code */
  function getState(code) {
    if (overrides[code] === 'allow') return 'allow';
    if (overrides[code] === 'deny') return 'deny';
    return 'inherited';
  }

  function setOverride(code, state) {
    setOverrides(prev => {
      const next = { ...prev };
      if (state === 'inherited') delete next[code];
      else next[code] = state;
      return next;
    });
  }

  /* quick actions */
  function grantAllOverrides() {
    const ov = {};
    allPerms.forEach(p => { ov[p.code] = 'allow'; });
    setOverrides(ov);
  }
  function clearAllOverrides() { setOverrides({}); }
  function viewOnlyOverrides() {
    const ov = {};
    allPerms.forEach(p => {
      if (p.code.endsWith('.view') || p.code.startsWith('dashboard')) ov[p.code] = 'allow';
      else ov[p.code] = 'deny';
    });
    setOverrides(ov);
  }

  /* reset to role defaults */
  async function resetToDefaults() {
    if (!window.confirm('Reset all permission overrides for this user? They will inherit only their role permissions.')) return;
    setBusy(true);
    try {
      await api.post(`/users/${id}/access/reset`);
      setOverrides({});
      setMsg({ type: 'success', text: 'Overrides reset. User now inherits role permissions only.' });
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
    setBusy(false);
  }

  /* save */
  async function save() {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      const permIds = {};
      allPerms.forEach(p => { permIds[p.code] = p.id; });
      const permissionOverrides = Object.entries(overrides)
        .filter(([, effect]) => effect === 'allow' || effect === 'deny')
        .map(([code, effect]) => ({ permissionId: permIds[code], effect }))
        .filter(o => o.permissionId);

      await api.put(`/users/${id}/access`, {
        roles: selRoles,
        divisionIds: selDivisions,
        sectionIds: selSections,
        permissionOverrides,
      });
      setMsg({ type: 'success', text: 'Access settings saved successfully.' });
    } catch (e) { setMsg({ type: 'error', text: errMessage(e) }); }
    setBusy(false);
  }

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="login-spinner" /></div>;

  const u = data?.user || {};
  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="page">
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/users')}
          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
          ← Users
        </button>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Edit Access — {u.full_name}</h1>
          <p className="page-sub" style={{ margin: '2px 0 0' }}>@{u.username} · {u.email}{u.employee_id ? ` · #${u.employee_id}` : ''}</p>
        </div>
        <div style={{ flex: 1 }} />
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetToDefaults} disabled={busy}
              style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              ↺ Reset to Role
            </button>
            <button onClick={save} disabled={busy}
              style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {busy ? 'Saving…' : '💾 Save Access'}
            </button>
          </div>
        )}
      </div>

      {/* Alert */}
      {msg.text && <Alert type={msg.type} onClose={() => setMsg({ type: '', text: '' })}>{msg.text}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left: Roles & Locations ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* User card */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{u.full_name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>@{u.username}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{u.email}</div>
            {u.employee_id && <div style={{ fontSize: 11, color: '#1d4ed8', fontFamily: 'monospace', marginBottom: 6 }}>#{u.employee_id}</div>}
            <div>
              <Badge label={u.status === 'active' ? 'Active' : 'Inactive'} color={u.status === 'active' ? '#059669' : '#6b7280'} />
            </div>
          </div>

          {/* Role assignment */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>Assigned Roles</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {allRoles.map(r => (
                <label key={r.code} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 8px',
                  borderRadius: 6, border: `1px solid ${selRoles.includes(r.code) ? '#1d4ed8' : '#e5e7eb'}`,
                  background: selRoles.includes(r.code) ? '#eff6ff' : '#fafafa',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}>
                  <input type="checkbox" checked={selRoles.includes(r.code)}
                    onChange={() => {
                      if (!isAdmin) return;
                      setSelRoles(prev => prev.includes(r.code) ? prev.filter(c => c !== r.code) : [...prev, r.code]);
                    }}
                    disabled={!isAdmin} style={{ cursor: isAdmin ? 'pointer' : 'default' }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
                  {selRoles.includes(r.code) && <span style={{ fontSize: 10, color: '#1d4ed8' }}>✓</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Division access */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>Location Access</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {divisions.map(d => (
                <label key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 8px',
                  borderRadius: 6, border: `1px solid ${selDivisions.includes(d.id) ? '#059669' : '#e5e7eb'}`,
                  background: selDivisions.includes(d.id) ? '#f0fdf4' : '#fafafa',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}>
                  <input type="checkbox" checked={selDivisions.includes(d.id)}
                    onChange={() => {
                      if (!isAdmin) return;
                      setSelDivisions(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]);
                    }}
                    disabled={!isAdmin} />
                  <span style={{ fontWeight: 600 }}>{d.name}</span>
                  {d.code && <span style={{ fontSize: 10, color: '#6b7280' }}>({d.code})</span>}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
              {selDivisions.length === 0 ? 'No divisions checked → user has no location scope (may be overridden by super admin role).' : ''}
            </div>
          </div>
        </div>

        {/* ── Right: Permission Overrides ── */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Permission Overrides</span>
              {overrideCount > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: '#7c3aed', background: '#faf5ff', padding: '1px 7px', borderRadius: 12 }}>
                  {overrideCount} override{overrideCount !== 1 ? 's' : ''} set
                </span>
              )}
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={viewOnlyOverrides} title="Allow only view permissions, deny the rest"
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, background: '#f9fafb', cursor: 'pointer' }}>View Only</button>
                <button onClick={grantAllOverrides}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, background: '#f9fafb', cursor: 'pointer' }}>Allow All</button>
                <button onClick={clearAllOverrides}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5, background: '#f9fafb', cursor: 'pointer' }}>Clear Overrides</button>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ padding: '8px 18px', background: '#f8fafc', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 16, fontSize: 11, color: '#6b7280' }}>
            <span><strong style={{ color: '#6b7280' }}>Inherited</strong> — from assigned role(s)</span>
            <span><strong style={{ color: '#059669' }}>✓ Allow</strong> — explicit override (grants even if role doesn't)</span>
            <span><strong style={{ color: '#dc2626' }}>✗ Deny</strong> — explicit deny (revokes even if role grants)</span>
            <span style={{ color: '#9ca3af' }}>Click a row to cycle states</span>
          </div>

          {/* Perm groups */}
          <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', padding: '12px 18px' }}>
            {Object.keys(grouped).sort().map(module => {
              const perms = grouped[module];
              const hasOverride = perms.some(p => overrides[p.code]);
              const isExpanded = expandedModules[module] ?? hasOverride;

              return (
                <div key={module} style={{ marginBottom: 8, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                  <div
                    onClick={() => setExpandedModules(prev => ({ ...prev, [module]: !isExpanded }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', color: '#374151', flex: 1 }}>
                      {isExpanded ? '▾' : '▸'} {module.replace(/_/g, ' ')}
                    </span>
                    {hasOverride && <Badge label="overridden" color="#7c3aed" small />}
                    <span style={{ fontSize: 11, color: '#6b7280' }}>{perms.length} perms</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '8px 12px' }}>
                      {perms.map(p => (
                        <PermRow
                          key={p.code}
                          perm={p}
                          state={getState(p.code)}
                          roleGranted={roleGrantedCodes.has(p.code)}
                          onChange={state => isAdmin && setOverride(p.code, state)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
