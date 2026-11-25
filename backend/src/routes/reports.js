import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { badRequest, ah } from '../utils/httpError.js';

// Dashboards, reporting and analytics — FRS §16, RB-018 (no cross-division leakage).
const r = Router();
r.use(authenticate, requirePermission('reports.view'));

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Location codes used by the header dropdown that differ from the division code.
const LOCATION_CODE_ALIASES = { BGV: 'BLG' };
const escapeLike = (v) => v.replace(/[\\%_]/g, (c) => '\\' + c);

// Resolve the dashboard ?location= (division UUID, code, or name) to division IDs.
// null = no location filter. An unknown location matches nothing (never "everything").
async function resolveLocationDivisionIds(req) {
  const locParam = req.query.location || req.query.locationId || req.query.divisionId || req.query.location_id || req.query.division_id;
  if (!locParam) return null;
  const str = String(locParam).trim();
  if (!str || str.toLowerCase().includes('all location') || str.toLowerCase() === 'all') return null;
  if (UUID_RE.test(str)) return [str];

  const code = LOCATION_CODE_ALIASES[str.toUpperCase()] || str;
  // "Davangere" vs "Davanagere": tolerate the optional 'a' before 'g'.
  const fuzzy = `%${escapeLike(str).replace(/an?g/i, 'a%g')}%`;
  const { rows } = await query(
    `SELECT id FROM divisions WHERE code = $1 OR name LIKE $2 OR location LIKE $2`, [code, fuzzy]);
  return rows.length ? rows.map((r) => r.id) : [NIL_UUID];
}

// Divisions this request may see: the requested location intersected with the
// user's assigned divisions (RB-001). null = all divisions (super admin, no filter).
async function effectiveDivisionIds(req) {
  const locDivIds = await resolveLocationDivisionIds(req);
  if (req.user.isSuperAdmin) return locDivIds;
  const mine = (req.user.divisionIds || []).map(String);
  return locDivIds ? locDivIds.filter((id) => mine.includes(String(id))) : mine;
}

// Dashboard scoping: division scope (RB-001) AND collection scope. A user
// assigned only the Men's collection sees Men's numbers only — no leakage,
// including through ?sectionId=.
async function poScope(req) {
  const clauses = [];
  const params = [];
  const divIds = await effectiveDivisionIds(req);
  if (divIds) {
    params.push(divIds); // [] binds as NULL → matches nothing
    clauses.push(`po.division_id IN ($${params.length})`);
  }

  const mySections = req.user.isSuperAdmin ? [] : (req.user.sectionIds || []).map(String);
  if (req.query.sectionId) {
    const wanted = String(req.query.sectionId);
    params.push(mySections.length && !mySections.includes(wanted) ? NIL_UUID : wanted);
    clauses.push(`po.section_id = $${params.length}`);
  } else if (mySections.length) {
    params.push(mySections);
    clauses.push(`po.section_id IN ($${params.length})`);
  }
  return { params, W: clauses.length ? clauses.join(' AND ') : 'TRUE', divIds };
}

