import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Money } from '../components/DataTable.jsx';
import Icon from '../components/Icon.jsx';
import StatusChip from '../components/StatusChip.jsx';
import DateRangeBar from '../components/DateRangeBar.jsx';
import { DashboardSkeleton } from '../components/Skeletons.jsx';

function fmtTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Compact INR for chart labels: ₹2.65L / ₹1.2Cr / ₹45,200
function inrCompact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

const STATUS_COLORS = {
  completed: '#16a34a', approved: '#16a34a', received: '#16a34a', closed: '#16a34a',
  submitted: '#2563eb', under_review: '#2563eb',
  draft: '#6b7280', pending: '#f59e0b',
  issued: '#f59e0b', partially_received: '#f97316',
  cancelled: '#dc2626', archived: '#dc2626',
};

const ROUTE_NAMES = [
  [/^\/purchase-orders\/new/, 'Create Purchase Order'],
  [/^\/purchase-orders\/.+/, 'Purchase Order Details'],
  [/^\/purchase-orders/, 'Purchase Orders'],
  [/^\/products\/new/, 'New Product'],
  [/^\/products\/.+\/edit/, 'Edit Product'],
  [/^\/products\/.+/, 'Product Details'],
  [/^\/products/, 'Products'],
  [/^\/categories/, 'Categories'],
  [/^\/product-types/, 'Product Types'],
  [/^\/brands/, 'Brands'],
  [/^\/colors/, 'Colors'],
  [/^\/sizes/, 'Sizes'],
  [/^\/manufacturers/, 'Manufacturers'],
  [/^\/locations/, 'Locations'],
  [/^\/masters/, 'Masters'],
  [/^\/users/, 'Users & Roles'],
  [/^\/roles/, 'Roles & Permissions'],
  [/^\/reports/, 'Reports'],
  [/^\/export-data/, 'Export Data'],
  [/^\/approvals/, 'Approval Queue'],
  [/^\/receipts/, 'Receiving'],
  [/^\/calendar/, 'PO Calendar'],
  [/^\/catalogue/, 'Catalogue'],
  [/^\/chat/, 'Team Chat'],
  [/^\/videos/, 'Videos'],
  [/^\/settings/, 'Settings'],
  [/^\/pricing/, 'Pricing'],
  [/^\/attachments/, 'Attachments'],
  [/^\/collections/, 'Collections'],
  [/^\/dealers/, 'Dealers'],
  [/^\/company/, 'Company Settings'],
  [/^\/dashboard/, 'Dashboard'],
];

function routeLabel(path = '') {
  for (const [re, name] of ROUTE_NAMES) if (re.test(path)) return name;
  return path || '—';
}

/* ---------- charts (custom SVG/CSS — real data only) ---------- */

