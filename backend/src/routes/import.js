import { Router } from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { query } from '../config/db.js';
import { authenticate, requireAnyPermission } from '../middleware/auth.js';
import { badRequest, notFoundError, ah } from '../utils/httpError.js';
import { logAudit } from '../utils/audit.js';
import {
  SUPPORTED_TYPES, MAX_IMPORT_MB, detectType,
  parseImportFile, totalSheetRows,
} from '../utils/importParser.js';
import {
  stageSheets, buildPreviewPayload, executeImport, cleanupTemp,
} from '../utils/importProcessor.js';
import { defaultMappingFromHeaders } from '../utils/importMapping.js';
import { upload, uploadsDir } from '../utils/storage.js';

const db = { query }; // executor shape expected by logAudit / importProcessor
// Absolute path of an import's uploaded file (stored relative to uploadsDir).
const importFilePath = (hist) => path.join(uploadsDir, hist.storage_key || '');

const r = Router();
r.use(authenticate);
r.use(requireAnyPermission(['masters.manage', 'import.manage']));

function validateUploadFile(file) {
  if (!file) throw badRequest('No file received (multipart field "file")');
  const ext = String(file.originalname || '').split('.').pop().toLowerCase();
  if (!SUPPORTED_TYPES.includes(ext)) {
    throw badRequest('Unsupported file type "' + ext + '". Accepted: ' + SUPPORTED_TYPES.join(', '));
  }
  if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
    const mb = Math.round(file.size / 1024 / 1024 * 10) / 10;
    throw badRequest('File exceeds the ' + MAX_IMPORT_MB + ' MB limit (received ' + mb + ' MB).');
  }
}

// Upload + auto-parse -> preview (no DB write)
r.post('/upload', upload.single('file'), ah(async (req, res) => {
  validateUploadFile(req.file);
  const type = detectType(req.file.originalname, req.file.mimetype);
  if (!type) throw badRequest('Could not detect a supported file type from the filename.');
  const importId = crypto.randomUUID();
  await query(
    'INSERT INTO import_history (id, file_name, file_type, file_size_bytes, uploaded_by, mime_type, storage_key, status, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())',
    [importId, req.file.originalname, type, req.file.size, req.user.id, req.file.mimetype || 'application/octet-stream',
     path.relative(uploadsDir, req.file.path).split(path.sep).join('/'), 'processing'],
  );
  let sheets, rawText = null;
  try {
    const parsed = await parseImportFile(req.file.path, type);
    sheets = parsed.sheets;
    rawText = parsed.rawText || null;
  } catch (e) {
    await query('UPDATE import_history SET status=$2, error_summary=$3, finished_at=now() WHERE id=$1', [importId, 'failed', 'Parse failed: ' + e.message]);
    throw badRequest('Could not parse the file: ' + e.message);
  }
  const totalRows = totalSheetRows(sheets);
  await query('UPDATE import_history SET rows_found=$2, parsed_at=now() WHERE id=$1', [importId, totalRows]);
  const mapping = defaultMappingFromHeaders(sheets.flatMap((s) => s.headers));
  const { records, summary, fields } = await stageSheets(db, sheets, mapping);
  const preview = buildPreviewPayload(records, mapping, summary, {
    fileName: req.file.originalname,
    fileType: type,
    fileSizeBytes: req.file.size,
    mimeType: req.file.mimetype || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
    uploader: req.user.fullName || req.user.username,
    totalRows,
    rawText: rawText ? rawText.slice(0, 8000) : null,
  }, fields);
  await query('UPDATE import_history SET status=$2, preview_ready_at=now() WHERE id=$1', [importId, 'awaiting_confirmation']);
  res.status(201).json({ data: { importId, preview } });
}));

// GET /api/import/history - list import sessions (admin-only)
r.get('/history', ah(async (req, res) => {
  const status = req.query.status;
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 200);
  const where = [];
  const params = [];
  if (status) { where.push('status = $1'); params.push(status); }
  const sql = 'SELECT ih.*, u.full_name AS uploaded_by_name FROM import_history ih LEFT JOIN users u ON u.id = ih.uploaded_by' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY ih.started_at DESC LIMIT ' + limit;
  const { rows } = await query(sql, params);
  res.json({ data: rows.map((r) => ({
    id: r.id, fileName: r.file_name, fileType: r.file_type, fileSizeBytes: r.file_size_bytes,
    uploadedBy: r.uploaded_by_name || r.uploaded_by, uploadedAt: r.started_at ? r.started_at.toISOString() : null,
    rowsFound: r.rows_found, importedCount: r.imported_count, updatedCount: r.updated_count,
    skippedCount: r.skipped_count, failedCount: r.failed_count, status: r.status,
    processingDurationMs: r.finished_at && r.started_at ? Math.round(r.finished_at - r.started_at) : null,
    errorSummary: r.error_summary,
  }))});
}));

// GET /api/import/:id - fetch preview for awaiting_confirmation import (re-stage on demand)
r.get('/:id', ah(async (req, res) => {
  const hist = (await query('SELECT * FROM import_history WHERE id=$1', [req.params.id])).rows[0];
  if (!hist) throw notFoundError('Import session not found');
  if (hist.status !== 'awaiting_confirmation') {
    throw badRequest('This import is in status "' + hist.status + '" and is not available for preview.');
  }
  const parsed = await parseImportFile(importFilePath(hist), hist.file_type);
  const mapping = defaultMappingFromHeaders(parsed.sheets.flatMap((s) => s.headers));
  const { records, summary, fields } = await stageSheets(db, parsed.sheets, mapping);
  const preview = buildPreviewPayload(records, mapping, summary, {
    fileName: hist.file_name,
    fileType: hist.file_type,
    fileSizeBytes: hist.file_size_bytes,
    mimeType: hist.mime_type || 'application/octet-stream',
    uploadedAt: hist.started_at ? hist.started_at.toISOString() : new Date().toISOString(),
    uploader: hist.uploaded_by_name || '',
    totalRows: hist.rows_found || 0,
    rawText: null,
  }, fields);
  res.json({ data: { importId: hist.id, preview } });
}));

