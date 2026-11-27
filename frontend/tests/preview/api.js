// Test-only transport: never sends a request and cannot mutate records.
export const API_BASE = '/api';
export const API_ORIGIN = '';
export const assetUrl = u => u;
export const errMessage = e => e.message;
export const formatBytes = n => `${n} B`;
export const fileKind = () => ({ icon: 'file', label: 'File' });
const blocked = () => Promise.reject(new Error('Writes are disabled in the isolated UI review.'));
export const uploadFile = blocked;
export const importUpload = blocked;
export const importConfirm = blocked;
export const importCancel = blocked;
export const importHistory = () => Promise.resolve({data:{data:[]}});
export const importRecords = importHistory;
export default { get: async path => {
  if (path.includes('/reports/dashboard') || path.includes('/tracking/live')) throw new Error('Database unavailable. This preview verifies UI states only.');
  return { data: { data: [], total: 0, unread: 0, permissions: [], roles: [], users: [], settings: {} } };
}, post: blocked, patch: blocked, put: blocked, delete: blocked };
