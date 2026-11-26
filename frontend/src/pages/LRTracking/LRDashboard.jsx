import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { DashboardSkeleton } from '../../components/Skeletons.jsx';

export default function LRDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.get('/lr/dashboard');
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to load LR dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // Live update interval every 30 seconds
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  const { overall = {}, locationStats = {}, transporterStats = [], dailyTrends = [] } = data || {};

  return (
    <div>
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="lr-kpi-grid">
        <div className="lr-kpi-card blue">
          <div className="lr-kpi-label">Booked Today</div>
          <div className="lr-kpi-val">{overall.totalBookedToday || 0}</div>
          <div className="lr-kpi-sub">Total booked orders today</div>
        </div>

        <div className="lr-kpi-card cyan">
          <div className="lr-kpi-label">LR Uploaded Today</div>
          <div className="lr-kpi-val">{overall.totalLrUploadedToday || 0}</div>
          <div className="lr-kpi-sub">Processed through OCR</div>
        </div>

        <div className="lr-kpi-card purple">
          <div className="lr-kpi-label">Dispatched</div>
          <div className="lr-kpi-val">{overall.totalDispatched || 0}</div>
          <div className="lr-kpi-sub">Left consignor origin</div>
        </div>

        <div className="lr-kpi-card blue">
          <div className="lr-kpi-label">In Transit</div>
          <div className="lr-kpi-val">{overall.totalInTransit || 0}</div>
          <div className="lr-kpi-sub">Active on road / hub</div>
        </div>

        <div className="lr-kpi-card green">
          <div className="lr-kpi-label">Delivered</div>
          <div className="lr-kpi-val">{overall.totalDelivered || 0}</div>
          <div className="lr-kpi-sub">Transporter delivered</div>
        </div>

        <div className="lr-kpi-card amber">
          <div className="lr-kpi-label">Delayed</div>
          <div className="lr-kpi-val">{overall.totalDelayed || 0}</div>
          <div className="lr-kpi-sub">Past estimated delivery</div>
        </div>

        <div className="lr-kpi-card cyan">
          <div className="lr-kpi-label">Pending Store Receipt</div>
          <div className="lr-kpi-val">{overall.totalPending || 0}</div>
          <div className="lr-kpi-sub">Awaiting branch verification</div>
        </div>

        <div className="lr-kpi-card red">
          <div className="lr-kpi-label">Exceptions</div>
          <div className="lr-kpi-val">{overall.totalExceptions || 0}</div>
          <div className="lr-kpi-sub">Damage / route exceptions</div>
        </div>
      </div>

      {/* Location-Wise Shipment Statistics */}
      <div className="lr-location-section">
        <div className="lr-section-header">
          <h2>
            <Icon name="location" size={20} style={{ color: '#1d4ed8' }} />
            Location-Wise Shipment Statistics
          </h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link to="/lr-tracking/upload" className="lr-upload-btn camera" style={{ padding: '8px 16px', fontSize: '13px' }}>
              <Icon name="camera" size={16} />
              Upload LR Document
            </Link>
            <Link to="/lr-tracking/track" className="lr-upload-btn gallery" style={{ padding: '8px 16px', fontSize: '13px' }}>
              <Icon name="truck" size={16} />
              Track Live Orders
            </Link>
          </div>
        </div>

        <div className="lr-location-grid">
          {/* BEL – Belagavi */}
          <div className="lr-loc-card">
            <div className="lr-loc-header">
              <div>
                <div className="lr-loc-name">Belagavi Store</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>College Road Branch</div>
              </div>
              <span className="lr-loc-code-pill">BEL</span>
            </div>
            <div className="lr-loc-stats-row">
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#2563eb' }}>{locationStats.BEL?.booked_today || 0}</div>
                <div className="txt">Booked Today</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#7c3aed' }}>{locationStats.BEL?.dispatched || 0}</div>
                <div className="txt">Dispatched</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#0284c7' }}>{locationStats.BEL?.in_transit || 0}</div>
                <div className="txt">In Transit</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#16a34a' }}>{locationStats.BEL?.received || 0}</div>
                <div className="txt">Received</div>
              </div>
              <div className="lr-loc-stat-box" style={{ gridColumn: 'span 2' }}>
                <div className="num" style={{ color: '#d97706' }}>{locationStats.BEL?.delayed || 0}</div>
                <div className="txt">Shipments Delayed</div>
              </div>
            </div>
          </div>

          {/* DAV – Davanagere */}
          <div className="lr-loc-card">
            <div className="lr-loc-header">
              <div>
                <div className="lr-loc-name">Davanagere Store</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>PB Road Branch</div>
              </div>
              <span className="lr-loc-code-pill">DAV</span>
            </div>
            <div className="lr-loc-stats-row">
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#2563eb' }}>{locationStats.DAV?.booked_today || 0}</div>
                <div className="txt">Booked Today</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#7c3aed' }}>{locationStats.DAV?.dispatched || 0}</div>
                <div className="txt">Dispatched</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#0284c7' }}>{locationStats.DAV?.in_transit || 0}</div>
                <div className="txt">In Transit</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#16a34a' }}>{locationStats.DAV?.received || 0}</div>
                <div className="txt">Received</div>
              </div>
              <div className="lr-loc-stat-box" style={{ gridColumn: 'span 2' }}>
                <div className="num" style={{ color: '#d97706' }}>{locationStats.DAV?.delayed || 0}</div>
                <div className="txt">Shipments Delayed</div>
              </div>
            </div>
          </div>

          {/* SHI – Shivamogga */}
          <div className="lr-loc-card">
            <div className="lr-loc-header">
              <div>
                <div className="lr-loc-name">Shivamogga Store</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>B.H. Road Branch</div>
              </div>
              <span className="lr-loc-code-pill">SHI</span>
            </div>
            <div className="lr-loc-stats-row">
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#2563eb' }}>{locationStats.SHI?.booked_today || 0}</div>
                <div className="txt">Booked Today</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#7c3aed' }}>{locationStats.SHI?.dispatched || 0}</div>
                <div className="txt">Dispatched</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#0284c7' }}>{locationStats.SHI?.in_transit || 0}</div>
                <div className="txt">In Transit</div>
              </div>
              <div className="lr-loc-stat-box">
                <div className="num" style={{ color: '#16a34a' }}>{locationStats.SHI?.received || 0}</div>
                <div className="txt">Received</div>
              </div>
              <div className="lr-loc-stat-box" style={{ gridColumn: 'span 2' }}>
                <div className="num" style={{ color: '#d97706' }}>{locationStats.SHI?.delayed || 0}</div>
                <div className="txt">Shipments Delayed</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transporter Statistics & Trend Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '22px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
            Transporter Performance & Volume
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {transporterStats.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No transporter shipment records logged yet.</p>
            ) : (
              transporterStats.map((t) => (
                <div key={t.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>{t.name}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Active in transit: {t.inTransit}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#1d4ed8' }}>{t.total}</span>
                    <div style={{ fontSize: '11px', color: '#16a34a' }}>Delivered: {t.delivered}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '22px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
            Daily Inbound Shipment Volume (Last 7 Days)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dailyTrends.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No inbound shipment records logged in the last 7 days.</p>
            ) : (
              dailyTrends.map((d) => (
                <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{d.date}</span>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                    <span style={{ color: '#2563eb' }}>Uploaded: <strong>{d.uploaded}</strong></span>
                    <span style={{ color: '#16a34a' }}>Delivered: <strong>{d.delivered}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