// Horizontal bar chart: months run left → right in rows, bar grows rightwards.
function MonthlyHBar({ data }) {
  const rows = data || [];
  const max = Math.max(1, ...rows.map((d) => d.orders));
  return (
    <div className="hbar-chart">
      {rows.map((m) => (
        <div key={m.key} className="hbar-row" title={`${m.label}: ${m.orders} orders · ${inrCompact(m.value)}`}>
          <span className="hbar-label">{m.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(m.orders / max) * 100}%` }} />
          </span>
          <span className="hbar-value">{m.orders}</span>
        </div>
      ))}
      {!rows.length && <div className="muted">No order data yet</div>}
    </div>
  );
}

// Vertical bar chart for division-wise counts.
function DivisionVBar({ data }) {
  const rows = data || [];
  const max = Math.max(1, ...rows.map((d) => d.pos));
  const palette = ['#17324d', '#b98a2f', '#2563eb', '#16a34a', '#db2777', '#7c3aed'];
  return (
    <div className="vbar-chart">
      {rows.map((d, i) => (
        <div key={d.code || d.name} className="vbar-col" title={`${d.name}: ${d.pos} orders · ${inrCompact(d.value)}`}>
          <span className="vbar-value">{d.pos}</span>
          <span className="vbar-track">
            <span className="vbar-fill" style={{ height: `${Math.max(4, (d.pos / max) * 100)}%`, background: palette[i % palette.length] }} />
          </span>
          <span className="vbar-label">{d.code || d.name}</span>
        </div>
      ))}
      {!rows.length && <div className="muted">No order data yet</div>}
    </div>
  );
}

// Horizontal share bars — collection-wise share of total order value.
function CollectionShareBars({ data }) {
  const rows = data || [];
  const total = rows.reduce((a, r) => a + Number(r.value || 0), 0);
  const max = Math.max(1, ...rows.map((r) => Number(r.value || 0)));
  return (
    <div className="hbar-chart">
      {rows.map((r) => {
        const pct = total > 0 ? ((Number(r.value) / total) * 100) : 0;
        return (
          <div key={r.section} className="hbar-row" title={`${r.section}: ${r.pos} orders · ${inrCompact(r.value)}`}>
            <span className="hbar-label wide">{r.section}</span>
            <span className="hbar-track">
              <span className="hbar-fill gold" style={{ width: `${Math.max(2, (Number(r.value) / max) * 100)}%` }} />
            </span>
            <span className="hbar-value">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
      {!rows.length && <div className="muted">No order data yet</div>}
    </div>
  );
}

// Work-done progress ring (SVG, real completed/total ratio).
function ProgressRing({ pct, size = 132 }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const done = Math.max(0, Math.min(100, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="progress-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="12" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#16a34a" strokeWidth="12"
        strokeLinecap="round" strokeDasharray={`${(done / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .8s ease' }}
      />
      <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="ring-num">{done.toFixed(0)}%</text>
      <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" className="ring-sub">work done</text>
    </svg>
  );
}

// Live team monitor — polls the tracking feed every 15s (admin / audit.view).
function LivePanel() {
  const [live, setLive] = useState(null);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const load = () => api.get('/tracking/live').then((r) => setLive(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  if (!live) return <div className="card"><div className="card-title">Team Activity — Live</div><div className="muted">Connecting…</div></div>;

  const { online = [], counts = {}, recent = [] } = live;
  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Team Activity — Live</span>
        <span className="live-dot" title="Refreshes every 15 seconds" />
      </div>
      <div className="live-counts">
        <span className="chip live-chip">● {counts.online ?? online.length} online now</span>
        <span className="chip">{counts.logins_today ?? 0} logins today</span>
        <span className="chip">{counts.logouts_today ?? 0} signed out</span>
      </div>
      <button className="btn sm" style={{ margin: '8px 0' }} onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide members' : 'Show members'}</button>
      {expanded && (
        <div className="live-list">
          {online.map((s) => (
            <div key={s.id} className="live-row">
              <span className="live-pulse" />
              <div className="live-main">
                <strong>{s.full_name}</strong>
                <span className="muted">{s.roles || '—'} · {s.browser} on {s.os} ({s.device_type})</span>
                <span className="muted mono" style={{ fontSize: 11 }}>
                  IP {s.ip_address || '—'}
                  {s.latitude != null && ` · 📍 ${Number(s.latitude).toFixed(4)}, ${Number(s.longitude).toFixed(4)}`}
                </span>
              </div>
              <div className="live-right">
                <span className="chip">{routeLabel(s.current_route)}</span>
                <span className="muted" style={{ fontSize: 11 }}>since {fmtTime(s.login_at)}</span>
              </div>
            </div>
          ))}
          {!online.length && <div className="muted">No members online right now</div>}
        </div>
      )}
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="recent-table">
          <thead><tr><th>Member</th><th>Login</th><th>Logout</th><th>IP</th><th>Device</th><th>Reason</th></tr></thead>
          <tbody>
            {recent.slice(0, 8).map((s) => (
              <tr key={s.id}>
                <td><strong>{s.full_name}</strong></td>
                <td className="muted">{fmtTime(s.login_at)}</td>
                <td className="muted">{s.logout_at ? fmtTime(s.logout_at) : <span className="chip live-chip">online</span>}</td>
                <td className="mono">{s.ip_address || '—'}</td>
                <td className="muted">{s.browser} · {s.device_type}</td>
                <td>{s.ended_reason || '—'}</td>
              </tr>
            ))}
            {!recent.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 14 }}>No sessions recorded yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Brand logo strip — real uploaded logos in fixed, aligned tiles; a clean
// monogram tile when a brand has no logo (never a fake generated image).
function BrandStrip({ brands }) {
  const list = (brands || []).slice(0, 24);
  if (!list.length) return null;
  return (
    <div className="card brand-strip-card" style={{ marginBottom: 24 }}>
      <div className="card-title">Brand Line-up</div>
      <div className="brand-grid">
        {list.map((b) => (
          <div key={b.id} className="brand-tile" title={`${b.brand_name}${b.brand_code ? ` · ${b.brand_code}` : ''}`}>
            {b.logo_url
              ? <img src={b.logo_url} alt={b.brand_name} className="brand-logo-img" />
              : <span className="brand-monogram">{(b.brand_name || '?').slice(0, 2).toUpperCase()}</span>}
            <span className="brand-tile-name">{b.brand_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Restricted Division Supervisor dashboard — Men's section purchase details
// ONLY: net purchase margin, total quantity purchased, discount and the
// individual selling price of each item. Everything else is hidden (RB-018).
function SupervisorDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/reports/men-summary')
      .then((r) => setData(r.data))
      .catch((e) => setError(errMessage(e)));
  }, []);
  if (!data && !error) return <DashboardSkeleton />;
  const t = data?.totals;
  const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Men's Section — Purchase Summary</h1>
          <p className="page-sub">Restricted view (Division Supervisor) — only your section's purchase details are visible.</p>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total Quantity Purchased</div><div className="stat-value">{t ? Number(t.total_quantity).toLocaleString('en-IN') : '…'}</div></div>
        <div className="stat-card"><div className="stat-label">Net Purchase Margin</div><div className="stat-value">{t ? fmt(t.net_purchase_margin) : '…'}</div></div>
        <div className="stat-card"><div className="stat-label">Discount</div><div className="stat-value">{t ? fmt(t.total_discount) : '…'}</div></div>
        <div className="stat-card"><div className="stat-label">Purchase Value</div><div className="stat-value">{t ? fmt(t.purchase_value) : '…'}</div></div>
      </div>
      <div className="panel mt">
        <h3>Individual Selling Price</h3>
        <table className="grid">
          <thead><tr><th>Product</th><th>Brand</th><th>Colour</th><th className="num">Qty</th><th className="num">Purchase price</th><th className="num">Margin %</th><th className="num">Net/unit</th><th className="num">Discount</th><th className="num">Selling price</th></tr></thead>
          <tbody>
            {(data?.sellingPrices || []).map((s, i) => (
              <tr key={i}>
                <td>{s.product_name}<div className="mono muted">{s.sku}</div></td>
                <td>{s.brand_name}</td>
                <td>{s.colour_name || '—'}</td>
                <td className="num">{s.total_quantity}</td>
                <td className="num">{fmt(s.purchase_price)}</td>
                <td className="num">{s.margin_percent}%</td>
                <td className="num">{fmt(s.net_value_per_unit)}</td>
                <td className="num">{Number(s.discount_amount) ? fmt(s.discount_amount) : '—'}</td>
                <td className="num"><strong>{fmt(s.final_value_per_unit)}</strong></td>
              </tr>
            ))}
            {!data?.sellingPrices?.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#6b7280' }}>No purchase details in your section yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  // Division Supervisors get the restricted Men's-section summary only.
  if (hasRole?.('division_supervisor') && !user.isSuperAdmin) return <SupervisorDashboard />;
  return <MainDashboard />;
}

function MainDashboard() {
  const navigate = useNavigate();
  const { user, hasPermission, selectedSectionId, clearSection, selectedLocation, clearLocation } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dashData, setDashData] = useState(null);
  const [dateState, setDateState] = useState({ preset: 'all', from: '', to: '' });
  const [brands, setBrands] = useState([]);
  const [colours, setColours] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);

  // Fetch static master data once
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.get('/brands'),
      api.get('/colours'),
      api.get('/manufacturers?limit=100'),
    ]).then(([brandRes, colorRes, mfgRes]) => {
      if (!active) return;
      if (brandRes.status === 'fulfilled') setBrands(brandRes.value.data?.data || []);
      if (colorRes.status === 'fulfilled') setColours(colorRes.value.data?.data || []);
      if (mfgRes.status === 'fulfilled') setManufacturers(mfgRes.value.data?.data || []);
    });
    return () => { active = false; };
  }, []);

  // Fetch or re-fetch dashboard metrics whenever section, location, or date filter changes
  useEffect(() => {
    let active = true;
    const fetchDashboard = async () => {
      if (dashData) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = {};
        if (selectedSectionId) params.sectionId = selectedSectionId;
        if (selectedLocation && !selectedLocation.toLowerCase().includes('all location')) {
          params.location = selectedLocation;
        }
        if (dateState.from) params.from = dateState.from;
        if (dateState.to) params.to = dateState.to;

        const dashRes = await api.get('/reports/dashboard', { params });
        if (active) {
          setDashData(dashRes.data);
          setError('');
        }
      } catch (e) {
        if (active) setError(errMessage(e));
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    fetchDashboard();
    return () => { active = false; };
  }, [selectedSectionId, selectedLocation, dateState.from, dateState.to]);

  if (loading && !dashData) return <DashboardSkeleton />;
  if (error && !dashData) {
    return (
      <div className="page" style={{ padding: '24px' }}>
        <div className="card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center', padding: 32, borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px', color: '#dc2626' }}>Failed to load dashboard metrics</h3>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>{error}</p>
          <button className="btn primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }
  if (!dashData) return <div className="muted" style={{ padding: 24 }}>No data available</div>;

  const {
    kpis = {}, byDivision = [], bySection = [], bySupplier = [], recentAudit = [],
    monthly = [], recentPOs = [], workProgress = {}, mySections = [],
    lrSummary = {}, pendingApprovalList = [],
  } = dashData;

  const totalBrands = brands.length;
  const totalColors = colours.length;
  const totalManufacturers = manufacturers.length;

  const completedOrders = Number(workProgress.completed || 0);
  const inProgressOrders = Number(kpis.issued || 0) + Number(kpis.partially_received || 0);
  const pendingApprovalCount = Number(kpis.pending_approvals || 0);
  const workPct = workProgress.total ? (completedOrders / workProgress.total) * 100 : 0;
  const canMonitor = user.isSuperAdmin || hasPermission('audit.view');
  const canCreatePO = user.isSuperAdmin || hasPermission('po.create');

  const isFilteredLoc = selectedLocation && !selectedLocation.toLowerCase().includes('all location');

  return (
    <div className="page">
      <div className="polist-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Operations Dashboard</h1>
          <p className="page-sub" style={{ margin: 0 }}>Real-time procurement, store branch performance, and LR shipment overview</p>
          {!user.isSuperAdmin && !!mySections.length && (
            <div className="row" style={{ marginTop: 6, gap: 6, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>Assigned collections:</span>
              {mySections.map((s) => <span key={s.id} className="chip section-chip">{s.name}</span>)}
            </div>
          )}
          {selectedSectionId && (
            <div className="row" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
              <span className="chip polist-scope-pill">Filtered by selected section</span>
              <button className="btn ghost sm" onClick={clearSection} title="Clear section filter">
                <Icon name="x" size={14} /> Clear
              </button>
            </div>
          )}
          {isFilteredLoc && (
            <div className="row" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
              <span className="chip polist-scope-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                <Icon name="location" size={13} /> Store: <strong>{selectedLocation}</strong>
              </span>
              <button className="btn ghost sm" onClick={clearLocation} title="Reset to all locations">
                <Icon name="x" size={14} /> All Locations
              </button>
            </div>
          )}
        </div>
        <div className="polist-head-actions">
          {canCreatePO && (
            <Link to="/purchase-orders/new" className="btn primary">
              + Create Purchase Order
            </Link>
          )}
          {hasPermission('import.manage') && (
            <Link to="/import-data" className="btn">
              Import Data
            </Link>
          )}
        </div>
      </div>

      {/* Date Range Filters */}
      <DateRangeBar preset={dateState.preset} from={dateState.from} to={dateState.to} onChange={setDateState}>
        {refreshing && <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>Refreshing…</span>}
      </DateRangeBar>

      {/* Primary KPI Strip */}
      <div className={`ent-kpi-grid ${refreshing ? 'widget-updating' : ''}`}>
        <Link to="/purchase-orders" className="ent-kpi-card">
          <div className="ent-kpi-label"><span>Total Purchase Orders</span><span>↗</span></div>
          <div className="ent-kpi-val">{Number(kpis.total_pos || 0).toLocaleString('en-IN')}</div>
          <div className="ent-kpi-sub">Total Value: <strong>{inrCompact(kpis.total_value)}</strong></div>
        </Link>

        <Link to="/purchase-orders?status=received" className="ent-kpi-card ok">
          <div className="ent-kpi-label"><span>Received & Closed</span><span>↗</span></div>
          <div className="ent-kpi-val">{completedOrders.toLocaleString('en-IN')}</div>
          <div className="ent-kpi-sub">{workPct.toFixed(0)}% of total orders completed</div>
        </Link>

        <Link to="/purchase-orders?status=issued" className="ent-kpi-card info">
          <div className="ent-kpi-label"><span>Issued / In Transit</span><span>↗</span></div>
          <div className="ent-kpi-val">{inProgressOrders.toLocaleString('en-IN')}</div>
          <div className="ent-kpi-sub">Active orders awaiting delivery</div>
        </Link>

        <Link to="/approvals" className="ent-kpi-card warn">
          <div className="ent-kpi-label"><span>Pending Approval</span><span>↗</span></div>
          <div className="ent-kpi-val">{pendingApprovalCount.toLocaleString('en-IN')}</div>
          <div className="ent-kpi-sub">{Number(workProgress.drafts || 0)} drafts awaiting submission</div>
        </Link>
      </div>

      {/* Store Branch Performance (Belagavi, Davanagere, Shivamogga) */}
      <div className="card" style={{ marginBottom: 20, padding: '18px 20px', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Store Branch Performance</h3>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Purchase order distribution across Belagavi, Davanagere, and Shivamogga</span>
          </div>
          <Link to="/lr-tracking" className="btn sm" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <Icon name="truck" size={14} /> LR Tracking Hub →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {(byDivision.length ? byDivision : [
            { code: 'BLG', name: 'Belagavi', pos: 0, value: 0 },
            { code: 'DVG', name: 'Davanagere', pos: 0, value: 0 },
            { code: 'SMG', name: 'Shivamogga', pos: 0, value: 0 },
          ]).map((div) => (
            <div
              key={div.code || div.name}
              className="card clickable"
              onClick={() => navigate(`/purchase-orders?search=${encodeURIComponent(div.code || div.name)}`)}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
              title={`Click to filter purchase orders for ${div.name}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1e40af' }}>{div.name}</span>
                <span className="chip" style={{ fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>{div.code || 'STORE'}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{div.pos} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>orders</span></div>
              <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>Value: {inrCompact(div.value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Center: Pending Approvals + LR Shipment Alerts */}
      <div className="dash-grid two" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Pending Approvals & Tasks</span>
            <Link to="/approvals" className="btn sm">View Queue →</Link>
          </div>
          {pendingApprovalList.length > 0 ? (
            <div className="table-responsive">
              <table className="grid">
                <thead><tr><th>PO Number</th><th>Store</th><th>Supplier</th><th className="num">Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {pendingApprovalList.map((p) => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/purchase-orders/${p.id}`)}>
                      <td className="mono" style={{ fontWeight: 600, color: '#1d4ed8' }}>{p.po_number}</td>
                      <td>{p.division_name}</td>
                      <td>{p.supplier_name}</td>
                      <td className="num"><Money value={p.grand_total} /></td>
                      <td><StatusChip status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ padding: '16px 0', fontSize: 13 }}>No purchase orders currently awaiting approval.</div>
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>LR Tracking & Delivery Alerts</span>
            <Link to="/lr-tracking/track" className="btn sm">Track Orders →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 8 }}>
            <Link to="/lr-tracking/track" className="ent-kpi-card info" style={{ padding: '12px 14px' }}>
              <div className="ent-kpi-label">In Transit</div>
              <div className="ent-kpi-val" style={{ fontSize: 22 }}>{Number(lrSummary.in_transit || 0)}</div>
            </Link>
            <Link to="/lr-tracking/receiving" className="ent-kpi-card warn" style={{ padding: '12px 14px' }}>
              <div className="ent-kpi-label">Pending Store Receipt</div>
              <div className="ent-kpi-val" style={{ fontSize: 22 }}>{Number(lrSummary.pending_receipt || 0)}</div>
            </Link>
            <Link to="/lr-tracking/track" className="ent-kpi-card ok" style={{ padding: '12px 14px' }}>
              <div className="ent-kpi-label">Delivered</div>
              <div className="ent-kpi-val" style={{ fontSize: 22 }}>{Number(lrSummary.delivered || 0)}</div>
            </Link>
            <Link to="/lr-tracking/track" className="ent-kpi-card danger" style={{ padding: '12px 14px' }}>
              <div className="ent-kpi-label">Delayed / Exceptions</div>
              <div className="ent-kpi-val" style={{ fontSize: 22 }}>{Number(lrSummary.delayed_count || 0) + Number(lrSummary.exceptions || 0)}</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Purchase Orders Table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Recent Purchase Orders</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {canCreatePO && <Link to="/purchase-orders/new" className="btn sm primary">+ New PO</Link>}
            <Link to="/purchase-orders" className="btn sm">View All →</Link>
          </div>
        </div>
        <div className="table-responsive">
          <table className="grid">
            <thead><tr><th>PO Number</th><th>Date</th><th>Store</th><th>Collection</th><th>Supplier</th><th className="num">Qty</th><th className="num">Grand Total</th><th>Status</th></tr></thead>
            <tbody>
              {recentPOs.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/purchase-orders/${p.id}`)}>
                  <td className="mono" style={{ fontWeight: 600, color: '#1d4ed8' }}>{p.po_number}</td>
                  <td>{p.po_date ? new Date(p.po_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td>{p.division_name}</td>
                  <td>{p.section_name}</td>
                  <td>{p.supplier_name}</td>
                  <td className="num">{Number(p.total_quantity || 0).toLocaleString('en-IN')}</td>
                  <td className="num"><strong><Money value={p.grand_total} /></strong></td>
                  <td><StatusChip status={p.status} /></td>
                </tr>
              ))}
              {!recentPOs.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>No purchase orders found for the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions-panel" style={{ marginBottom: 20 }}>
        <div className="qap-header">
          <h2 className="qap-title">Quick Actions</h2>
          <span className="qap-sub">Frequent workflows, one click away</span>
        </div>
        <div className="qa-grid">
          {hasPermission('products.create') && (
            <Link to="/products/new" className="qa-tile">
              <span className="qa-tile-icon blue"><Icon name="plus" size={17} /></span>
              <span className="qa-tile-body">
                <span className="qa-tile-title">Add Product</span>
                <span className="qa-tile-desc">Create a new SKU in any collection</span>
              </span>
              <Icon name="arrowRight" size={14} className="qa-tile-arrow" />
            </Link>
          )}
          <Link to="/lr-tracking/upload" className="qa-tile">
            <span className="qa-tile-icon green"><Icon name="camera" size={17} /></span>
            <span className="qa-tile-body">
              <span className="qa-tile-title">Upload LR Document</span>
              <span className="qa-tile-desc">OCR scan & link lorry receipt</span>
            </span>
            <Icon name="arrowRight" size={14} className="qa-tile-arrow" />
          </Link>
          <Link to="/purchase-orders" className="qa-tile">
            <span className="qa-tile-icon amber"><Icon name="po" size={17} /></span>
            <span className="qa-tile-body">
              <span className="qa-tile-title">Purchase Orders</span>
              <span className="qa-tile-desc">Track, draft and issue orders</span>
            </span>
            <Icon name="arrowRight" size={14} className="qa-tile-arrow" />
          </Link>
          {(user.isSuperAdmin || hasPermission('reports.view')) && (
            <Link to="/reports" className="qa-tile">
              <span className="qa-tile-icon violet"><Icon name="reports" size={17} /></span>
              <span className="qa-tile-body">
                <span className="qa-tile-title">Reports & Export</span>
                <span className="qa-tile-desc">Download Excel, PDF or CSV</span>
              </span>
              <Icon name="arrowRight" size={14} className="qa-tile-arrow" />
            </Link>
          )}
        </div>
      </div>

      {/* Analytics Row */}
      <div className="dash-grid two" style={{ marginBottom: 20 }}>
        <div className={`card analytics-card ${refreshing ? 'widget-updating' : ''}`}>
          <div className="card-title">Monthly Order Volume (12 Months)</div>
          <MonthlyHBar data={monthly} />
        </div>

        <div className={`card progress-card ${refreshing ? 'widget-updating' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card-title" style={{ alignSelf: 'flex-start', width: '100%' }}>Order Completion Ratio</div>
          <div style={{ margin: '14px 0' }}><ProgressRing pct={workPct} /></div>
          <div className="donezo-legend" style={{ display: 'flex', gap: 14, fontSize: 12, fontWeight: 600, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />Completed ({completedOrders})</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />In Progress ({inProgressOrders})</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748b' }} />Pending ({pendingApprovalCount})</span>
          </div>
        </div>
      </div>

      {canMonitor && (
        <div style={{ marginBottom: 20 }}>
          <LivePanel />
        </div>
      )}

      {/* Collection Share + Top Suppliers */}
      <div className={`dash-grid two ${refreshing ? 'widget-updating' : ''}`} style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Collection-wise Share of Order Value</div>
          <CollectionShareBars data={bySection} />
        </div>
        <div className="card">
          <div className="card-title">Top Suppliers</div>
          <div className="info-list">
            {bySupplier.slice(0, 6).map((s, i) => (
              <div key={s.company_name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#1d4ed8', color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{s.company_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.pos} orders</div>
                </div>
                <strong style={{ fontSize: 13 }}><Money value={s.value} /></strong>
              </div>
            ))}
            {!bySupplier.length && <div className="muted">No supplier data yet</div>}
          </div>
        </div>
      </div>

      <BrandStrip brands={brands} />

      {/* Master Data Summary */}
      <div className="dash-grid three master-summary-grid" style={{ marginBottom: 20 }}>
        <div className="card master-stat-card">
          <div className="card-title">Brands</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>{totalBrands}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Active brands</div>
            </div>
            <Link to="/brands" className="btn sm primary">View All →</Link>
          </div>
        </div>
        <div className="card master-stat-card">
          <div className="card-title">Colors</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>{totalColors}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Available colors</div>
            </div>
            <Link to="/colors" className="btn sm primary">View All →</Link>
          </div>
        </div>
        <div className="card master-stat-card">
          <div className="card-title">Manufacturers</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>{totalManufacturers}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Active manufacturers</div>
            </div>
            <Link to="/manufacturers" className="btn sm primary">View All →</Link>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card recent-activity-card" style={{ marginBottom: 20 }}>
        <div className="card-title">Recent Audit Activity</div>
        <ul className="timeline">
          {recentAudit.slice(0, 8).map((a, i) => (
            <li key={i}>
              <div className="t-time">{fmtTime(a.occurred_at)}</div>
              <strong>{a.action_type}</strong> on {a.entity_type.replace(/_/g, ' ')} — {a.actor}
              {a.entity_type === 'purchase_order' && <Link className="btn sm right" style={{ marginLeft: 8 }} to={`/purchase-orders/${a.entity_id}`}>View</Link>}
            </li>
          ))}
          {!recentAudit.length && <li className="muted">No activity yet.</li>}
        </ul>
      </div>
    </div>
  );
}
