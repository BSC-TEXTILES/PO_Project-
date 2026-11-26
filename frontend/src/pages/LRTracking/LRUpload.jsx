import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api.js';
import Icon from '../../components/Icon.jsx';
import { FormSkeleton } from '../../components/Skeletons.jsx';

export default function LRUpload() {
  const navigate = useNavigate();
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState('');

  // Editable Form State after OCR extraction
  const [formData, setFormData] = useState({
    lrNumber: '',
    transporterName: 'VRL Logistics Ltd',
    transporterCode: 'vrl',
    consignorName: '',
    consigneeName: 'M/s BSC Exclusive',
    originLocation: '',
    destinationLocation: 'Belagavi',
    destinationStore: 'BEL',
    bookingDate: '',
    dispatchDate: '',
    invoiceNumber: '',
    ewayBillNumber: '',
    packageCount: 1,
    totalWeightKg: '',
    goodsDescription: 'Readymade Garments & Textiles',
    vehicleNumber: '',
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setOcrResult(null);

    const data = new FormData();
    data.append('document', file);

    try {
      const res = await api.post('/lr/upload', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const parsed = res.data;
      setOcrResult(parsed);

      const ext = parsed.extracted || {};
      setFormData({
        lrNumber: ext.lrNumber || '',
        transporterName: ext.transporterName || 'VRL Logistics Ltd',
        transporterCode: ext.transporterCode || 'vrl',
        consignorName: ext.consignorName || '',
        consigneeName: ext.consigneeName || 'M/s BSC Exclusive',
        originLocation: ext.originLocation || '',
        destinationLocation: ext.destinationLocation || 'Belagavi',
        destinationStore: ext.destinationStore || 'BEL',
        bookingDate: ext.bookingDate || new Date().toISOString().slice(0, 10),
        dispatchDate: ext.dispatchDate || new Date().toISOString().slice(0, 10),
        invoiceNumber: ext.invoiceNumber || '',
        ewayBillNumber: ext.ewayBillNumber || '',
        packageCount: ext.packageCount || 1,
        totalWeightKg: ext.totalWeightKg || '',
        goodsDescription: ext.goodsDescription || 'Readymade Garments & Textiles',
        vehicleNumber: ext.vehicleNumber || '',
      });

      // Default PO match if high confidence single match
      if (parsed.matchingPOs && parsed.matchingPOs.length === 1) {
        setSelectedPoId(parsed.matchingPOs[0].id);
      }
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to process document with OCR.');
    } finally {
      setUploading(false);
      // Reset input values
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const handleFieldChange = (key, val) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
  };

  const handleConfirmSave = async (e) => {
    e.preventDefault();
    if (!formData.lrNumber.trim()) {
      setError('Please provide or confirm the LR Number.');
      return;
    }
    if (!formData.transporterName.trim()) {
      setError('Please select or specify the Transport Company Name.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        fileUrl: ocrResult?.fileUrl,
        originalFilename: ocrResult?.originalFilename,
        mimeType: ocrResult?.mimeType,
        fileSize: ocrResult?.fileSize,
        sha256Hash: ocrResult?.sha256Hash,
        poId: selectedPoId || null,
        rawOcrText: ocrResult?.rawTextPreview,
        ocrConfidence: ocrResult?.confidence,
      };

      const res = await api.post('/lr/confirm', payload);
      navigate(`/lr-tracking/track?highlight=${res.data.trackingId}`);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to save LR shipment record.');
    } finally {
      setSaving(false);
    }
  };

  const getConfPill = (fieldKey) => {
    if (!ocrResult?.confidence) return null;
    const score = ocrResult.confidence[fieldKey] || 0;
    if (score >= 0.85) {
      return <span className="lr-conf-pill lr-conf-high">High {Math.round(score * 100)}%</span>;
    }
    if (score >= 0.65) {
      return <span className="lr-conf-pill lr-conf-med">Med {Math.round(score * 100)}%</span>;
    }
    return <span className="lr-conf-pill lr-conf-low">Verify {Math.round(score * 100)}%</span>;
  };

  return (
    <div>
      {/* Upload Box */}
      <div className="lr-upload-box">
        <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon name="camera" size={22} style={{ color: '#1d4ed8' }} />
          Capture or Select Lorry Receipt (LR) Document
        </h2>
        <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '14px' }}>
          Upload high-resolution photo or PDF. The Document Intelligence engine automatically extracts LR tracking numbers, dates, consignor/consignee, goods description, and transporter identity.
        </p>

        {/* Hidden Camera and Gallery File Inputs */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />
        <input
          type="file"
          accept="image/*,application/pdf"
          ref={galleryInputRef}
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />

        <div className="lr-drop-zone" onClick={() => galleryInputRef.current?.click()}>
          <Icon name="upload" size={48} style={{ color: '#3b82f6', margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
            Click to upload or drag and drop LR document
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Supports JPG, JPEG, PNG, PDF (multi-page) up to 50MB
          </p>

          <div className="lr-upload-buttons-row" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lr-upload-btn camera"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Icon name="camera" size={18} />
              Take Photo (Open Camera)
            </button>
            <button
              type="button"
              className="lr-upload-btn gallery"
              onClick={() => galleryInputRef.current?.click()}
              disabled={uploading}
            >
              <Icon name="image" size={18} />
              Choose from Gallery / Files
            </button>
          </div>
        </div>

        {uploading && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'center', padding: '24px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
              <div className="login-spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '15px' }}>Processing Document with OCR & AI...</div>
              <div style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
                Detecting transporter, extracting LR tracking numbers, and validating invoice milestones.
              </div>
            </div>
            <FormSkeleton fields={8} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: '10px', marginBottom: '24px' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* Extracted Details & Verification Section */}
      {ocrResult && (
        <form onSubmit={handleConfirmSave} className="lr-upload-box" style={{ borderTop: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Verify & Confirm Extracted LR Details
              </h3>
              <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                Review AI-extracted information below. You can correct any field before saving into the live tracking registry.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', color: '#64748b' }}>OCR Confidence:</span>
              <span className={`lr-conf-pill ${ocrResult.avgConfidence >= 80 ? 'lr-conf-high' : ocrResult.avgConfidence >= 60 ? 'lr-conf-med' : 'lr-conf-low'}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
                {ocrResult.avgConfidence}% Average
              </span>
            </div>
          </div>

          {ocrResult.duplicateWarning && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
              ⚠️ <strong>Warning:</strong> {ocrResult.duplicateWarning}
            </div>
          )}

          {/* Form Fields Grid */}
          <div className="lr-form-grid">
            {/* LR Number */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>LR / Tracking Number *</span>
                {getConfPill('lrNumber')}
              </label>
              <input
                type="text"
                required
                className="lr-field-input"
                style={{ fontWeight: 700, letterSpacing: '0.04em' }}
                value={formData.lrNumber}
                onChange={(e) => handleFieldChange('lrNumber', e.target.value.toUpperCase())}
                placeholder="e.g. 102938475"
              />
            </div>

            {/* Transporter Company */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Transport Company Name *</span>
                {getConfPill('transporter')}
              </label>
              <select
                className="lr-field-input"
                value={formData.transporterCode}
                onChange={(e) => {
                  const val = e.target.value;
                  const names = {
                    vrl: 'VRL Logistics Ltd',
                    tci: 'TCI Express',
                    safexpress: 'Safexpress',
                    delhivery: 'Delhivery Surface',
                    rivigo: 'Rivigo Prime',
                    other: 'Other Transporter',
                  };
                  handleFieldChange('transporterCode', val);
                  handleFieldChange('transporterName', names[val] || 'Other Transporter');
                }}
              >
                <option value="vrl">VRL Logistics Ltd (Official Integration)</option>
                <option value="tci">TCI Express</option>
                <option value="safexpress">Safexpress</option>
                <option value="delhivery">Delhivery Surface</option>
                <option value="rivigo">Rivigo Prime</option>
                <option value="other">Other Transporter</option>
              </select>
            </div>

            {/* Destination Store Location */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Destination Store Branch *</span>
                {getConfPill('destination')}
              </label>
              <select
                className="lr-field-input"
                value={formData.destinationStore}
                onChange={(e) => {
                  const store = e.target.value;
                  handleFieldChange('destinationStore', store);
                  handleFieldChange('destinationLocation', store === 'BEL' ? 'Belagavi' : store === 'DAV' ? 'Davanagere' : 'Shivamogga');
                }}
              >
                <option value="BEL">BEL – Belagavi (College Road)</option>
                <option value="DAV">DAV – Davanagere (PB Road)</option>
                <option value="SHI">SHI – Shivamogga (B.H. Road)</option>
              </select>
            </div>

            {/* Origin Location */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Origin Location</span>
                {getConfPill('origin')}
              </label>
              <input
                type="text"
                className="lr-field-input"
                value={formData.originLocation}
                onChange={(e) => handleFieldChange('originLocation', e.target.value)}
                placeholder="e.g. Surat, Hubballi, Bengaluru"
              />
            </div>

            {/* Booking Date */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Booking Date</span>
                {getConfPill('bookingDate')}
              </label>
              <input
                type="date"
                className="lr-field-input"
                value={formData.bookingDate}
                onChange={(e) => handleFieldChange('bookingDate', e.target.value)}
              />
            </div>

            {/* Dispatch Date */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Dispatch Date</span>
                {getConfPill('dispatchDate')}
              </label>
              <input
                type="date"
                className="lr-field-input"
                value={formData.dispatchDate}
                onChange={(e) => handleFieldChange('dispatchDate', e.target.value)}
              />
            </div>

            {/* Consignor Name */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Consignor (Supplier / Sender)</span>
                {getConfPill('consignor')}
              </label>
              <input
                type="text"
                className="lr-field-input"
                value={formData.consignorName}
                onChange={(e) => handleFieldChange('consignorName', e.target.value)}
                placeholder="e.g. Sri Pachaiyappa Silks Ltd"
              />
            </div>

            {/* Consignee Name */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Consignee (Receiver)</span>
                {getConfPill('consignee')}
              </label>
              <input
                type="text"
                className="lr-field-input"
                value={formData.consigneeName}
                onChange={(e) => handleFieldChange('consigneeName', e.target.value)}
                placeholder="e.g. M/s BSC Exclusive"
              />
            </div>

            {/* Invoice Number */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Invoice Number</span>
                {getConfPill('invoiceNumber')}
              </label>
              <input
                type="text"
                className="lr-field-input"
                value={formData.invoiceNumber}
                onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
                placeholder="e.g. INV-2026-089"
              />
            </div>

            {/* E-Way Bill Number */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>E-Way Bill Number</span>
                {getConfPill('ewayBillNumber')}
              </label>
              <input
                type="text"
                className="lr-field-input"
                value={formData.ewayBillNumber}
                onChange={(e) => handleFieldChange('ewayBillNumber', e.target.value)}
                placeholder="12-digit E-Way Bill No."
              />
            </div>

            {/* Package Count */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Number of Packages</span>
                {getConfPill('packages')}
              </label>
              <input
                type="number"
                min="1"
                className="lr-field-input"
                value={formData.packageCount}
                onChange={(e) => handleFieldChange('packageCount', parseInt(e.target.value, 10) || 1)}
              />
            </div>

            {/* Total Weight */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Total Weight (kg)</span>
                {getConfPill('weight')}
              </label>
              <input
                type="number"
                step="0.01"
                className="lr-field-input"
                value={formData.totalWeightKg}
                onChange={(e) => handleFieldChange('totalWeightKg', e.target.value)}
                placeholder="e.g. 45.50"
              />
            </div>

            {/* Vehicle Number */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Vehicle Number</span>
                {getConfPill('vehicleNumber')}
              </label>
              <input
                type="text"
                className="lr-field-input"
                value={formData.vehicleNumber}
                onChange={(e) => handleFieldChange('vehicleNumber', e.target.value.toUpperCase())}
                placeholder="e.g. KA-25-D-4821"
              />
            </div>

            {/* Goods Description */}
            <div className="lr-field-group">
              <label className="lr-field-label">
                <span>Goods Description</span>
                {getConfPill('goodsDescription')}
              </label>
              <input
                type="text"
                className="lr-field-input"
                value={formData.goodsDescription}
                onChange={(e) => handleFieldChange('goodsDescription', e.target.value)}
                placeholder="e.g. Readymade Garments & Textiles"
              />
            </div>
          </div>

          {/* Automatic Purchase Order Matching */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
              🔗 Match with Purchase Order
            </h4>
            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748b' }}>
              Link this shipment to an existing Purchase Order to synchronize tracking dates, status, and supplier records.
            </p>

            {ocrResult.matchingPOs && ocrResult.matchingPOs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ocrResult.matchingPOs.map((po) => (
                  <label
                    key={po.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: selectedPoId === po.id ? '#eff6ff' : '#ffffff',
                      border: selectedPoId === po.id ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="radio"
                        name="poSelection"
                        checked={selectedPoId === po.id}
                        onChange={() => setSelectedPoId(po.id)}
                      />
                      <div>
                        <strong style={{ color: '#1e40af' }}>{po.po_number}</strong>
                        <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                        <span>{po.supplier_name || 'Direct Supplier'}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: '#475569' }}>
                      Date: {po.po_date?.slice(0, 10)} &bull; Total: ₹{Number(po.grand_total || 0).toLocaleString('en-IN')}
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: '13px' }}>
                No automatic matching PO detected from OCR text. You can select a PO manually or leave it unlinked.
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              className="lr-upload-btn gallery"
              onClick={() => setOcrResult(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="lr-upload-btn camera"
              disabled={saving}
              style={{ padding: '12px 28px' }}
            >
              {saving ? 'Saving Shipment...' : 'Confirm & Save LR Shipment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
