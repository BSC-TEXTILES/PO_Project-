import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { errMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Money } from '../components/DataTable.jsx';
import Icon from '../components/Icon.jsx';
import { DashboardSkeleton } from '../components/Skeletons.jsx';

// Compact INR for chart labels: ₹2.65L / ₹1.2Cr / ₹45,200
function inrCompact(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

// Horizontal bar chart for brand-wise value
function BrandHBar({ data, maxValue }) {
  const rows = data || [];
  const max = maxValue || Math.max(1, ...rows.map((d) => Number(d.total_value || 0)));
  return (
    <div className="hbar-chart">
      {rows.map((b) => {
        const val = Number(b.total_value || 0);
        const pct = max > 0 ? (val / max) * 100 : 0;
        return (
          <div key={b.brand_id} className="hbar-row" title={`${b.brand_name}: ${inrCompact(val)}`}>
            <span className="hbar-label" style={{ maxWidth: 180, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {b.brand_name} <span className="mono muted">({b.brand_number})</span>
            </span>
            <span className="hbar-track">
              <span className="hbar-fill" style={{ width: `${Math.max(2, pct)}%` }} />
            </span>
            <span className="hbar-value">{inrCompact(val)}</span>
          </div>
        );
      })}
      {!rows.length && <div className="muted">No brand data yet</div>}
    </div>
  );
}

// Status badge counts
function StatusBadges({ brand }) {
  return (
    <div className="brand-status-badges" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {brand.pending_approvals > 0 && <span className="chip st-submitted" title="Pending Approval">⏳ {brand.pending_approvals}</span>}
      {brand.approved_pos > 0 && <span className="chip st-approved" title="Approved">✓ {brand.approved_pos}</span>}
      {brand.rejected_pos > 0 && <span className="chip st-cancelled" title="Rejected">✕ {brand.rejected_pos}</span>}
      {brand.received_pos > 0 && <span className="chip st-received" title="Received">✓ {brand.received_pos}</span>}
      {brand.in_progress_pos > 0 && <span className="chip st-issued" title="In Progress">→ {brand.in_progress_pos}</span>}
      {brand.draft_pos > 0 && <span className="chip st-draft" title="Draft">📝 {brand.draft_pos}</span>}
      {(brand.pending_approvals === 0 && brand.approved_pos === 0 && brand.rejected_pos === 0 && brand.received_pos === 0 && brand.in_progress_pos === 0 && brand.draft_pos === 0) && <span className="muted">—</span>}
    </div>
  );
}

export default function BrandWiseDashboard() {
  const { hasPermission, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    api.get('/reports/brand-wise')
      .then((r) => {
        if (active) {
          setData(r.data);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(errMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading && !data) return <DashboardSkeleton />;
  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!data) return <div className="page"><div className="muted">No data available</div></div>;

  const { overall, brands } = data;

  return (
    <div className="page">
      <div className="polist-head">
        <div>
          <h1 className="page-title">Brand-wise Purchase Order Dashboard</h1>
          <p className="page-sub">Aggregated PO metrics by brand — value, quantity, status breakdown, and drill-down</p>
        </div>
        <div className="polist-head-actions">
          <button className="btn sm" onClick={() => window.print()} title="Print this dashboard">
            <Icon name="file" size={14} /> Print
          </button>
          <a
            href="/reports/brand-wise?format=csv"
            className="btn sm"
            target="_blank"
            rel="noopener noreferrer"
            title="Export brand-wise data as CSV"
          >
            <Icon name="download" size={14} /> Export CSV
          </a>
        </div>
      </div>

      {/* Overall KPI Cards */}
      <div className="donezo-kpis" style={{ marginBottom: 24 }}>
        <div className="donezo-stat-card polist-card kpi-green">
          <div className="st-head"><span>Total Brands with POs</span><div className="st-arrow">↗</div></div>
          <div className="st-val">{brands.length}</div>
          <div className="st-note"><span className="st-up">↑</span> Brands appearing in purchase orders</div>
        </div>
        <Link to="/purchase-orders" className="donezo-stat-card polist-card" style={{ textDecoration: 'none' }}>
          <div className="st-head"><span>Total Purchase Orders</span><div className="st-arrow">↗</div></div>
          <div className="st-val">{overall.total_pos || 0}</div>
          <div className="st-note"><span className="st-up">↑</span> Across all brands in scope</div>
        </Link>
        <Link to="/purchase-orders" className="donezo-stat-card polist-card" style={{ textDecoration: 'none' }}>
          <div className="st-head"><span>Total Quantity Ordered</span><div className="st-arrow">↗</div></div>
          <div className="st-val">{Number(overall.total_quantity || 0).toLocaleString('en-IN')}</div>
          <div className="st-note"><span className="st-up">↑</span> Sum of all line quantities</div>
        </Link>
        <Link to="/purchase-orders" className="donezo-stat-card polist-card" style={{ textDecoration: 'none' }}>
          <div classClass="st-head"><span>Total PO Value</span><div className="st-arrow">↗</div></div>
          <div className="st-val"><Money value={overall.total_value} /></div>
          <div className="st-note"><span className="st-up">↑</span> Sum of line totals (pre-tax)</div>
        </Link>
      </div>

      {/* Secondary KPI Cards - Status Breakdown */}
      <div className="donezo-kpis" style={{ marginBottom: 24 }}>
        <div className="donezo-stat-card polist-card" style={{ textDecoration: 'none' }}>
          <div className="st-head"><span>Pending Approval</span><div className="st-arrow">↗</div></div>
          <div className="st-val">{overall.pending_approvals || 0}</div>
          <div className="st-note"><span className="st-up">↑</span> Value: <Money value={overall.pending_approval_value} /></div>
        </div>
        <div className="donezo-stat-card polist-card kpi-green" style={{ textDecoration: 'none' }}>
          <div className="st-head"><span>Approved</span><div className="st-arrow">↗</div></div>
          <div className="st-val">{overall.approved_pos || 0}</div>
          <div className="st-note"><span className="st-up">↑</span> Awaiting issue</div>
        </div>
        <div className="donezo-stat-card polist-card" style={{ textDecoration: 'none' }}>
          <div className="st-head"><span>Rejected</span><div className="st-arrow">↗</div></div>
          <div className="st-val">{overall.rejected_pos || 0}</div>
          <div className="st-note"><span className="st-up">↑</span> Sent back / rejected</div>
        </div>
        <div className="donezo-stat-card polist-card" style={{ textDecoration: 'none' }}>
          <div className="st-head"><span>Received / Closed</span><div className="st-arrow">↗</div></div>
          <div className="st-val">{overall.received_pos || 0}</div>
          <div className="st-note"><span className="st-up">↑</span> Completed orders</div>
        </div>
      </div>

      {/* Brand-wise Chart */}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Brand-wise Order Value Share</span>
        </div>
        <BrandHBar data={brands} maxValue={Math.max(1, ...brands.map(b => Number(b.total_value || 0)))} />
      </div>

      {/* Brand-wise Table */}
      <div className="panel">
        <div className="polist-table-head">
          <div>
            <div className="polist-table-title">Brand-wise Purchase Order Register</div>
            <div className="polist-table-sub">
              {brands.length} brands in your authorized scope — click a brand to drill down to its POs
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="grid polist-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Brand #</th>
                <th className="num">POs</th>
                <th className="num">Total Qty</th>
                <th className="num">Total Value</th>
                <th className="num">Pending Value</th>
                <th>Status Breakdown</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.brand_id} className="clickable" onClick={() => navigate(`/brand-wise/${b.brand_id}`)}>
                  <td>
                    <strong>{b.brand_name}</strong>
                    {b.brand_number && <div className="muted mono" style={{ fontSize: 11 }}>Serial: {b.brand_number}</div>}
                  </td>
                  <td className="mono">{b.brand_number || '—'}</td>
                  <td className="num">{b.total_pos || 0}</td>
                  <td className="num">{Number(b.total_quantity || 0).toLocaleString('en-IN')}</td>
                  <td className="num"><Money value={b.total_value} /></td>
                  <td className="num"><Money value={b.pending_approval_value} /></td>
                  <td><StatusBadges brand={b} /></td>
                  <td style={{ textAlign: 'center' }}>
                    <Icon name="arrowRight" size={16} className="muted" title="Drill down to this brand's POs" />
                  </td>
                </tr>
              ))}
              {!brands.length && (
                <tr>
                  <td colSpan={8}>
                    <div className="polist-empty">
                      <Icon name="search" size={30} />
                      <span>No brands with purchase orders in your authorized scope yet.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}