// GET /api/reports/dashboard — §16.1 / §16.2 combined dashboard payload
r.get('/dashboard', ah(async (req, res) => {
  const { params, W, divIds } = await poScope(req);
  const auditAll = divIds === null;
  const auditDivIds = divIds || [];

  const kpis = (await query(
    `SELECT count(*) AS total_pos,
            COALESCE(SUM(po.grand_total),0) AS total_value,
            COALESCE(SUM(po.order_discount_amount),0) AS total_discount,
            SUM(CASE WHEN po.status IN ('submitted','under_review') THEN 1 ELSE 0 END) AS pending_approvals,
            SUM(CASE WHEN po.status = 'approved' THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN po.status = 'issued' THEN 1 ELSE 0 END) AS issued,
            SUM(CASE WHEN po.status = 'partially_received' THEN 1 ELSE 0 END) AS partially_received,
            SUM(CASE WHEN po.status IN ('received','closed') THEN 1 ELSE 0 END) AS completed
       FROM purchase_orders po WHERE ${W}`, params)).rows[0];

  const byDivision = (await query(
    `SELECT d.name, d.code, count(*) AS pos, COALESCE(SUM(po.grand_total),0) AS value
       FROM purchase_orders po JOIN divisions d ON d.id = po.division_id
      WHERE ${W} GROUP BY d.name, d.code ORDER BY value DESC`, params)).rows;

  const byStatus = (await query(
    `SELECT po.status, count(*) AS count, COALESCE(SUM(po.grand_total),0) AS value
       FROM purchase_orders po WHERE ${W} GROUP BY po.status ORDER BY count DESC`, params)).rows;

  const bySection = (await query(
    `SELECT s.name AS section, dep.name AS department, count(*) AS pos,
            COALESCE(SUM(po.grand_total),0) AS value,
            COALESCE(SUM(po.grand_total - po.subtotal + po.order_discount_amount),0) AS approx_margin_value
       FROM purchase_orders po JOIN sections s ON s.id = po.section_id JOIN departments dep ON dep.id = po.department_id
      WHERE ${W} GROUP BY s.name, dep.name ORDER BY value DESC LIMIT 12`, params)).rows;

  const bySupplier = (await query(
    `SELECT sup.company_name, count(*) AS pos, COALESCE(SUM(po.grand_total),0) AS value
       FROM purchase_orders po JOIN suppliers sup ON sup.id = po.supplier_id
      WHERE ${W} GROUP BY sup.company_name ORDER BY value DESC LIMIT 10`, params)).rows;

  const recentAudit = (await query(
    `SELECT al.occurred_at, al.action_type, al.entity_type, al.entity_id, COALESCE(u.full_name,'System') AS actor
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
      WHERE (${auditAll ? 'TRUE' : 'al.division_id IN ($1)'} OR al.division_id IS NULL)
      ORDER BY al.occurred_at DESC LIMIT 12`, auditAll ? [] : [auditDivIds])).rows;

  const divisionAdmins = (await query(
    `SELECT d.id AS division_id, d.code AS division_code, d.name AS division_name,
            (SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', u.id, 'name', u.full_name, 'email', u.email, 'photo', u.profile_photo_url)), JSON_ARRAY())
               FROM users u
              WHERE u.status = 'active'
                AND EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.user_id = u.id AND ud.division_id = d.id)
                AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                             WHERE ur.user_id = u.id AND r.code = 'domain_admin')) AS admins
       FROM divisions d
      WHERE d.status <> 'archived' ${auditAll ? '' : 'AND d.id IN ($1)'}
      ORDER BY d.code`, auditAll ? [] : [auditDivIds])).rows;

  // Real monthly series — last 12 months, scoped, zero-filled (no synthetic data).
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

  const monthlyAgg = (await query(
    `SELECT DATE_FORMAT(po.po_date, '%Y-%m') AS ym,
            count(*) AS orders,
            COALESCE(SUM(po.grand_total),0) AS value
       FROM purchase_orders po
      WHERE ${W} AND po.po_date >= $${params.length + 1}
      GROUP BY ym`, [...params, cutoff])).rows;

  const aggMap = new Map(monthlyAgg.map((r) => [r.ym, r]));
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = months[d.getMonth()];
    const hit = aggMap.get(key);
    monthly.push({
      label,
      key,
      orders: Number(hit?.orders || 0),
      value: Number(hit?.value || 0),
    });
  }

  // Real recent purchase orders for the dashboard table.
  const recentPOs = (await query(
    `SELECT po.id, po.po_number, po.po_date, po.status, po.grand_total,
            s.name AS section_name, sup.company_name AS supplier_name, d.name AS division_name,
            (SELECT COALESCE(SUM(total_quantity),0) FROM purchase_order_items i WHERE i.po_id = po.id) AS total_quantity
       FROM purchase_orders po
       JOIN divisions d ON d.id = po.division_id
       JOIN sections s ON s.id = po.section_id
       JOIN suppliers sup ON sup.id = po.supplier_id
      WHERE ${W}
      ORDER BY po.created_at DESC LIMIT 8`, params)).rows;

  // Work progress — share of orders that reached completion, plus stage split.
  const workProgress = (await query(
    `SELECT count(*) AS total,
            SUM(CASE WHEN po.status IN ('received','closed') THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN po.status = 'partially_received' THEN 1 ELSE 0 END) AS partially_received,
            SUM(CASE WHEN po.status IN ('approved','issued') THEN 1 ELSE 0 END) AS approved_issued,
            SUM(CASE WHEN po.status IN ('submitted','under_review') THEN 1 ELSE 0 END) AS in_approval,
            SUM(CASE WHEN po.status = 'draft' THEN 1 ELSE 0 END) AS drafts,
            SUM(CASE WHEN po.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
       FROM purchase_orders po WHERE ${W}`, params)).rows[0];

  // Names of the collections this user is authorized for (header chips).
  const mySections = req.user.isSuperAdmin ? [] : (await query(
    `SELECT s.id, s.name FROM sections s JOIN user_sections us ON us.section_id = s.id
      WHERE us.user_id = $1 ORDER BY s.name`, [req.user.id])).rows;

  res.json({ kpis, byDivision, byStatus, bySection, bySupplier, recentAudit, divisionAdmins, monthly, recentPOs, workProgress, mySections });
}));

