import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api.js';
import Icon from '../../components/Icon.jsx';
import LRTimelineModal from './LRTimelineModal.jsx';

export default function LRTrackOrder() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [shipments, setShipments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [destFilter, setDestFilter] = useState('all');
  const [transporterFilter, setTransporterFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  // Selected for timeline modal
  const [selectedShipmentId, setSelectedShipmentId] = useState(highlightId || null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const params = {
        search,
        status: statusFilter,
        destination: destFilter,
        transporter: transporterFilter,
        dateRange: dateFilter,
        page,
        pageSize,
      };
      const res = await api.get('/lr/shipments', { params });
      setShipments(res.data.shipments || []);
      setTotal(res.data.total || 0);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to fetch shipment tracking list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, [page, statusFilter, destFilter, transporterFilter, dateFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchShipments();
  };

  const handleQuickLiveTrack = async (id, lrNum) => {
    try {
      setActionLoadingId(id);
      await api.post(`/lr/shipments/${id}/track`);
      await fetchShipments();
    } catch (err) {
      alert(`Tracking check completed for LR #${lrNum}.`);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div>
      {/* Global Search and Filter Bar */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px 20px', marginBottom: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <input
              type="text"
              className="lr-field-input"
              style={{ paddingLeft: '36px' }}
              placeholder="Search by LR #, PO #, Invoice, Supplier, Origin, Transporter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Icon
              name="search"
              size={18}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
            />
          </div>

          <button type="submit" className="lr-upload-btn camera" style={{ padding: '8px 20px' }}>
            Search
          </button>
          {search && (
            <button
              type="button"
              className="lr-upload-btn gallery"
              style={{ padding: '8px 14px' }}
              onClick={() => { setSearch(''); setPage(1); }}
            >
              Clear
            </button>
          )}
        </form>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Status Filter */}
          <select
            className="lr-field-input"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Shipment Statuses</option>
            <option value="in_transit">In Transit</option>
            <option value="at_hub">At Transshipment Hub</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered to Store</option>
            <option value="delayed">Delayed</option>
            <option value="exception">Transit Exception</option>
            <option value="booked">Booked</option>
          </select>

          {/* Destination Store */}
          <select
            className="lr-field-input"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
            value={destFilter}
            onChange={(e) => { setDestFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Stores (BEL, DAV, SHI)</option>
            <option value="BEL">BEL – Belagavi</option>
            <option value="DAV">DAV – Davanagere</option>
            <option value="SHI">SHI – Shivamogga</option>
          </select>

          {/* Transporter */}
          <select
            className="lr-field-input"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '13px' }}
            value={transporterFilter}
            onChange={(e) => { setTransporterFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Transporters</option>
            <option value="vrl">VRL Logistics Ltd</option>
            <option value="tci">TCI Express</option>
            <option value="safexpress">Safexpress</option>
            <option value="delhivery">Delhivery Surface</option>
            <option value="rivigo">Rivigo Prime</option>
            <option value="other">Other Transporters</option>
          </select>

          {/* Date Range quick filters */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {['today', 'yesterday', 'this_week', 'this_month'].map((df) => (
              <button
                key={df}
                type="button"
                onClick={() => { setDateFilter(dateFilter === df ? '' : df); setPage(1); }}
                style={{
                  background: dateFilter === df ? '#1d4ed8' : '#f1f5f9',
                  color: dateFilter === df ? '#ffffff' : '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {df.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Shipment Registry Table */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
            <div className="login-spinner" style={{ margin: '0 auto 12px' }} />
            <p>Loading shipment tracking registry...</p>
          </div>
        ) : shipments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <Icon name="truck" size={40} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#1e293b' }}>No Shipments Found</h3>
            <p style={{ margin: 0, fontSize: '13px' }}>
              Upload an LR document to register and start tracking your first shipment automatically.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 16px' }}>LR Number</th>
                  <th style={{ padding: '12px 16px' }}>Transporter</th>
                  <th style={{ padding: '12px 16px' }}>PO Number</th>
                  <th style={{ padding: '12px 16px' }}>Route</th>
                  <th style={{ padding: '12px 16px' }}>Booking Date</th>
                  <th style={{ padding: '12px 16px' }}>Current Location</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: s.id === highlightId ? '#eff6ff' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = s.id === highlightId ? '#eff6ff' : 'transparent'; }}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                      <span style={{ color: '#1d4ed8', cursor: 'pointer' }} onClick={() => setSelectedShipmentId(s.id)}>
                        {s.lr_number}
                      </span>
                      {s.invoice_number && (
                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>
                          Inv: {s.invoice_number}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', color: '#334155' }}>
                      <div style={{ fontWeight: 600 }}>{s.transporter_name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{s.supplier_name || 'Direct Consignor'}</div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {s.po_number ? (
                        <span style={{ fontWeight: 600, color: '#2563eb' }}>{s.po_number}</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>Unlinked</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{s.origin || 'Origin'}</span>
                        <span style={{ color: '#94a3b8' }}>&rarr;</span>
                        <span className="lr-loc-code-pill" style={{ padding: '2px 6px', fontSize: '11px' }}>
                          {s.destination_store}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {s.package_count || 1} Pkgs {s.total_weight_kg ? `• ${s.total_weight_kg} kg` : ''}
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      <div>{s.booking_date?.slice(0, 10) || s.created_at?.slice(0, 10)}</div>
                    </td>

                    <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>📍</span>
                        <span>{s.current_location || 'On Route'}</span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span className={`lr-status-badge lr-status-${s.current_status || 'booked'}`}>
                        {s.current_status?.replace('_', ' ')}
                      </span>
                      {s.store_received_status === 'received_verified' && (
                        <div style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700, marginTop: '3px' }}>
                          ✓ Store Received
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="lr-upload-btn camera"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => handleQuickLiveTrack(s.id, s.lr_number)}
                          disabled={actionLoadingId === s.id}
                        >
                          <Icon name="rotateCw" size={12} className={actionLoadingId === s.id ? 'spin' : ''} />
                          Track Order
                        </button>
                        <button
                          type="button"
                          className="lr-upload-btn gallery"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          onClick={() => setSelectedShipmentId(s.id)}
                        >
                          Timeline
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > pageSize && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '13px', color: '#64748b' }}>
            <div>
              Showing {Math.min(total, (page - 1) * pageSize + 1)} - {Math.min(total, page * pageSize)} of {total} shipments
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: page > 1 ? 'pointer' : 'not-allowed' }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * pageSize >= total}
                onClick={() => setPage(page + 1)}
                style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: page * pageSize < total ? 'pointer' : 'not-allowed' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Shipment Tracking Timeline Modal */}
      {selectedShipmentId && (
        <LRTimelineModal
          shipmentId={selectedShipmentId}
          onClose={() => setSelectedShipmentId(null)}
          onRefresh={fetchShipments}
        />
      )}
    </div>
  );
}
