import { Router } from 'express';
import crypto from 'node:crypto';
import { query, withTransaction, newId } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { badRequest, ah } from '../utils/httpError.js';
import { logAudit } from '../utils/audit.js';

const r = Router();
r.use(authenticate);

function trimStr(v) {
  return typeof v === 'string' ? v.trim() : v;
}

function trimOrNull(v) {
  if (typeof v !== 'string') return v ?? null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

// ---------- COLLECTIONS ----------
r.get('/collections', ah(async (req, res) => {

  const { rows } = await query(
    `SELECT c.*, (SELECT count(*) FROM brand_collections bc WHERE bc.collection_id = c.id) AS brand_count
       FROM collections c WHERE c.status <> 'archived' ORDER BY c.display_order, c.name`);
  res.json({ data: rows });
}));

r.get('/collections/mine', ah(async (req, res) => {

  if (req.user.isSuperAdmin) {
    const { rows } = await query(`SELECT * FROM collections WHERE status='active' ORDER BY display_order`);
    return res.json({ data: rows });
  }
  const { rows } = await query(
    `SELECT c.* FROM collections c JOIN user_collections uc ON uc.collection_id = c.id
      WHERE uc.user_id = $1 AND c.status = 'active' ORDER BY c.display_order`, [req.user.id]);
  res.json({ data: rows });
}));

r.post('/collections', requirePermission('collections.manage'), ah(async (req, res) => {
  const { code, name, description, displayOrder } = req.body || {};
  if (!code || !name) throw badRequest('code and name are required');


  const newCollectionId = newId();
  await query(
    `INSERT INTO collections (id, code, name, description, display_order)
     VALUES ($5, $1,$2,$3,$4)`,
    [code, name, description || null, displayOrder || 0, newCollectionId]);
  const { rows } = await query(`SELECT * FROM collections WHERE id = $1`, [newCollectionId]);
  res.status(201).json({ data: rows[0] });
}));

r.patch('/collections/:id', requirePermission('collections.manage'), ah(async (req, res) => {
  const { name, description, displayOrder, status } = req.body || {};


  await query(
    `UPDATE collections SET name=COALESCE($2,name), description=COALESCE($3,description),
            display_order=COALESCE($4,display_order), status=COALESCE($5,status) WHERE id=$1`,
    [req.params.id, name || null, description || null, displayOrder ?? null, status || null]);
  const { rows } = await query(`SELECT * FROM collections WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw badRequest('Collection not found');
  res.json({ data: rows[0] });
}));

// ---------- USER COLLECTION ACCESS ----------
r.get('/users/:id/collections', requirePermission('users.manage'), ah(async (req, res) => {

  const { rows } = await query(
    `SELECT collection_id FROM user_collections WHERE user_id = $1`, [req.params.id]);
  res.json({ data: rows.map((r) => r.collection_id) });
}));

r.put('/users/:id/collections', requirePermission('users.manage'), ah(async (req, res) => {
  const { collectionIds } = req.body || {};
  if (!Array.isArray(collectionIds)) throw badRequest('collectionIds must be an array');


  await withTransaction(async (client) => {
    await client.query(`DELETE FROM user_collections WHERE user_id = $1`, [req.params.id]);
    for (const cid of collectionIds) {
      await client.query(`INSERT INTO user_collections (user_id, collection_id) VALUES ($1,$2)`, [req.params.id, cid]);
    }
  });
  res.json({ ok: true });
}));

// ---------- BRAND ↔ COLLECTION ----------
r.get('/brands/:id/collections', requirePermission('collections.manage'), ah(async (req, res) => {

  const { rows } = await query(`SELECT collection_id FROM brand_collections WHERE brand_id = $1`, [req.params.id]);
  res.json({ data: rows.map((r) => r.collection_id) });
}));

r.put('/brands/:id/collections', requirePermission('collections.manage'), ah(async (req, res) => {
  const { collectionIds } = req.body || {};
  if (!Array.isArray(collectionIds)) throw badRequest('collectionIds must be an array');


  await withTransaction(async (client) => {
    await client.query(`DELETE FROM brand_collections WHERE brand_id = $1`, [req.params.id]);
    for (const cid of collectionIds) {
      await client.query(`INSERT INTO brand_collections (brand_id, collection_id) VALUES ($1,$2)`, [req.params.id, cid]);
    }
  });
  res.json({ ok: true });
}));

// ---------- DEALERS ----------
r.get('/dealers', ah(async (req, res) => {
  const { search } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit || req.query.pageSize, 10) || 50));
  const offset = (page - 1) * limit;


  const params = []; const clauses = [`d.status <> 'archived'`];
  if (search) { params.push(`%${search}%`); clauses.push(`(d.company_name LIKE $${params.length} OR d.code LIKE $${params.length})`); }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT d.* FROM dealers d WHERE ${clauses.join(' AND ')} ORDER BY d.company_name LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const { rows: [{ count }] } = await query(`SELECT count(*) AS count FROM dealers d WHERE ${clauses.join(' AND ')}`, params.slice(0, -2));
  res.json({ data: rows, total: count, page, limit });
}));

r.post('/dealers', requirePermission('dealers.manage'), ah(async (req, res) => {
  const { code, companyName, contactPerson, phone, email, address, city, state, gstin, pan, paymentTerms, notes } = req.body || {};
  if (!code || !companyName) throw badRequest('code and companyName are required');


  const newDealerId = newId();
  await query(
    `INSERT INTO dealers (id, code, company_name, contact_person, phone, email, address, city, state, gstin, pan, payment_terms, notes)
     VALUES ($13, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [code, companyName, contactPerson || null, phone || null, email || null, address || null, city || null, state || null, gstin || null, pan || null, paymentTerms || 'net_30', notes || null, newDealerId]);
  const { rows } = await query(`SELECT * FROM dealers WHERE id = $1`, [newDealerId]);
  res.status(201).json({ data: rows[0] });
}));

r.patch('/dealers/:id', requirePermission('dealers.manage'), ah(async (req, res) => {
  const { companyName, contactPerson, phone, email, address, city, state, gstin, pan, paymentTerms, notes, status } = req.body || {};


  await query(
    `UPDATE dealers SET company_name=COALESCE($2,company_name), contact_person=COALESCE($3,contact_person),
            phone=COALESCE($4,phone), email=COALESCE($5,email), address=COALESCE($6,address),
            city=COALESCE($7,city), state=COALESCE($8,state), gstin=COALESCE($9,gstin),
            pan=COALESCE($10,pan), payment_terms=COALESCE($11,payment_terms),
            notes=COALESCE($12,notes), status=COALESCE($13,status) WHERE id=$1`,
    [req.params.id, companyName || null, contactPerson || null, phone || null, email || null, address || null, city || null, state || null, gstin || null, pan || null, paymentTerms || null, notes || null, status || null]);
  const { rows } = await query(`SELECT * FROM dealers WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw badRequest('Dealer not found');
  res.json({ data: rows[0] });
}));

r.delete('/dealers/:id', requirePermission('dealers.manage'), ah(async (req, res) => {

  await query(
    `UPDATE dealers SET status='archived' WHERE id=$1`,
    [req.params.id]);
  const { rows } = await query(`SELECT id FROM dealers WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw badRequest('Dealer not found');
  res.status(204).end();
}));

// ---------- COMPANY SETTINGS ----------
r.get('/company', ah(async (req, res) => {

  const { rows } = await query(`SELECT * FROM company_settings LIMIT 1`);
  res.json({ data: rows[0] || null });
}));

r.put('/company', requirePermission('company.manage'), ah(async (req, res) => {
  const { companyName, logoUrl, address, city, state, pinCode, phone, email, gstNumber, website } = req.body || {};


  const existing = (await query(`SELECT id FROM company_settings LIMIT 1`)).rows[0];
  if (existing) {
    await query(
      `UPDATE company_settings SET company_name=COALESCE($2,company_name), logo_url=COALESCE($3,logo_url),
              address=COALESCE($4,address), city=COALESCE($5,city), state=COALESCE($6,state),
              pin_code=COALESCE($7,pin_code), phone=COALESCE($8,phone), email=COALESCE($9,email),
              gst_number=COALESCE($10,gst_number), website=COALESCE($11,website) WHERE id=$1`,
      [existing.id, companyName || null, logoUrl || null, address || null, city || null, state || null, pinCode || null, phone || null, email || null, gstNumber || null, website || null]);
    const { rows } = await query(`SELECT * FROM company_settings WHERE id = $1`, [existing.id]);
    res.json({ data: rows[0] });
  } else {
    const newCompanySettingId = newId();
    await query(
      `INSERT INTO company_settings (id, company_name, logo_url, address, city, state, pin_code, phone, email, gst_number, website)
       VALUES ($11, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [companyName || 'BSC Exclusive', logoUrl || null, address || null, city || null, state || null, pinCode || null, phone || null, email || null, gstNumber || null, website || null, newCompanySettingId]);
    const { rows } = await query(`SELECT * FROM company_settings WHERE id = $1`, [newCompanySettingId]);
    res.status(201).json({ data: rows[0] });
  }
}));

export default r;