// GET /api/reports/men-summary — restricted Division Supervisor summary (RB-018).
// Shows ONLY: net purchase margin, total quantity purchased, discount and the
// individual selling price of each item — scoped to the user's own sections.
r.get('/men-summary', ah(async (req, res) => {
  if (req.user.isSuperAdmin) throw badRequest('Supervisor summary is for section-scoped users');
  const { params, W } = await poScope(req);
  const totals = (await query(
    `SELECT COALESCE(SUM(i.total_quantity),0) AS total_quantity,
            COALESCE(SUM((i.net_value_per_unit - i.purchase_price) * i.total_quantity),0) AS net_purchase_margin,
            COALESCE(SUM(i.discount_amount * i.total_quantity),0) AS total_discount,
            COALESCE(SUM(i.line_total),0) AS purchase_value
       FROM purchase_order_items i
       JOIN purchase_orders po ON po.id = i.po_id
      WHERE ${W}`, params)).rows[0];
  const sellingPrices = (await query(
    `SELECT i.product_snapshot->>'$.name' AS product_name,
            i.product_snapshot->>'$.sku' AS sku,
            i.brand_snapshot->>'$.brand_name' AS brand_name,
            i.colour_snapshot->>'$.name' AS colour_name,
            i.purchase_price, i.margin_percent, i.net_value_per_unit,
            i.discount_amount, i.final_value_per_unit,
            i.total_quantity, i.line_total
       FROM purchase_order_items i
       JOIN purchase_orders po ON po.id = i.po_id
      WHERE ${W}
      ORDER BY po.created_at DESC LIMIT 50`, params)).rows;
  res.json({ totals, sellingPrices });
}));

