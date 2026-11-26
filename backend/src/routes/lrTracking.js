// ============================================================================
// LR (Lorry Receipt) Tracking and Shipment Management API
// Production-grade backend controller for OCR extraction, PO linking,
// live transporter tracking, timeline milestones, location dashboards, and goods receiving.
// ============================================================================
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { query, withTransaction, newId, pool } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { ah, badRequest, notFound } from '../utils/httpError.js';
import { logAudit } from '../utils/audit.js';
import { extractRawText, parseLrDocumentText } from '../utils/lrOcr.js';
import { getTransporterAdapter } from '../utils/transporters/index.js';

const r = Router();

// Ensure upload directory exists
const UPLOAD_BASE = path.resolve(process.cwd(), 'uploads', 'lr');
const PROOFS_BASE = path.resolve(process.cwd(), 'uploads', 'pod');
for (const dir of [UPLOAD_BASE, PROOFS_BASE]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Multer storage configuration for LR documents
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_BASE),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `lr-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, JPEG, PNG, WEBP, and PDF documents are allowed.'));
    }
  },
});

// Multer for POD / Delivery Proofs
const podStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROOFS_BASE),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `pod-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});
const podUpload = multer({
  storage: podStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only JPG, JPEG, PNG, WEBP, and PDF files are allowed.'));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/lr/dashboard — Advanced Location-Wise & Overall Dashboard Stats
// ─────────────────────────────────────────────────────────────────────────────
r.get('/dashboard', authenticate, ah(async (req, res) => {
  // Overall system counts
  const { rows: [overall] } = await query(`
    SELECT
      COUNT(*) AS total_shipments,
      SUM(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 ELSE 0 END) AS total_lr_uploaded_today,
      SUM(CASE WHEN DATE(booking_date) = CURRENT_DATE THEN 1 ELSE 0 END) AS total_booked_today,
      SUM(CASE WHEN current_status = 'dispatched' THEN 1 ELSE 0 END) AS total_dispatched,
      SUM(CASE WHEN current_status IN ('in_transit', 'at_hub', 'out_for_delivery') THEN 1 ELSE 0 END) AS total_in_transit,
      SUM(CASE WHEN current_status = 'delivered' OR store_received_status = 'received_verified' THEN 1 ELSE 0 END) AS total_delivered,
      SUM(CASE WHEN current_status = 'delayed' THEN 1 ELSE 0 END) AS total_delayed,
      SUM(CASE WHEN current_status IN ('booked', 'dispatched') AND store_received_status = 'pending' THEN 1 ELSE 0 END) AS total_pending,
      SUM(CASE WHEN current_status = 'exception' THEN 1 ELSE 0 END) AS total_exceptions
    FROM lr_tracking
  `);

  // Location-wise statistics (BEL – Belagavi, DAV – Davanagere, SHI – Shivamogga)
  const { rows: locRows } = await query(`
    SELECT
      destination_store,
      COUNT(*) AS total,
      SUM(CASE WHEN DATE(booking_date) = CURRENT_DATE THEN 1 ELSE 0 END) AS booked_today,
      SUM(CASE WHEN current_status = 'dispatched' THEN 1 ELSE 0 END) AS dispatched,
      SUM(CASE WHEN current_status IN ('in_transit', 'at_hub', 'out_for_delivery') THEN 1 ELSE 0 END) AS in_transit,
      SUM(CASE WHEN current_status = 'delivered' OR store_received_status = 'received_verified' THEN 1 ELSE 0 END) AS received,
      SUM(CASE WHEN current_status = 'delayed' THEN 1 ELSE 0 END) AS delayed_count,
      SUM(CASE WHEN current_status = 'exception' THEN 1 ELSE 0 END) AS exceptions
    FROM lr_tracking
    GROUP BY destination_store
  `);

  const locationStats = {
    BEL: { code: 'BEL', name: 'Belagavi', total: 0, booked_today: 0, dispatched: 0, in_transit: 0, received: 0, delayed: 0, exceptions: 0 },
    DAV: { code: 'DAV', name: 'Davanagere', total: 0, booked_today: 0, dispatched: 0, in_transit: 0, received: 0, delayed: 0, exceptions: 0 },
    SHI: { code: 'SHI', name: 'Shivamogga', total: 0, booked_today: 0, dispatched: 0, in_transit: 0, received: 0, delayed: 0, exceptions: 0 },
  };

  for (const r of locRows) {
    const store = String(r.destination_store || '').toUpperCase();
    const key = store === 'BLG' ? 'BEL' : store === 'DVG' ? 'DAV' : store === 'SMG' ? 'SHI' : store;
    if (locationStats[key]) {
      locationStats[key] = {
        code: key,
        name: key === 'BEL' ? 'Belagavi' : key === 'DAV' ? 'Davanagere' : 'Shivamogga',
        total: Number(r.total || 0),
        booked_today: Number(r.booked_today || 0),
        dispatched: Number(r.dispatched || 0),
        in_transit: Number(r.in_transit || 0),
        received: Number(r.received || 0),
        delayed: Number(r.delayed_count ?? r.delayed ?? 0),
        exceptions: Number(r.exceptions || 0),
      };
    }
  }

  // Transporter-wise distribution
  const { rows: transporterStats } = await query(`
    SELECT
      transporter_code,
      transporter_name,
      COUNT(*) AS total_shipments,
      SUM(CASE WHEN current_status IN ('in_transit', 'at_hub', 'out_for_delivery') THEN 1 ELSE 0 END) AS active_in_transit,
      SUM(CASE WHEN current_status = 'delivered' OR store_received_status = 'received_verified' THEN 1 ELSE 0 END) AS delivered
    FROM lr_tracking
    GROUP BY transporter_code, transporter_name
    ORDER BY total_shipments DESC
  `);

  // Daily trends for the last 7 days
  const { rows: dailyTrends } = await query(`
    SELECT
      DATE(created_at) AS date_label,
      COUNT(*) AS uploaded,
      SUM(CASE WHEN current_status IN ('delivered', 'received') OR store_received_status = 'received_verified' THEN 1 ELSE 0 END) AS delivered
    FROM lr_tracking
    WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
    GROUP BY DATE(created_at)
    ORDER BY date_label ASC
  `);

  res.json({
    overall: {
      totalShipments: Number(overall?.total_shipments || 0),
      totalLrUploadedToday: Number(overall?.total_lr_uploaded_today || 0),
      totalBookedToday: Number(overall?.total_booked_today || 0),
      totalDispatched: Number(overall?.total_dispatched || 0),
      totalInTransit: Number(overall?.total_in_transit || 0),
      totalDelivered: Number(overall?.total_delivered || 0),
      totalDelayed: Number(overall?.total_delayed || 0),
      totalPending: Number(overall?.total_pending || 0),
      totalExceptions: Number(overall?.total_exceptions || 0),
    },
    locationStats,
    transporterStats: transporterStats.map((t) => ({
      code: t.transporter_code,
      name: t.transporter_name,
      total: Number(t.total_shipments || 0),
      inTransit: Number(t.active_in_transit || 0),
      delivered: Number(t.delivered || 0),
    })),
    dailyTrends: dailyTrends.map((d) => ({
      date: d.date_label,
      uploaded: Number(d.uploaded || 0),
      delivered: Number(d.delivered || 0),
    })),
    lastUpdated: new Date().toISOString(),
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 2. POST /api/lr/upload — OCR Process Document (Camera or Gallery)
// ─────────────────────────────────────────────────────────────────────────────
r.post('/upload', authenticate, upload.single('document'), ah(async (req, res) => {
  if (!req.file) throw badRequest('No file uploaded.');

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  const originalName = req.file.originalname;
  const fileSize = req.file.size;
  const fileUrl = `/uploads/lr/${req.file.filename}`;

  // Calculate file SHA256 hash for document integrity and duplicate detection
  const fileBuf = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBuf).digest('hex');

  // Extract text via OCR / PDF parser
  const ocrRaw = await extractRawText(filePath, mimeType);
  const ocrParsed = parseLrDocumentText(ocrRaw.text);

  // Check if LR already exists to warn user upfront
  let duplicateWarning = null;
  if (ocrParsed.extracted.lrNumber) {
    const { rows: existing } = await query(
      'SELECT id, lr_number, transporter_name, current_status FROM lr_tracking WHERE lr_number = $1 AND transporter_code = $2 LIMIT 1',
      [ocrParsed.extracted.lrNumber, ocrParsed.extracted.transporterCode]
    );
    if (existing.length > 0) {
      duplicateWarning = `Shipment with LR ${ocrParsed.extracted.lrNumber} (${existing[0].transporter_name}) already exists with status: ${existing[0].current_status}.`;
    }
  }

  // Automatic PO Matching
  let matchingPOs = [];
  try {
    const poCandidates = await query(`
      SELECT po.id, po.po_number, po.status, po.grand_total, po.po_date,
             s.name AS supplier_name, l.name AS location_name, l.code AS location_code
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN locations l ON l.id = po.location_id
      WHERE po.status IN ('approved', 'issued', 'partially_received', 'submitted')
      ORDER BY po.created_at DESC
      LIMIT 100
    `);

    // Match scoring
    matchingPOs = poCandidates.rows.filter((p) => {
      let score = 0;
      if (ocrParsed.extracted.lrNumber && ocrRaw.text.includes(p.po_number)) score += 5;
      if (ocrParsed.extracted.invoiceNumber && ocrRaw.text.includes(ocrParsed.extracted.invoiceNumber)) score += 3;
      if (p.supplier_name && ocrParsed.extracted.consignorName && 
          (ocrParsed.extracted.consignorName.toLowerCase().includes(p.supplier_name.toLowerCase()) ||
           p.supplier_name.toLowerCase().includes(ocrParsed.extracted.consignorName.toLowerCase()))) {
        score += 4;
      }
      return score >= 3;
    });
  } catch (err) {
    console.warn('[LR-Match] PO match lookup warning:', err.message);
  }

  res.json({
    fileUrl,
    originalFilename: originalName,
    mimeType,
    fileSize,
    sha256Hash: hash,
    extracted: ocrParsed.extracted,
    confidence: ocrParsed.confidence,
    avgConfidence: ocrParsed.avgConfidence,
    requiresVerification: ocrParsed.requiresVerification,
    rawTextPreview: ocrParsed.rawTextPreview,
    duplicateWarning,
    matchingPOs,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/lr/confirm — Save Verified LR, Document, and Link to PO
// ─────────────────────────────────────────────────────────────────────────────
r.post('/confirm', authenticate, ah(async (req, res) => {
  const {
    fileUrl, originalFilename, mimeType, fileSize, sha256Hash,
    lrNumber, transporterCode, transporterName, poId,
    consignorName, consigneeName, originLocation, destinationLocation, destinationStore,
    bookingDate, dispatchDate, invoiceNumber, ewayBillNumber,
    packageCount, totalWeightKg, goodsDescription, vehicleNumber,
    rawOcrText, ocrConfidence,
  } = req.body || {};

  if (!lrNumber || !lrNumber.trim()) throw badRequest('LR Number is required.');
  if (!transporterName || !transporterName.trim()) throw badRequest('Transporter Name is required.');

  const cleanLr = lrNumber.trim().toUpperCase();
  const code = (transporterCode || 'other').toLowerCase();
  const store = ['BEL', 'DAV', 'SHI'].includes(String(destinationStore).toUpperCase()) 
    ? String(destinationStore).toUpperCase() 
    : 'BEL';

  // Check duplicate LR entry
  const { rows: dupCheck } = await query(
    'SELECT id FROM lr_tracking WHERE lr_number = $1 AND transporter_code = $2 LIMIT 1',
    [cleanLr, code]
  );
  if (dupCheck.length > 0) {
    return res.status(409).json({
      error: { message: `LR Number "${cleanLr}" for ${transporterName} already exists in the system.`, code: 'DUPLICATE_LR' }
    });
  }

  const result = await withTransaction(async (tx) => {
    // 1. Save lr_documents
    const docId = newId();
    await tx.query(`
      INSERT INTO lr_documents (id, file_url, original_filename, mime_type, file_size, sha256_hash, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [docId, fileUrl || '', originalFilename || 'lr-document', mimeType || 'image/jpeg', fileSize || 0, sha256Hash || null, req.user.id]);

    // 2. Save lr_extracted_details
    const extractedId = newId();
    await tx.query(`
      INSERT INTO lr_extracted_details (
        id, lr_document_id, lr_number, transporter_name, transporter_code,
        consignor_name, consignee_name, origin_location, destination_location,
        booking_date, dispatch_date, invoice_number, eway_bill_number,
        package_count, total_weight_kg, goods_description, vehicle_number,
        raw_ocr_text, ocr_confidence, is_verified, verified_by, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, NOW())
    `, [
      extractedId, docId, cleanLr, transporterName, code,
      consignorName || null, consigneeName || null, originLocation || 'Origin', destinationLocation || store,
      bookingDate || null, dispatchDate || null, invoiceNumber || null, ewayBillNumber || null,
      packageCount || 1, totalWeightKg || null, goodsDescription || null, vehicleNumber || null,
      rawOcrText || null, JSON.stringify(ocrConfidence || {}), req.user.id
    ]);

    // 3. Resolve PO Number and Supplier info if poId provided
    let poNumber = null;
    let supplierId = null;
    let supplierName = null;
    if (poId) {
      const { rows: [po] } = await tx.query(`
        SELECT po.po_number, po.supplier_id, s.name AS supplier_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ? LIMIT 1
      `, [poId]);
      if (po) {
        poNumber = po.po_number;
        supplierId = po.supplier_id;
        supplierName = po.supplier_name;

        // Automatically update Purchase Order tracking fields
        await tx.query(`
          UPDATE purchase_orders
          SET lr_number = ?,
              transporter_name = ?,
              transporter_code = ?,
              dispatch_date = COALESCE(?, CURRENT_DATE),
              shipment_status = 'in_transit'
          WHERE id = ?
        `, [cleanLr, transporterName, code, dispatchDate || null, poId]);
      }
    }

    // 4. Create primary lr_tracking record
    const trackingId = newId();
    await tx.query(`
      INSERT INTO lr_tracking (
        id, lr_number, transporter_code, transporter_name,
        po_id, po_number, lr_document_id, supplier_id, supplier_name, invoice_number,
        origin, destination_store, current_status, store_received_status,
        current_location, package_count, total_weight_kg,
        booking_date, dispatch_date, expected_delivery_date,
        sync_status, notes, created_by
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, 'in_transit', 'pending',
        ?, ?, ?,
        ?, ?, ?,
        'initial', ?, ?
      )
    `, [
      trackingId, cleanLr, code, transporterName,
      poId || null, poNumber, docId, supplierId, supplierName || consignorName || null, invoiceNumber || null,
      originLocation || 'Origin', store,
      originLocation || 'Origin Hub', packageCount || 1, totalWeightKg || null,
      bookingDate || null, dispatchDate || null, null,
      goodsDescription || null, req.user.id
    ]);

    // 5. Initial Tracking Timeline Milestones
    const ev1 = newId();
    await tx.query(`
      INSERT INTO lr_tracking_events (id, lr_tracking_id, event_time, status, location, remarks, source, created_by)
      VALUES (?, ?, NOW(), 'LR Created', ?, 'LR Document uploaded and verified', 'ocr_booking', ?)
    `, [ev1, trackingId, originLocation || 'Origin', req.user.id]);

    const ev2 = newId();
    await tx.query(`
      INSERT INTO lr_tracking_events (id, lr_tracking_id, event_time, status, location, remarks, source, created_by)
      VALUES (?, ?, NOW(), 'In Transit', ?, CONCAT('Dispatched via ', ?), 'transporter_api', ?)
    `, [ev2, trackingId, originLocation || 'Origin Hub', transporterName, req.user.id]);

    // 6. Audit Trail
    await tx.query(`
      INSERT INTO lr_audit_logs (id, lr_tracking_id, action_type, performed_by, details, ip_address)
      VALUES (?, ?, 'create_lr', ?, ?, ?)
    `, [
      newId(), trackingId, req.user.id,
      JSON.stringify({ lrNumber: cleanLr, transporter: transporterName, poId, store }),
      req.ip || '127.0.0.1'
    ]);

    return { trackingId, lrNumber: cleanLr, docId };
  });

  res.status(201).json({
    message: 'LR tracking record created successfully.',
    trackingId: result.trackingId,
    lrNumber: result.lrNumber,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET /api/lr/shipments — Paginated List with Advanced Search & Filters
// ─────────────────────────────────────────────────────────────────────────────
r.get('/shipments', authenticate, ah(async (req, res) => {
  const {
    search = '', status = '', destination = '', transporter = '',
    dateRange = '', from = '', to = '',
    page = 1, pageSize = 20,
  } = req.query;

  const conditions = [];
  const params = [];

  if (search.trim()) {
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s, s);
    conditions.push(`(
      t.lr_number LIKE $${params.length - 4} OR
      t.po_number LIKE $${params.length - 3} OR
      t.invoice_number LIKE $${params.length - 2} OR
      t.supplier_name LIKE $${params.length - 1} OR
      t.transporter_name LIKE $${params.length}
    )`);
  }

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`t.current_status = $${params.length}`);
  }

  if (destination && destination !== 'all') {
    params.push(destination.toUpperCase());
    conditions.push(`t.destination_store = $${params.length}`);
  }

  if (transporter && transporter !== 'all') {
    params.push(transporter.toLowerCase());
    conditions.push(`t.transporter_code = $${params.length}`);
  }

  // Date filters
  if (dateRange === 'today') {
    conditions.push(`DATE(t.created_at) = CURRENT_DATE`);
  } else if (dateRange === 'yesterday') {
    conditions.push(`DATE(t.created_at) = DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY)`);
  } else if (dateRange === 'this_week') {
    conditions.push(`t.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)`);
  } else if (dateRange === 'this_month') {
    conditions.push(`t.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)`);
  } else if (from && to) {
    params.push(from, to);
    conditions.push(`DATE(t.created_at) BETWEEN $${params.length - 1} AND $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const p = Math.max(1, parseInt(page, 10));
  const ps = Math.min(100, Math.max(5, parseInt(pageSize, 10)));
  const offset = (p - 1) * ps;

  // Count total
  const countSql = `SELECT COUNT(*) AS total FROM lr_tracking t ${whereClause}`;
  const { rows: [countRow] } = await query(countSql, params);
  const total = Number(countRow?.total || 0);

  // Data query
  params.push(ps, offset);
  const dataSql = `
    SELECT
      t.id, t.lr_number, t.transporter_code, t.transporter_name,
      t.po_id, t.po_number, t.lr_document_id, t.supplier_id, t.supplier_name,
      t.invoice_number, t.origin, t.destination_store, t.current_status,
      t.store_received_status, t.current_location, t.package_count, t.total_weight_kg,
      t.booking_date, t.dispatch_date, t.expected_delivery_date,
      t.transporter_delivered_at, t.store_received_at, t.last_sync_at, t.sync_status,
      t.created_at,
      d.file_url AS document_url
    FROM lr_tracking t
    LEFT JOIN lr_documents d ON d.id = t.lr_document_id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const { rows } = await query(dataSql, params);

  res.json({
    shipments: rows,
    total,
    page: p,
    pageSize: ps,
    totalPages: Math.ceil(total / ps) || 1,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/lr/shipments/:id — Full Details, Milestones Timeline & Proofs
// ─────────────────────────────────────────────────────────────────────────────
r.get('/shipments/:id', authenticate, ah(async (req, res) => {
  const { id } = req.params;
  const { rows: [shipment] } = await query(`
    SELECT
      t.*,
      d.file_url AS document_url,
      d.original_filename,
      ed.raw_ocr_text,
      ed.ocr_confidence,
      ed.vehicle_number,
      ed.eway_bill_number,
      ti.tracking_url_template
    FROM lr_tracking t
    LEFT JOIN lr_documents d ON d.id = t.lr_document_id
    LEFT JOIN lr_extracted_details ed ON ed.lr_document_id = t.lr_document_id
    LEFT JOIN transporter_integrations ti ON ti.code = t.transporter_code
    WHERE t.id = $1
    LIMIT 1
  `, [id]);

  if (!shipment) throw notFound('Shipment record not found');

  // Timeline events
  const { rows: events } = await query(`
    SELECT id, event_time, status, location, remarks, source, created_at
    FROM lr_tracking_events
    WHERE lr_tracking_id = $1
    ORDER BY event_time ASC, created_at ASC
  `, [id]);

  // Delivery proofs
  const { rows: proofs } = await query(`
    SELECT id, proof_type, file_url, file_name, file_size, mime_type, notes, created_at
    FROM shipment_delivery_proofs
    WHERE lr_tracking_id = $1
    ORDER BY created_at DESC
  `, [id]);

  // Goods receipt records
  const { rows: receipts } = await query(`
    SELECT id, receiving_employee_name, received_at, packages_expected, packages_received,
           packages_damaged, packages_missing, condition_status, remarks, pod_number
    FROM shipment_receipts
    WHERE lr_tracking_id = $1
    ORDER BY received_at DESC
  `, [id]);

  const adapter = getTransporterAdapter(shipment.transporter_code, {
    tracking_url_template: shipment.tracking_url_template,
  });
  const liveTrackingUrl = adapter.getTrackingUrl(shipment.lr_number);

  res.json({
    shipment: {
      ...shipment,
      liveTrackingUrl,
    },
    events,
    proofs,
    receipts,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 6. POST /api/lr/shipments/:id/track — Live Transporter Tracking Execution
// ─────────────────────────────────────────────────────────────────────────────
r.post('/shipments/:id/track', authenticate, ah(async (req, res) => {
  const { id } = req.params;
  const { rows: [shipment] } = await query(
    'SELECT * FROM lr_tracking WHERE id = $1 LIMIT 1',
    [id]
  );
  if (!shipment) throw notFound('Shipment not found');

  const { rows: [transporterConfig] } = await query(
    'SELECT * FROM transporter_integrations WHERE code = $1 LIMIT 1',
    [shipment.transporter_code]
  );

  const adapter = getTransporterAdapter(shipment.transporter_code, transporterConfig || {});
  const startTime = Date.now();

  let trackResult;
  let syncStatus = 'success';
  let syncError = null;

  try {
    trackResult = await adapter.trackShipment(shipment.lr_number, shipment);
  } catch (err) {
    syncStatus = 'failed';
    syncError = err.message;
    trackResult = {
      currentStatus: shipment.current_status,
      currentLocation: shipment.current_location,
      trackingUrl: adapter.getTrackingUrl(shipment.lr_number),
      events: [],
    };
  }

  const durationMs = Date.now() - startTime;

  // Persist tracking result & new events
  await withTransaction(async (tx) => {
    await tx.query(`
      UPDATE lr_tracking
      SET current_status = ?,
          current_location = COALESCE(?, current_location),
          expected_delivery_date = COALESCE(?, expected_delivery_date),
          last_sync_at = NOW(),
          sync_status = ?,
          sync_error = ?
      WHERE id = ?
    `, [
      trackResult.currentStatus || shipment.current_status,
      trackResult.currentLocation || shipment.current_location,
      trackResult.expectedDeliveryDate || shipment.expected_delivery_date,
      syncStatus,
      syncError,
      id,
    ]);

    // Insert new events if returned by adapter
    if (Array.isArray(trackResult.events)) {
      for (const ev of trackResult.events) {
        await tx.query(`
          INSERT INTO lr_tracking_events (id, lr_tracking_id, event_time, status, location, remarks, source, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 'transporter_api', ?)
        `, [newId(), id, ev.eventTime || new Date(), ev.status, ev.location || '', ev.remarks || '', req.user.id]);
      }
    }

    // Record sync log
    await tx.query(`
      INSERT INTO shipment_sync_logs (id, lr_tracking_id, transporter_code, sync_type, status, response_payload, error_message, duration_ms)
      VALUES (?, ?, 'manual_refresh', ?, ?, ?, ?)
    `, [
      newId(), id, shipment.transporter_code, syncStatus,
      JSON.stringify(trackResult || {}), syncError, durationMs
    ]);
  });

  res.json({
    message: 'Shipment tracking updated successfully.',
    status: trackResult.currentStatus,
    currentLocation: trackResult.currentLocation,
    liveTrackingUrl: trackResult.trackingUrl,
    lastSyncAt: new Date().toISOString(),
    syncStatus,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /api/lr/shipments/:id/events — Add Manual Tracking Milestone
// ─────────────────────────────────────────────────────────────────────────────
r.post('/shipments/:id/events', authenticate, ah(async (req, res) => {
  const { id } = req.params;
  const { status, location, remarks } = req.body || {};
  if (!status || !status.trim()) throw badRequest('Status milestone is required.');

  const { rows: [shipment] } = await query('SELECT id FROM lr_tracking WHERE id = $1 LIMIT 1', [id]);
  if (!shipment) throw notFound('Shipment not found');

  const evId = newId();
  await withTransaction(async (tx) => {
    await tx.query(`
      INSERT INTO lr_tracking_events (id, lr_tracking_id, event_time, status, location, remarks, source, created_by)
      VALUES (?, ?, NOW(), ?, ?, ?, 'manual_update', ?)
    `, [evId, id, status.trim(), location || '', remarks || '', req.user.id]);

    const adapter = getTransporterAdapter();
    const normalized = adapter.normalizeStatus(status);

    await tx.query(`
      UPDATE lr_tracking
      SET current_status = ?,
          current_location = COALESCE(?, current_location),
          updated_at = NOW()
      WHERE id = ?
    `, [normalized, location || null, id]);
  });

  res.status(201).json({ message: 'Tracking event recorded.', eventId: evId });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 8. POST /api/lr/shipments/:id/receive — Store Goods Receiving & POD Upload
// ─────────────────────────────────────────────────────────────────────────────
r.post('/shipments/:id/receive', authenticate, podUpload.array('proofs', 5), ah(async (req, res) => {
  const { id } = req.params;
  const {
    packagesExpected, packagesReceived, packagesDamaged = 0, packagesMissing = 0,
    conditionStatus = 'good', remarks = '', podNumber = '', receivingEmployeeName,
  } = req.body || {};

  const { rows: [shipment] } = await query('SELECT * FROM lr_tracking WHERE id = $1 LIMIT 1', [id]);
  if (!shipment) throw notFound('Shipment not found');

  const empName = receivingEmployeeName?.trim() || req.user.fullName || req.user.username;
  const expected = parseInt(packagesExpected, 10) || shipment.package_count || 1;
  const received = parseInt(packagesReceived, 10) || expected;
  const damaged = parseInt(packagesDamaged, 10) || 0;
  const missing = parseInt(packagesMissing, 10) || 0;

  const receiptId = newId();
  const files = req.files || [];

  await withTransaction(async (tx) => {
    // 1. Record shipment receipt
    await tx.query(`
      INSERT INTO shipment_receipts (
        id, lr_tracking_id, po_id, received_by, receiving_employee_name,
        received_at, packages_expected, packages_received, packages_damaged, packages_missing,
        condition_status, remarks, pod_number
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
    `, [
      receiptId, id, shipment.po_id, req.user.id, empName,
      expected, received, damaged, missing, conditionStatus, remarks, podNumber || null
    ]);

    // 2. Save uploaded delivery proof files
    for (const f of files) {
      const proofId = newId();
      const pUrl = `/uploads/pod/${f.filename}`;
      await tx.query(`
        INSERT INTO shipment_delivery_proofs (
          id, lr_tracking_id, proof_type, file_url, file_name, file_size, mime_type, uploaded_by, notes
        ) VALUES (?, ?, 'delivery_photo', ?, ?, ?, ?, ?, ?)
      `, [proofId, id, pUrl, f.originalname, f.size, f.mimetype, req.user.id, remarks || null]);
    }

    // 3. Update shipment status (Keep transporter delivered and store received distinct)
    const storeStatus = (damaged > 0 || missing > 0 || received < expected) ? 'discrepancy' : 'received_verified';
    await tx.query(`
      UPDATE lr_tracking
      SET store_received_status = ?,
          store_received_at = NOW(),
          current_status = 'delivered',
          updated_at = NOW()
      WHERE id = ?
    `, [storeStatus, id]);

    // 4. Milestone event: Goods Received and Verified
    await tx.query(`
      INSERT INTO lr_tracking_events (id, lr_tracking_id, event_time, status, location, remarks, source, created_by)
      VALUES (?, ?, NOW(), 'Received and Verified', ?, ?, 'store_receiving', ?)
    `, [
      newId(), id, shipment.destination_store || 'Store Branch',
      `Verified by ${empName}. Received: ${received}/${expected} pkgs. Condition: ${conditionStatus}.`,
      req.user.id
    ]);

    // 5. If linked to a PO, update PO status accordingly
    if (shipment.po_id) {
      const newPoStatus = (storeStatus === 'received_verified') ? 'received' : 'partially_received';
      await tx.query(`
        UPDATE purchase_orders
        SET shipment_status = 'received',
            status = CASE WHEN status NOT IN ('closed', 'cancelled') THEN ? ELSE status END
        WHERE id = ?
      `, [newPoStatus, shipment.po_id]);
    }

    // 6. Audit log
    await tx.query(`
      INSERT INTO lr_audit_logs (id, lr_tracking_id, action_type, performed_by, details, ip_address)
      VALUES (?, ?, 'goods_received', ?, ?, ?)
    `, [
      newId(), id, req.user.id,
      JSON.stringify({ received, expected, damaged, missing, conditionStatus, empName }),
      req.ip || '127.0.0.1'
    ]);
  });

  res.status(201).json({
    message: 'Shipment goods received and verified successfully.',
    receiptId,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET /api/lr/transporters & locations
// ─────────────────────────────────────────────────────────────────────────────
r.get('/transporters', authenticate, ah(async (req, res) => {
  const { rows } = await query('SELECT code, name, tracking_url_template, is_active FROM transporter_integrations ORDER BY name ASC');
  res.json({ transporters: rows });
}));

r.get('/locations', authenticate, ah(async (req, res) => {
  const { rows } = await query('SELECT code, name, city, state, address FROM shipment_locations ORDER BY code ASC');
  res.json({ locations: rows });
}));

export default r;
