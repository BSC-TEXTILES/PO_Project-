import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { ah } from '../utils/httpError.js';

const r = Router();
r.use(authenticate);

// Search must never disclose records that the corresponding module cannot show.
r.get('/search', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  const out = { purchaseOrders: [], products: [], suppliers: [], users: [] };
  if (q.length < 2) return res.json({ data: out });
  const like = `%${q}%`;
  const user = req.user;
  const can = (...codes) => user.isSuperAdmin || codes.some(code => user.permissions?.includes(code));
  const tasks = [];
  if (can('po.view')) {
    const params = [like];
    const scope = [];
    if (!user.isSuperAdmin) {
      params.push(user.divisionIds || []);
      scope.push(`po.division_id IN ($${params.length})`);
      if (user.sectionIds?.length) {
        params.push(user.sectionIds);
        scope.push(`po.section_id IN ($${params.length})`);
      }
    }
    tasks.push(query(`SELECT po.id, po.po_number, po.status, po.grand_total, d.name AS division, sup.company_name AS supplier
      FROM purchase_orders po JOIN divisions d ON d.id = po.division_id JOIN suppliers sup ON sup.id = po.supplier_id
      WHERE (po.po_number LIKE $1 OR sup.company_name LIKE $1) ${scope.length ? `AND ${scope.join(' AND ')}` : ''}
      ORDER BY po.po_date DESC LIMIT 6`, params).then(result => { out.purchaseOrders = result.rows; }));
  }
  if (can('products.view', 'catalogue.view')) {
    const scoped = !user.isSuperAdmin && user.sectionIds?.length;
    tasks.push(query(`SELECT p.id, p.sku, p.name, b.brand_name, s.name AS section_name
      FROM products p JOIN brands b ON b.id = p.brand_id JOIN sections s ON s.id = p.section_id
      WHERE p.status <> 'archived' AND (p.name LIKE $1 OR p.sku LIKE $1 OR p.product_serial LIKE $1 OR b.brand_name LIKE $1)
      ${scoped ? 'AND p.section_id IN ($2)' : ''} ORDER BY p.name LIMIT 6`, scoped ? [like, user.sectionIds] : [like])
      .then(result => { out.products = result.rows; }));
  }
  if (can('masters.view')) {
    tasks.push(query(`SELECT s.id, s.code, s.company_name FROM suppliers s
      WHERE s.status <> 'archived' AND (s.company_name LIKE $1 OR s.code LIKE $1)
      ${user.isSuperAdmin ? '' : 'AND EXISTS (SELECT 1 FROM supplier_divisions sd WHERE sd.supplier_id = s.id AND sd.division_id IN ($2))'}
      ORDER BY s.company_name LIMIT 5`, user.isSuperAdmin ? [like] : [like, user.divisionIds || []])
      .then(result => { out.suppliers = result.rows; }));
  }
  if (can('users.manage')) {
    tasks.push(query(`SELECT id, email, username, full_name, status FROM users
      WHERE full_name LIKE $1 OR email LIKE $1 OR username LIKE $1 ORDER BY full_name LIMIT 5`, [like])
      .then(result => { out.users = result.rows; }));
  }
  await Promise.all(tasks);
  res.json({ data: out });
}));
export default r;