// GET /api/reports/brand-wise — Brand-wise PO aggregation dashboard
// Returns: brand name, total POs, total quantity, total value, pending/approved/rejected/received counts, pending approval value
r.get('/brand-wise', ah(async (req, res) => {
  const { params, W, divIds } = await poScope(req);
  const auditAll = divIds === null;

  // Brand-wise aggregation from PO items joined with brands
  const brandStats = (await query(
    `SELECT b.id AS brand_id, b.brand_name, b.brand_number,
            COUNT(DISTINCT po.id) AS total_pos,
            COALESCE(SUM(i.total_quantity), 0) AS total_quantity,
            COALESCE(SUM(i.line_total), 0) AS total_value,
            SUM(CASE WHEN po.status IN ('submitted', 'under_review') THEN 1 ELSE 0 END) AS pending_approvals,
            SUM(CASE WHEN po.status = 'approved' THEN 1 ELSE 0 END) AS approved_pos,
            SUM(CASE WHEN po.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_pos,
            SUM(CASE WHEN po.status IN ('received', 'closed') THEN 1 ELSE 0 END) AS received_pos,
            SUM(CASE WHEN po.status IN ('issued', 'partially_received') THEN 1 ELSE 0 END) AS in_progress_pos,
            SUM(CASE WHEN po.status = 'draft' THEN 1 ELSE 0 END) AS draft_pos,
            COALESCE(SUM(CASE WHEN po.status IN ('submitted', 'under_review') THEN po.grand_total ELSE 0 END), 0) AS pending_approval_value
       FROM purchase_order_items i
       JOIN purchase_orders po ON po.id = i.po_id
       JOIN products p ON p.id = i.product_id
       JOIN brands b ON b.id = p.brand_id
      WHERE ${W}
      GROUP BY b.id, b.brand_name, b.brand_number
      ORDER BY total_value DESC`, params)).rows;

  // Overall totals across all brands
  const overall = (await query(
    `SELECT COUNT(DISTINCT po.id) AS total_pos,
            COALESCE(SUM(i.total_quantity), 0) AS total_quantity,
            COALESCE(SUM(i.line_total), 0) AS total_value,
            SUM(CASE WHEN po.status IN ('submitted', 'under_review') THEN 1 ELSE 0 END) AS pending_approvals,
            SUM(CASE WHEN po.status = 'approved' THEN 1 ELSE 0 END) AS approved_pos,
            SUM(CASE WHEN po.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_pos,
            SUM(CASE WHEN po.status IN ('received', 'closed') THEN 1 ELSE 0 END) AS received_pos,
            SUM(CASE WHEN po.status IN ('issued', 'partially_received') THEN 1 ELSE 0 END) AS in_progress_pos,
            SUM(CASE WHEN po.status = 'draft' THEN 1 ELSE 0 END) AS draft_pos,
            COALESCE(SUM(CASE WHEN po.status IN ('submitted', 'under_review') THEN po.grand_total ELSE 0 END), 0) AS pending_approval_value
       FROM purchase_order_items i
       JOIN purchase_orders po ON po.id = i.po_id
       JOIN products p ON p.id = i.product_id
       JOIN brands b ON b.id = p.brand_id
      WHERE ${W}`, params)).rows[0];

  // CSV export support
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="brand_wise_po_${new Date().toISOString().slice(0, 10)}.csv"`);
    
    const esc = (v) => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const L = [];
    
    // Title block
    L.push(['BSC EXCLUSIVE — PURCHASE ORDER MANAGEMENT SYSTEM'].map(esc).join(','));
    L.push(['Brand-wise Purchase Order Aggregation'].map(esc).join(','));
    L.push([`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`].map(esc).join(','));
    L.push([''].map(esc).join(','));
    
    // Overall summary
    L.push(['OVERALL SUMMARY'].map(esc).join(','));
    L.push(['Metric', 'Value'].map(esc).join(','));
    L.push(['Total Brands with POs', String(brandStats.length)].map(esc).join(','));
    L.push(['Total Purchase Orders', String(overall.total_pos || 0)].map(esc).join(','));
    L.push(['Total Quantity', String(overall.total_quantity || 0)].map(esc).join(','));
    L.push(['Total Value', String(overall.total_value || 0)].map(esc).join(','));
    L.push(['Pending Approvals', String(overall.pending_approvals || 0)].map(esc).join(','));
    L.push(['Pending Approval Value', String(overall.pending_approval_value || 0)].map(esc).join(','));
    L.push(['Approved POs', String(overall.approved_pos || 0)].map(esc).join(','));
    L.push(['Rejected POs', String(overall.rejected_pos || 0)].map(esc).join(','));
    L.push(['Received/Closed POs', String(overall.received_pos || 0)].map(esc).join(','));
    L.push(['In Progress POs', String(overall.in_progress_pos || 0)].map(esc).join(','));
    L.push(['Draft POs', String(overall.draft_pos || 0)].map(esc).join(','));
    L.push([''].map(esc).join(','));
    
    // Brand-wise detail
    L.push(['BRAND-WISE DETAIL'].map(esc).join(','));
    const brandCols = ['Brand Name', 'Brand Number', 'Total POs', 'Total Quantity', 'Total Value', 'Pending Approvals', 'Approved', 'Rejected', 'Received/Closed', 'In Progress', 'Draft', 'Pending Approval Value'];
    L.push(brandCols.map(esc).join(','));
    
    brandStats.forEach(b => {
      L.push([
        esc(b.brand_name),
        esc(b.brand_number),
        String(b.total_pos || 0),
        String(b.total_quantity || 0),
        String(b.total_value || 0),
        String(b.pending_approvals || 0),
        String(b.approved_pos || 0),
        String(b.rejected_pos || 0),
        String(b.received_pos || 0),
        String(b.in_progress_pos || 0),
        String(b.draft_pos || 0),
        String(b.pending_approval_value || 0)
      ].map(esc).join(','));
    });
    
    return res.send(L.join('\n'));
  }
  
  res.json({ overall, brands: brandStats });
}));

// GET /api/reports/brand-wise/:brandId — POs for a specific brand (drill-down)
r.get('/brand-wise/:brandId', ah(async (req, res) => {
  const { params, W, divIds } = await poScope(req);
  const brandId = req.params.brandId;

  // Verify brand exists
  const { rows: [brand] } = await query(`SELECT id, brand_name, brand_number FROM brands WHERE id = $1`, [brandId]);
  if (!brand) throw badRequest('Brand not found');

  // Get all POs that have items from this brand
  // Use a subquery to avoid DISTINCT + ORDER BY issues
  const pos = (await query(
    `SELECT po.id, po.po_number, po.po_date, po.status, po.version, po.grand_total, po.created_at,
            d.name AS division_name, s.name AS section_name, sup.company_name AS supplier_name,
            (SELECT COALESCE(SUM(i2.total_quantity), 0) FROM purchase_order_items i2 WHERE i2.po_id = po.id) AS total_quantity,
            (SELECT COALESCE(SUM(i2.line_total), 0) FROM purchase_order_items i2 WHERE i2.po_id = po.id AND i2.product_id IN (SELECT id FROM products WHERE brand_id = $2)) AS brand_quantity,
            (SELECT COALESCE(SUM(i2.line_total), 0) FROM purchase_order_items i2 WHERE i2.po_id = po.id AND i2.product_id IN (SELECT id FROM products WHERE brand_id = $2)) AS brand_value
       FROM purchase_orders po
       JOIN divisions d ON d.id = po.division_id
       JOIN sections s ON s.id = po.section_id
       JOIN suppliers sup ON sup.id = po.supplier_id
      WHERE ${W} AND EXISTS (
        SELECT 1 FROM purchase_order_items i
        JOIN products p ON p.id = i.product_id
        WHERE i.po_id = po.id AND p.brand_id = $2
      )
      ORDER BY po.created_at DESC`, [...params, brandId])).rows;

  res.json({ brand, pos });
}));

// ---------- PO CALENDAR (§16 + day-wise drill-down) ----------
// GET /api/reports/calendar?year=2026&month=9 → per-day PO counts + values
r.get('/calendar', ah(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || (now.getMonth() + 1); // 1-12
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const params = [from, to];
  const W = req.user.isSuperAdmin ? 'TRUE' : 'po.division_id IN ($3)';
  if (!req.user.isSuperAdmin) params.push(req.user.divisionIds);
  const days = (await query(
    `SELECT DATE_FORMAT(po.po_date, '%Y-%m-%d') AS day, count(*) AS count, COALESCE(SUM(po.grand_total),0) AS value,
            SUM(CASE WHEN po.status IN ('submitted','under_review') THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN po.status IN ('received','closed','partially_received') THEN 1 ELSE 0 END) AS received
       FROM purchase_orders po
      WHERE po.po_date >= $1 AND po.po_date < $2 AND ${W}
      GROUP BY po.po_date ORDER BY po.po_date`, params)).rows;
  res.json({ year, month, days });
}));

// GET /api/reports/calendar/2026-09-07 → every PO created that day (division-scoped)
r.get('/calendar/:date', ah(async (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) throw badRequest('date must be YYYY-MM-DD');
  const params = [req.params.date];
  const W = req.user.isSuperAdmin ? 'TRUE' : 'po.division_id IN ($2)';
  if (!req.user.isSuperAdmin) params.push(req.user.divisionIds);
  const { rows } = await query(
    `SELECT po.id, po.po_number, po.po_date, po.status, po.version, po.grand_total,
            d.name AS division, s.name AS section, sup.company_name AS supplier,
            (SELECT count(*) FROM attachments a WHERE a.entity_type='purchase_order' AND a.entity_id=po.id) AS attachment_count
       FROM purchase_orders po
       JOIN divisions d ON d.id = po.division_id
       JOIN sections s ON s.id = po.section_id
       JOIN suppliers sup ON sup.id = po.supplier_id
      WHERE po.po_date = $1 AND ${W}
      ORDER BY po.grand_total DESC`, params);
  const params2 = [req.params.date];
  const W2 = req.user.isSuperAdmin ? 'TRUE' : 'po.division_id IN ($2)';
  if (!req.user.isSuperAdmin) params2.push(req.user.divisionIds);
  const { rows: [totals] } = await query(
    `SELECT count(*) AS count, COALESCE(SUM(po.grand_total),0) AS value
       FROM purchase_orders po
      WHERE po.po_date = $1 AND ${W2}`, params2);
  res.json({ date: req.params.date, totals, data: rows });
}));

// GET /api/reports/:name?format=csv — §16.3 reports catalogue + CSV export
r.get('/:name', ah(async (req, res) => {
  const { name } = req.params;
  const { from, to, divisionId } = req.query;
  const params = [];
  const clauses = [];
  if (!req.user.isSuperAdmin) { params.push(req.user.divisionIds); clauses.push(`po.division_id IN ($${params.length})`); }
  if (divisionId) { params.push(divisionId); clauses.push(`po.division_id = $${params.length}`); }
  if (from) { params.push(from); clauses.push(`po.po_date >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`po.po_date <= $${params.length}`); }
  const W = clauses.length ? 'AND ' + clauses.join(' AND ') : '';

  const reports = {
    'po-register': `SELECT po.po_number, po.po_date, d.name AS division, s.name AS section, sup.company_name AS supplier, po.status, po.version, po.grand_total
                      FROM purchase_orders po JOIN divisions d ON d.id=po.division_id JOIN sections s ON s.id=po.section_id JOIN suppliers sup ON sup.id=po.supplier_id
                     WHERE TRUE ${W} ORDER BY po.po_date DESC`,
    'purchase-summary': `SELECT d.name AS division, dep.name AS department, s.name AS section, count(*) AS pos, COALESCE(SUM(po.subtotal),0) AS subtotal, COALESCE(SUM(po.tax_amount),0) AS tax, COALESCE(SUM(po.charges_amount),0) AS charges, COALESCE(SUM(po.grand_total),0) AS grand_total
                      FROM purchase_orders po JOIN divisions d ON d.id=po.division_id JOIN departments dep ON dep.id=po.department_id JOIN sections s ON s.id=po.section_id
                     WHERE TRUE ${W} GROUP BY d.name, dep.name, s.name ORDER BY d.name, s.name`,
    'dealer': `SELECT sup.company_name AS dealer, d.name AS division, count(*) AS pos, COALESCE(SUM(po.grand_total),0) AS ordered_value
                      FROM purchase_orders po JOIN suppliers sup ON sup.id=po.supplier_id JOIN divisions d ON d.id=po.division_id
                     WHERE TRUE ${W} GROUP BY sup.company_name, d.name ORDER BY ordered_value DESC`,
    'size': `SELECT p.sku, p.name AS product, COALESCE(z.label,'—') AS size, SUM(q.quantity) AS qty
                      FROM purchase_order_quantities q
                      JOIN purchase_order_items i ON i.id = q.po_item_id
                      JOIN purchase_orders po ON po.id = i.po_id
                      JOIN products p ON p.id = i.product_id
                      LEFT JOIN sizes z ON z.id = q.size_id
                     WHERE TRUE ${W} GROUP BY p.sku, p.name, z.label ORDER BY p.sku, z.label`,
    'margin': `SELECT p.name AS product, s.name AS section, d.name AS division,
                      SUM(i.total_quantity) AS qty,
                      ROUND(AVG(i.purchase_price),2) AS avg_purchase_price,
                      ROUND(AVG(i.net_value_per_unit - i.purchase_price),2) AS avg_margin_per_unit,
                      ROUND(100.0 * AVG(i.margin_percent),2) AS avg_margin_percent
                      FROM purchase_order_items i
                      JOIN purchase_orders po ON po.id = i.po_id
                      JOIN products p ON p.id = i.product_id
                      JOIN sections s ON s.id = po.section_id
                      JOIN divisions d ON d.id = po.division_id
                     WHERE TRUE ${W} GROUP BY p.name, s.name, d.name ORDER BY avg_margin_percent DESC`,
    'receiving': `SELECT po.po_number, sup.company_name AS supplier, i.line_no, p.sku, i.total_quantity AS ordered,
                         COALESCE(SUM(CASE WHEN rc.status='posted' THEN ri.accepted_qty ELSE 0 END),0) AS accepted,
                         (i.total_quantity - COALESCE(SUM(CASE WHEN rc.status='posted' THEN ri.accepted_qty ELSE 0 END),0)) AS pending
                      FROM purchase_orders po
                      JOIN suppliers sup ON sup.id = po.supplier_id
                      JOIN purchase_order_items i ON i.po_id = po.id
                      JOIN products p ON p.id = i.product_id
                      LEFT JOIN receipt_items ri ON ri.po_item_id = i.id
                      LEFT JOIN receipts rc ON rc.id = ri.receipt_id
                     WHERE TRUE ${W}
                     GROUP BY po.po_number, sup.company_name, i.line_no, p.sku, i.total_quantity
                     ORDER BY po.po_number, i.line_no`,
  };
  const sql = reports[name];
  if (!sql) throw badRequest(`Unknown report "${name}". Available: ${Object.keys(reports).join(', ')}`);
  const { rows } = await query(sql, params);

  if (req.query.format === 'csv') {
    // Report-style CSV: title block → data table → OVERALL SUMMARY block, so the
    // downloaded file opens in Excel exactly like a formatted report (§16.3).
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
    const esc = (v) => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
    // Properly formatted dates — no raw ISO/UTC "star" timestamps in downloads.
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDate = (v) => {
      if (v === null || v === undefined || v === '') return '';
      const d = new Date(v);
      if (isNaN(d.getTime())) return v;
      // Prefix with \t and wrap in quotes to force Excel to treat as text
      return `\t"${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}"`;
    };
    const isDateCol = (c) => /(^|_)(date|at)$/i.test(c) || /date/i.test(c);
    const fmtVal = (c, v) => (isDateCol(c) ? fmtDate(v) : v);
    const L = [];
    const REPORT_LABELS = {
      'po-register': 'Purchase Order Register',
      'purchase-summary': 'Purchase Summary by Division / Department / Section',
      'dealer': 'Dealer-wise Order Report',
      'size': 'Size-wise Quantity Report',
      'margin': 'Product Margin Report',
      'receiving': 'Goods Receiving / Pending Report',
    };
    // ── Title block ──
    L.push(['BSC EXCLUSIVE — PURCHASE ORDER MANAGEMENT SYSTEM'].map(esc).join(','));
    L.push([REPORT_LABELS[name] || name].map(esc).join(','));
    L.push([`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`].map(esc).join(','));
    const rangeLabel = from || to ? `Date Range: ${from || 'Start'} to ${to || 'Today'}${divisionId ? ` | Division: ${divisionId}` : ''}` : 'Date Range: All records';
    L.push([rangeLabel].map(esc).join(','));
    L.push('');
    if (!rows.length) {
      L.push(['No records found for the selected filters.'].map(esc).join(','));
      return res.send(L.join('\n'));
    }
    // ── Data table ──
    const cols = Object.keys(rows[0]);
    const numCols = cols.filter((c) => rows.every((r2) => r2[c] === null || typeof r2[c] === 'number'));
    L.push(cols.map((c) => esc(c.replace(/_/g, ' ').toUpperCase())).join(','));
    rows.forEach((r2) => L.push(cols.map((c) => esc(fmtVal(c, r2[c]))).join(',')));
    // ── OVERALL SUMMARY block ──
    L.push('');
    L.push(['OVERALL SUMMARY'].map(esc).join(','));
    L.push(['Total Records', rows.length].map(esc).join(','));
    const fmt = (n) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2));
    numCols.forEach((c) => {
      const sum = rows.reduce((a, r2) => a + (Number(r2[c]) || 0), 0);
      L.push([`Total ${c.replace(/_/g, ' ')}`, fmt(sum)].map(esc).join(','));
    });
    return res.send(L.join('\n'));
  }
  res.json({ name, columns: rows.length ? Object.keys(rows[0]) : [], data: rows });
}));

export default r;
