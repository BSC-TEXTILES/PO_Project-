import { it, expect, vi, afterEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import api, { setTokenGetter, errMessage } from '../src/api.js';
afterEach(() => { setTokenGetter(null); });

it('uses the current token and stable per-tab session identifier', async () => {
  localStorage.setItem('poms_token', 'first-test-token');
  setTokenGetter(() => localStorage.getItem('poms_token'));
  const seen = [];
  const adapter = async config => { seen.push(config); return { data: {}, status: 200, statusText: 'OK', headers: {}, config }; };
  await api.get('/example', { adapter });
  localStorage.setItem('poms_token', 'rotated-test-token');
  await api.get('/example', { adapter });
  expect(seen.map(c => c.headers.Authorization)).toEqual(['Bearer first-test-token', 'Bearer rotated-test-token']);
  expect(seen[0].headers['X-Tab-Id']).toBe(seen[1].headers['X-Tab-Id']);
  expect(seen[0].headers['X-Tab-Id']).toBeTruthy();
  expect(seen[0].timeout).toBe(30000);
});

it('refreshes once for simultaneous expired requests and retries each with the new token', async () => {
  localStorage.setItem('poms_token', 'expired-test-token');
  setTokenGetter(() => localStorage.getItem('poms_token'));
  let resolveRefresh;
  const refresh = vi.spyOn(axios, 'post').mockImplementation(() => new Promise(resolve => { resolveRefresh = resolve; }));
  const calls = [];
  const adapter = async config => {
    calls.push(config.headers.Authorization);
    if (config.headers.Authorization === 'Bearer expired-test-token') {
      throw new AxiosError('Expired', 'ERR_BAD_REQUEST', config, {}, { status: 401, data: {}, config });
    }
    return { status: 200, data: { ok: true }, headers: {}, config };
  };
  const requests = Promise.all([api.get('/one', { adapter }), api.get('/two', { adapter })]);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  resolveRefresh({ data: { token: 'fresh-test-token' } });
  const results = await requests;
  expect(results.every(r => r.data.ok)).toBe(true);
  expect(calls.filter(v => v === 'Bearer fresh-test-token')).toHaveLength(2);
});

it('reports a bounded timeout in user-facing terms', () => {
  expect(errMessage({ code: 'ECONNABORTED' })).toMatch(/took too long/);
});
