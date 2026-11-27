import { it, expect, vi, beforeEach } from 'vitest';
import search from '../../backend/src/routes/search.js';
import { query } from '../../backend/src/config/db.js';
vi.mock('../../backend/src/config/db.js', () => ({ query: vi.fn() }));
vi.mock('../../backend/src/middleware/auth.js', () => ({ authenticate: (_req, _res, next) => next() }));
const handler = search.stack.find(layer => layer.route?.path === '/search').route.stack.at(-1).handle;
async function run(user, q = 'cotton') {
  let result;
  await handler({ query: { q }, user }, { json: data => { result = data; } }, error => { throw error; });
  return result;
}
beforeEach(() => { query.mockResolvedValue({ rows: [] }); });
it('global search does not query or disclose any module without permission', async () => {
  expect(await run({ permissions: [], divisionIds: [] })).toEqual({ data: { purchaseOrders: [], products: [], suppliers: [], users: [] } });
  expect(query).not.toHaveBeenCalled();
});
it('order search enforces both division and assigned section scope', async () => {
  await run({ permissions: ['po.view'], divisionIds: ['division-test'], sectionIds: ['section-test'] });
  expect(query).toHaveBeenCalledTimes(1);
  const [sql, params] = query.mock.calls[0];
  expect(sql).toContain('po.division_id IN ($2)');
  expect(sql).toContain('po.section_id IN ($3)');
  expect(params).toEqual(['%cotton%', ['division-test'], ['section-test']]);
});
it('supplier search enforces supplier division membership', async () => {
  await run({ permissions: ['masters.view'], divisionIds: ['division-test'] });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain('supplier_divisions');
  expect(query.mock.calls[0][1][1]).toEqual(['division-test']);
});
it('catalogue search restricts assigned sections and does not expose users', async () => {
  await run({ permissions: ['catalogue.view'], sectionIds: ['section-test'] });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][0]).toContain('p.section_id IN ($2)');
});
it('short searches do not issue database queries', async () => {
  await run({ isSuperAdmin: true }, 'a');
  expect(query).not.toHaveBeenCalled();
});
