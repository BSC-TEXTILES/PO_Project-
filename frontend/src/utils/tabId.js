// Stable per-tab id so the server can track each browser tab separately.
export function getTabId() {
  try {
    let id = sessionStorage.getItem('poms_tab_id');
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('poms_tab_id', id);
    }
    return id;
  } catch { return 'no-storage'; }
}