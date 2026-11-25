import { Router } from 'express';
import { query, withTransaction, fetchById } from '../config/db.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { badRequest, ah } from '../utils/httpError.js';

const r = Router();
r.use(authenticate);

// List products with pricing info
r.get('/', requirePermission('pricing.view'), ah(async (req, res) => {
  const { page = 1, search = '', category = '', brand = '', status = '' } = req.query;
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 500);
  const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const params = [];
  const where = [];
  if (search) { params.push(`%${search}%`); where.push(`(p.name LIKE $${params.length} OR p.sku LIKE $${params.length})`); }
  if (category) { params.push(category); where.push(`p.category_id = $${params.length}`); }
  if (brand) { params.push(brand); where.push(`p.brand_id = $${params.length}`); }
  if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
  where.push(`p.gender = 'men'`);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await query(`SELECT count(*) AS total FROM products p ${w}`, params);
  params.push(Number(limit)); const lim = params.length;
  params.push(offset); const off = params.length;
  const { rows } = await query(
    `SELECT p.id, p.product_serial, p.sku, p.name, p.purchase_price, p.selling_price,
            p.profit_amount, p.profit_margin, p.status, p.updated_at,
            b.brand_name, c.name AS category_name
     FROM products p
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN categories c ON c.id = p.category_id
     ${w} ORDER BY p.name LIMIT $${lim} OFFSET $${off}`, params);
  res.json({ data: rows, total: countResult.rows[0].total, page: Number(page), limit: Number(limit) });
}));

// Update product pricing
r.patch('/:id', requirePermission('pricing.manage'), ah(async (req, res) => {
  const { purchasePrice, sellingPrice } = req.body || {};
  if (purchasePrice === undefined && sellingPrice === undefined) throw badRequest('At least one price is required');
  const { rows: existing } = await query(`SELECT * FROM products WHERE id=$1`, [req.params.id]);
  if (!existing.length) throw badRequest('Product not found');
  const newPurchase = purchasePrice !== undefined ? Number(purchasePrice) : existing[0].purchase_price;
  const newSelling = sellingPrice !== undefined ? Number(sellingPrice) : existing[0].selling_price;
  if (newPurchase < 0 || newSelling < 0) throw badRequest('Prices cannot be negative');
  await query(`UPDATE products SET purchase_price=$2, selling_price=$3, updated_at=NOW(6) WHERE id=$1`,
    [req.params.id, newPurchase, newSelling]);
  res.json({ data: await fetchById({ query }, 'products', req.params.id,
    'id, sku, name, purchase_price, selling_price, profit_amount, profit_margin') });
}));

// Bulk update pricing
r.post('/bulk', requirePermission('pricing.manage'), ah(async (req, res) => {
  const { updates } = req.body || {};
  if (!Array.isArray(updates)) throw badRequest('updates must be an array of {id, purchasePrice, sellingPrice}');
  for (const u of updates) {
    for (const v of [u.purchasePrice, u.sellingPrice]) {
      if (v !== undefined && !(Number(v) >= 0)) throw badRequest('Prices must be non-negative numbers');
    }
  }
  // One transaction: either every price in the batch is applied or none is.
  const updated = await withTransaction(async (tx) => {
    let n = 0;
    for (const u of updates) {
      if (!u.id) continue;
      const params = [u.id];
      const sets = [];
      if (u.purchasePrice !== undefined) { params.push(Number(u.purchasePrice)); sets.push(`purchase_price=$${params.length}`); }
      if (u.sellingPrice !== undefined) { params.push(Number(u.sellingPrice)); sets.push(`selling_price=$${params.length}`); }
      if (sets.length) {
        await tx.query(`UPDATE products SET ${sets.join(', ')}, updated_at=NOW(6) WHERE id=$1`, params);
        n++;
      }
    }
    return n;
  });
  res.json({ data: { updated } });
}));

// Pricing summary/stats
r.get('/stats', requirePermission('pricing.view'), ah(async (req, res) => {
  const { rows: [stats] } = await query(
    `SELECT count(*) AS total_products,
            SUM(CASE WHEN purchase_price > 0 THEN 1 ELSE 0 END) AS priced_products,
            COALESCE(sum(purchase_price), 0) AS total_purchase_value,
            COALESCE(sum(selling_price), 0) AS total_selling_value,
            COALESCE(avg(profit_margin), 0) AS avg_margin,
            COALESCE(avg(profit_amount), 0) AS avg_profit
     FROM products WHERE gender='men' AND status='active'`);
  res.json({ data: stats });
}));

export default r;