// Re-stage custom column mappings without applying product changes.
r.post('/:id/preview', ah(async (req, res) => {
  const mapping = req.body?.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw badRequest('A field mapping is required.');
  const hist = (await query('SELECT * FROM import_history WHERE id=$1', [req.params.id])).rows[0];
  if (!hist) throw notFoundError('Import session not found');
  if (hist.status !== 'awaiting_confirmation') throw badRequest('Only imports awaiting confirmation can be previewed.');
  const parsed = await parseImportFile(importFilePath(hist), hist.file_type);
  const { records, summary, fields } = await stageSheets(db, parsed.sheets, mapping);
  const preview = buildPreviewPayload(records, mapping, summary, {
    fileName: hist.file_name, fileType: hist.file_type, fileSizeBytes: hist.file_size_bytes,
    totalRows: hist.rows_found || 0,
  }, fields);
  res.json({ data: { importId: hist.id, preview } });
}));

// POST /api/import/:id/confirm - re-validate, execute import transactionally
r.post('/:id/confirm', ah(async (req, res) => {
  const importId = req.params.id;
  const body = req.body || {};
  const mapping = body.mapping;
  if (!mapping || typeof mapping !== 'object') throw badRequest('A field mapping is required to confirm the import.');
  const hist = (await query('SELECT * FROM import_history WHERE id=$1', [importId])).rows[0];
  if (!hist) throw notFoundError('Import session not found');
  if (hist.status !== 'awaiting_confirmation') {
    throw badRequest('Import is in status "' + hist.status + '" — only awaiting_confirmation imports can be submitted.');
  }
  let sheets;
  try {
    const parsed = await parseImportFile(importFilePath(hist), hist.file_type);
    sheets = parsed.sheets;
  } catch (e) {
    throw badRequest('Re-parsing failed: ' + e.message);
  }
  const { records } = await stageSheets(db, sheets, mapping);
  const invalidRows = records.filter((r) => r.errors.length);
  if (invalidRows.length) {
    throw badRequest(invalidRows.length + ' record(s) failed backend validation and cannot be imported. Review the errors in the preview first.');
  }
  const result = await executeImport(req.user.id, importId, records);
  const status = result.failed > 0 && result.imported === 0 && result.updated === 0 ? 'failed'
    : result.failed > 0 ? 'partially_imported' : 'imported';
  await logAudit(db, { userId: req.user.id, role: req.user.roles.join(','), actionType: 'import_confirm', entityType: 'product', entityId: importId, afterValue: { imported: result.imported, updated: result.updated, failed: result.failed }, divisionId: null });
  cleanupTemp(null);
  res.json({ data: { importId, status, imported: result.imported, updated: result.updated, failed: result.failed, perRow: result.perRow.slice(0, 200) } });
}));

// GET /api/import/:id/records - per-row import result details (after confirm)
r.get('/:id/records', ah(async (req, res) => {
  const hist = (await query('SELECT * FROM import_history WHERE id=$1', [req.params.id])).rows[0];
  if (!hist) throw notFoundError('Import session not found');
  const { rows } = await query('SELECT row_index, sheet, original_values, mapped_values, operation, warnings, errors, created_at FROM import_records WHERE import_id=$1 ORDER BY row_index', [req.params.id]);
  res.json({ data: rows.map((r) => ({
    rowIndex: r.row_index, sheet: r.sheet,
    originalValues: typeof r.original_values === 'string' ? JSON.parse(r.original_values) : r.original_values,
    mappedValues: typeof r.mapped_values === 'string' ? JSON.parse(r.mapped_values) : r.mapped_values,
    operation: r.operation,
    warnings: typeof r.warnings === 'string' ? JSON.parse(r.warnings) : (r.warnings || []),
    errors: typeof r.errors === 'string' ? JSON.parse(r.errors) : (r.errors || []),
  }))});
}));

// DELETE /api/import/:id - cancel awaiting_confirmation import (no data written)
r.delete('/:id', ah(async (req, res) => {
  const hist = (await query('SELECT * FROM import_history WHERE id=$1', [req.params.id])).rows[0];
  if (!hist) throw notFoundError('Import session not found');
  if (hist.status !== 'awaiting_confirmation') {
    throw badRequest('Only "awaiting_confirmation" imports can be cancelled (this one is "' + hist.status + '").');
  }
  const cancelled = await query("UPDATE import_history SET status=$2, finished_at=now() WHERE id=$1 AND status='awaiting_confirmation'", [req.params.id, 'cancelled']);
  if (!cancelled.rowCount) throw badRequest('This import has already been processed or cancelled.');
  await logAudit(db, { userId: req.user.id, role: req.user.roles.join(','), actionType: 'import_cancel', entityType: 'product', entityId: req.params.id, afterValue: { fileName: hist.file_name } });
  res.json({ ok: true, message: 'Import cancelled — no data was saved.' });
}));

export default r;