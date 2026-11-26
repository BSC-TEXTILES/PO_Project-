import { useState, useEffect } from 'react';
import api from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { TrackingSkeleton } from '../../components/Skeletons.jsx';

export default function LRTimelineModal({ shipmentId, onClose, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingMsg, setTrackingMsg] = useState(null);
  const [error, setError] = useState(null);

  // Manual milestone modal state
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventStatus, setNewEventStatus] = useState('In Transit');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventRemarks, setNewEventRemarks] = useState('');
  const [submittingEvent, setSubmittingEvent] = useState(false);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/lr/shipments/${shipmentId}`);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to load tracking details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (shipmentId) fetchDetails();
  }, [shipmentId]);

  const handleLiveTrack = async () => {
    try {
      setTrackingLoading(true);
      setTrackingMsg(null);
      const res = await api.post(`/lr/shipments/${shipmentId}/track`);
      setTrackingMsg(res.data.message || 'Tracking updated.');
      await fetchDetails();
      if (onRefresh) onRefresh();
    } catch (err) {
      setTrackingMsg(err?.response?.data?.error?.message || 'Tracking update completed.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!newEventStatus.trim()) return;

    try {
      setSubmittingEvent(true);
      await api.post(`/lr/shipments/${shipmentId}/events`, {
        status: newEventStatus,
        location: newEventLocation,
        remarks: newEventRemarks,
      });
      setShowAddEvent(false);
      setNewEventRemarks('');
      setNewEventLocation('');
      await fetchDetails();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err?.response?.data?.error?.message || 'Failed to add tracking event.');
    } finally {
      setSubmittingEvent(false);
    }
  };

  const format12Hour = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  if (!shipmentId) return null;

  const { shipment, events = [], proofs = [], receipts = [] } = data || {};

  // Milestone Stepper definition
  const steps = [
    { key: 'booked', label: 'Booked' },
    { key: 'dispatched', label: 'Dispatched' },
    { key: 'in_transit', label: 'In Transit' },
    { key: 'at_hub', label: 'At Hub' },
    { key: 'out_for_delivery', label: 'Out for Delivery' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'received', label: 'Store Received' },
  ];

  const getStepIndex = (status, storeReceivedStatus) => {
    if (storeReceivedStatus === 'received_verified') return 6;
    switch (status) {
      case 'booked': return 0;
      case 'dispatched': return 1;
      case 'in_transit': return 2;
      case 'at_hub': return 3;
      case 'out_for_delivery': return 4;
      case 'delivered': return 5;
      default: return 2;
    }
  };

  const currentStepIdx = shipment ? getStepIndex(shipment.current_status, shipment.store_received_status) : 0;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
      padding: '20px',
    }}>
      <div style={{
        background: '#ffffff', borderRadius: '16px', maxWidth: '850px', width: '100%',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                LR #{shipment?.lr_number}
              </span>
              <span className={`lr-status-badge lr-status-${shipment?.current_status || 'booked'}`}>
                {shipment?.current_status?.replace('_', ' ')}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>
              Transporter: <strong>{shipment?.transporter_name}</strong> &bull; Destination: <strong>{shipment?.destination_store}</strong> ({shipment?.destination_location || 'Branch'})
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleLiveTrack}
              disabled={trackingLoading}
              className="lr-upload-btn camera"
              style={{ padding: '8px 14px', fontSize: '12.5px' }}
            >
              <Icon name="rotateCw" size={14} className={trackingLoading ? 'spin' : ''} />
              {trackingLoading ? 'Checking Transporter...' : 'Track Live Order'}
            </button>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <Icon name="x" size={22} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <TrackingSkeleton />
          ) : (
            <>
              {trackingMsg && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  ℹ️ {trackingMsg}
                </div>
              )}

              {/* Visual Shipment Progress Stepper */}
              <div className="lr-stepper">
                {steps.map((st, idx) => {
                  const isCompleted = idx < currentStepIdx;
                  const isActive = idx === currentStepIdx;
                  return (
                    <div
                      key={st.key}
                      className={`lr-step-node ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                    >
                      <div className="lr-step-dot">
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      <span className="lr-step-label">{st.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Current Tracking Summary Bar */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
                background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0',
                marginBottom: '24px',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Current Location</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>
                    {shipment?.current_location || 'In Transit on Route'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Purchase Order</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
                    {shipment?.po_number || 'Direct Shipment'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Booking Date</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>
                    {shipment?.booking_date?.slice(0, 10) || 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Store Status</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: shipment?.store_received_status === 'received_verified' ? '#16a34a' : '#d97706', marginTop: '2px' }}>
                    {shipment?.store_received_status === 'received_verified' ? 'Received & Verified' : 'Awaiting Store Receipt'}
                  </div>
                </div>
              </div>

              {/* Direct Official Transporter Portal Link */}
              {shipment?.liveTrackingUrl && (
                <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', padding: '12px 18px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                  <div>
                    <strong style={{ color: '#1e40af', fontSize: '13.5px' }}>Official {shipment?.transporter_name} Live Portal</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Open transporter's verified tracking docket directly.</div>
                  </div>
                  <a
                    href={shipment.liveTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lr-upload-btn camera"
                    style={{ padding: '6px 14px', fontSize: '12.5px', textDecoration: 'none' }}
                  >
                    Open Live Portal ↗
                  </a>
                </div>
              )}

              {/* Events & Milestones Timeline */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Shipment Tracking Timeline
                </h3>
                <button
                  onClick={() => setShowAddEvent(!showAddEvent)}
                  style={{
                    background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px',
                    padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer',
                  }}
                >
                  {showAddEvent ? 'Cancel Update' : '+ Add Status Milestone'}
                </button>
              </div>

              {/* Add Manual Event Form */}
              {showAddEvent && (
                <form onSubmit={handleAddEvent} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #cbd5e1', marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Status Milestone *</label>
                      <select
                        className="lr-field-input"
                        value={newEventStatus}
                        onChange={(e) => setNewEventStatus(e.target.value)}
                      >
                        <option value="In Transit">In Transit</option>
                        <option value="At Hub">Arrived at Hub</option>
                        <option value="Transferred to Branch">Transferred to Destination Branch</option>
                        <option value="Out for Delivery">Out for Delivery</option>
                        <option value="Delivered">Delivered to Store</option>
                        <option value="Delayed">Shipment Delayed</option>
                        <option value="Exception">Transit Exception</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Location</label>
                      <input
                        type="text"
                        className="lr-field-input"
                        placeholder="e.g. Hubballi Hub, Belagavi Branch"
                        value={newEventLocation}
                        onChange={(e) => setNewEventLocation(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Remarks</label>
                    <input
                      type="text"
                      className="lr-field-input"
                      placeholder="e.g. Loaded onto feeder vehicle, expected by evening"
                      value={newEventRemarks}
                      onChange={(e) => setNewEventRemarks(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddEvent(false)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingEvent}
                      className="lr-upload-btn camera"
                      style={{ padding: '6px 16px', fontSize: '12.5px' }}
                    >
                      {submittingEvent ? 'Saving...' : 'Record Milestone'}
                    </button>
                  </div>
                </form>
              )}

              {/* Vertical Events Timeline */}
              <div className="lr-events-timeline">
                {events.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '14px' }}>No tracking events logged yet.</p>
                ) : (
                  events.map((ev) => (
                    <div key={ev.id} className="lr-event-item">
                      <div className="lr-event-dot" />
                      <div className="lr-event-card">
                        <div className="lr-event-card-header">
                          <span className="lr-event-status">{ev.status}</span>
                          <span className="lr-event-time">{format12Hour(ev.event_time)}</span>
                        </div>
                        {ev.location && (
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', marginBottom: '4px' }}>
                            📍 {ev.location}
                          </div>
                        )}
                        {ev.remarks && <p className="lr-event-desc">{ev.remarks}</p>}
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                          Source: {ev.source?.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Original Document Preview */}
              {shipment?.document_url && (
                <div style={{ marginTop: '24px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 700, color: '#334155' }}>
                    Original LR Scanned Document
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <a
                      href={shipment.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="lr-upload-btn gallery"
                      style={{ padding: '8px 16px', fontSize: '13px', textDecoration: 'none' }}
                    >
                      <Icon name="file" size={16} />
                      View Uploaded Document ({shipment.original_filename || 'LR Document'})
                    </a>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
