import { useState, useEffect, useRef } from 'react';
import api from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../auth.jsx';
import { CardSkeleton, FormSkeleton } from '../../components/Skeletons.jsx';

export default function LRGoodsReceiving() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [pendingShipments, setPendingShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [error, setError] = useState(null);

  // Receiving Form State
  const [packagesExpected, setPackagesExpected] = useState(1);
  const [packagesReceived, setPackagesReceived] = useState(1);
  const [packagesDamaged, setPackagesDamaged] = useState(0);
  const [packagesMissing, setPackagesMissing] = useState(0);
  const [conditionStatus, setConditionStatus] = useState('good');
  const [receivingEmployeeName, setReceivingEmployeeName] = useState(user?.fullName || user?.username || '');
  const [podNumber, setPodNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);

  const fetchPendingShipments = async () => {
    try {
      setLoading(true);
      // Fetch active shipments that are delivered or pending receiving
      const res = await api.get('/lr/shipments', {
        params: { status: 'all', pageSize: 50 },
      });
      // Filter shipments that need store receiving
      const pending = (res.data.shipments || []).filter(
        (s) => s.store_received_status !== 'received_verified'
      );
      setPendingShipments(pending);
      if (pending.length > 0 && !selectedShipment) {
        handleSelectShipment(pending[0]);
      }
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to load pending shipments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingShipments();
  }, []);

  const handleSelectShipment = (shipment) => {
    setSelectedShipment(shipment);
    setPackagesExpected(shipment.package_count || 1);
    setPackagesReceived(shipment.package_count || 1);
    setPackagesDamaged(0);
    setPackagesMissing(0);
    setConditionStatus('good');
    setRemarks('');
    setSelectedFiles([]);
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSubmitReceiving = async (e) => {
    e.preventDefault();
    if (!selectedShipment) return;

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      const formData = new FormData();
      formData.append('packagesExpected', packagesExpected);
      formData.append('packagesReceived', packagesReceived);
      formData.append('packagesDamaged', packagesDamaged);
      formData.append('packagesMissing', packagesMissing);
      formData.append('conditionStatus', conditionStatus);
      formData.append('receivingEmployeeName', receivingEmployeeName);
      formData.append('podNumber', podNumber);
      formData.append('remarks', remarks);

      for (const file of selectedFiles) {
        formData.append('proofs', file);
      }

      await api.post(`/lr/shipments/${selectedShipment.id}/receive`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccessMsg(`Shipment LR #${selectedShipment.lr_number} confirmed and verified as Store Received!`);
      setSelectedShipment(null);
      await fetchPendingShipments();
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to confirm goods receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
          Goods Receiving & Store Delivery Confirmation
        </h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: '13.5px' }}>
          Verify packages received at the store branch, log package condition, upload POD photographs, and maintain distinct Transporter Delivered vs Store Received audit milestones.
        </p>
      </div>

      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px' }}>
          ✓ {successMsg}
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      <div className="shipment-workspace">
        {/* Left Column: Shipments awaiting receiving */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', maxHeight: '780px', overflowY: 'auto' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
            Inbound Shipments ({pendingShipments.length})
          </h3>

          {loading ? (
            <CardSkeleton count={4} height={90} />
          ) : pendingShipments.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>All registered shipments have been received and verified.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingShipments.map((s) => {
                const isSelected = selectedShipment?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectShipment(s)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: isSelected ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ color: '#0f172a', fontSize: '14px' }}>LR #{s.lr_number}</strong>
                      <span className="lr-loc-code-pill" style={{ padding: '2px 6px', fontSize: '10.5px' }}>
                        {s.destination_store}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                      {s.transporter_name} &bull; {s.package_count || 1} Pkgs
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b' }}>
                      <span>PO: {s.po_number || 'Direct'}</span>
                      <span className={`lr-status-badge lr-status-${s.current_status}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
                        {s.current_status?.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Goods Receiving Verification Form */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          {selectedShipment ? (
            <form onSubmit={handleSubmitReceiving}>
              <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    Confirm Goods Received — LR #{selectedShipment.lr_number}
                  </h3>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>
                    {selectedShipment.transporter_name} &bull; Destination Store: <strong>{selectedShipment.destination_store}</strong>
                  </div>
                </div>
                <span className={`lr-status-badge lr-status-${selectedShipment.current_status}`}>
                  {selectedShipment.current_status?.replace('_', ' ')}
                </span>
              </div>

              {/* Package Reconciliation Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
                <div className="lr-field-group">
                  <label className="lr-field-label">Expected Packages</label>
                  <input
                    type="number"
                    className="lr-field-input"
                    value={packagesExpected}
                    onChange={(e) => setPackagesExpected(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="lr-field-group">
                  <label className="lr-field-label">Received Packages *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    className="lr-field-input"
                    value={packagesReceived}
                    onChange={(e) => setPackagesReceived(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="lr-field-group">
                  <label className="lr-field-label">Damaged Packages</label>
                  <input
                    type="number"
                    min="0"
                    className="lr-field-input"
                    value={packagesDamaged}
                    onChange={(e) => setPackagesDamaged(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="lr-field-group">
                  <label className="lr-field-label">Missing Packages</label>
                  <input
                    type="number"
                    min="0"
                    className="lr-field-input"
                    value={packagesMissing}
                    onChange={(e) => setPackagesMissing(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>

              {/* Overall Condition & Proof details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div className="lr-field-group">
                  <label className="lr-field-label">Condition Status *</label>
                  <select
                    className="lr-field-input"
                    value={conditionStatus}
                    onChange={(e) => setConditionStatus(e.target.value)}
                  >
                    <option value="good">Good Condition (No Damage)</option>
                    <option value="damaged">Damaged Goods / Torn Packages</option>
                    <option value="partial">Partial Delivery Received</option>
                    <option value="excess">Excess Quantity Received</option>
                  </select>
                </div>

                <div className="lr-field-group">
                  <label className="lr-field-label">POD Number / Gate Pass</label>
                  <input
                    type="text"
                    className="lr-field-input"
                    placeholder="e.g. POD-2026-9842"
                    value={podNumber}
                    onChange={(e) => setPodNumber(e.target.value)}
                  />
                </div>

                <div className="lr-field-group" style={{ gridColumn: 'span 2' }}>
                  <label className="lr-field-label">Receiving Employee Name *</label>
                  <input
                    type="text"
                    required
                    className="lr-field-input"
                    placeholder="Full name of store staff receiving goods"
                    value={receivingEmployeeName}
                    onChange={(e) => setReceivingEmployeeName(e.target.value)}
                  />
                </div>
              </div>

              {/* Delivery Proof (POD) Photo Upload */}
              <div style={{ marginBottom: '20px' }}>
                <label className="lr-field-label" style={{ marginBottom: '6px' }}>
                  Proof of Delivery (POD) & Delivery Photographs
                </label>
                <div
                  style={{
                    border: '2px dashed #cbd5e1', padding: '20px', borderRadius: '10px',
                    textAlign: 'center', background: '#f8fafc', cursor: 'pointer',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <Icon name="camera" size={28} style={{ color: '#3b82f6', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>
                    Click to capture photo or upload POD document
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Supports camera photos, signatures, and gate pass documents
                  </div>
                </div>

                {selectedFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {selectedFiles.map((f, i) => (
                      <span key={i} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#1e40af' }}>
                        📎 {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Remarks */}
              <div className="lr-field-group" style={{ marginBottom: '24px' }}>
                <label className="lr-field-label">Verification Remarks & Inspection Notes</label>
                <textarea
                  rows="3"
                  className="lr-field-input"
                  placeholder="e.g. Unloaded at Davanagere warehouse bay 2. All 5 bales inspected intact."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {/* Submit Action */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="lr-upload-btn gallery"
                  onClick={() => setSelectedShipment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="lr-upload-btn camera"
                  style={{ padding: '12px 28px' }}
                >
                  {submitting ? 'Verifying Receipt...' : 'Confirm Store Received & Save'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8' }}>
              <Icon name="package" size={48} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#1e293b' }}>No Shipment Selected</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>
                Select an inbound shipment from the list on the left to verify goods and upload proof of delivery.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
