import test from 'node:test';
import assert from 'node:assert/strict';
// Read-only black-box authorization checks. No credentials or mutations sent.
const base = process.env.TEST_API_URL || 'http://127.0.0.1:4040';
const routes = ['/auth/me','/users','/products','/brands','/categories','/colours','/sizes','/manufacturers','/locations','/purchase-orders','/approvals','/receipts','/reports/dashboard','/search?q=cotton','/roles','/audit-logs','/notifications','/settings','/videos','/lr/dashboard','/lr/shipments','/lr/transporters'];
for (const route of routes) {
  test(`unauthenticated GET /api${route} is denied`, async () => {
    const response = await fetch(`${base}/api${route}`);
    assert.equal(response.status, 401, `${route} returned ${response.status}`);
  });
}
test('health reports database failure without pretending it is healthy', async () => {
  const response = await fetch(`${base}/api/health`);
  const body = await response.json();
  assert.ok(['ok', 'degraded'].includes(body.status));
  if (body.dbStatus === 'error') assert.equal(body.status, 'degraded');
});
