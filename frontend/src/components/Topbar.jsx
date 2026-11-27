import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { errMessage, uploadFile, API_BASE, assetUrl } from '../api.js';
import { useAuth, useCart } from '../auth.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import { useDebounce } from '../hooks/useDebounce.js';

// WebSocket endpoint: same host in single-origin mode, the API origin when the
// frontend is deployed separately (Vercel → Render).
const WS_ORIGIN = API_BASE.startsWith('http')
  ? API_BASE.replace(/^http/, 'ws').replace(/\/api$/, '')
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

// Display names for the role codes shown in the top bar profile button.
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  domain_admin: 'Domain Admin',
  purchase_manager: 'Purchase Manager',
  purchase_executive: 'Purchase Executive',
  approver: 'Approver',
  receiving_user: 'Receiving User',
  viewer: 'Viewer',
  auditor: 'Auditor',
};

const LOCATIONS = ['All Locations'];

function roleLabels(roles = []) {
  return roles.map((r) => ROLE_LABELS[r] || String(r).replace(/_/g, ' ')).join(', ');
}

export function Avatar({ user, size = 34 }) {
  const src = user?.profilePhotoUrl ? assetUrl(user.profilePhotoUrl) : null;
  if (src) {
    return <img className="avatar-img" src={src} alt={user.fullName} style={{ width: size, height: size }} />;
  }
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(user?.fullName)}</div>;
}

// Top bar: hamburger → sidebar collapse · global search · live notification bell
// (WebSocket) · running date & time · dark/bright toggle · profile menu with avatar.
export default function Topbar({ collapsed, onToggle, onOpenMobile }) {
  const { user, hasPermission, selectedLocation = 'All Locations', selectLocation, logout } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(new Date());
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // 'search' | 'bell' | 'profile' | 'location'
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [notificationError, setNotificationError] = useState('');
  const [marking, setMarking] = useState(false);
  const markingRef = useRef(false);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('poms_theme') || 'light');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [availableLocations, setAvailableLocations] = useState(LOCATIONS);
  const boxRef = useRef(null);
  const searchRef = useRef(null);

  // Scope location selector to the user's assigned divisions (RB-001)
  useEffect(() => {
    if (!user) return;
    let active = true;
    api.get('/divisions').then((r) => {
      if (!active) return;
      const divs = r.data?.data || [];
      if (user.isSuperAdmin || divs.length >= 3) {
        const names = divs.map((d) => d.name);
        setAvailableLocations(['All Locations', ...names]);
      } else if (divs.length > 0) {
        const names = divs.map((d) => d.name);
        setAvailableLocations(names);
        if (!names.includes(selectedLocation)) {
          selectLocation?.(names[0]);
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [user?.id, user?.isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce global search to avoid excessive API calls
  const debouncedQuery = useDebounce(q, 300);

  // Listen for the beforeinstallprompt event to enable the Install App button
  useEffect(() => {
    const handleInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  async function handleInstallApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  }

  // Dark / bright mode — persisted per browser, applied on <html data-theme>.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('poms_theme', theme);
  }, [theme]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    api.get('/notifications').then((r) => {
      setNotifications(r.data.data || []);
      setUnread(r.data.unread || 0);
    }).catch(error => setNotificationError(errMessage(error)));
  }, []);

  // Live notifications over /ws/notify — badge + toast, no polling.
  useEffect(() => {
    if (!user?.id) return;
    let sock;
    let retry;
    let closed = false;
    let attempts = 0;
    let tokenInterval;
    const connect = async () => {
      try {
        const token = localStorage.getItem('poms_token');
        if (!token || closed) return;
        sock = new WebSocket(`${WS_ORIGIN}/ws/notify?token=${encodeURIComponent(token)}`);
        sock.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'notification' && String(msg.userId) === String(user.id)) {
              setNotifications((list) => [msg.notification, ...list].slice(0, 50));
              setUnread((u) => u + 1);
              setToast(msg.notification);
              setTimeout(() => setToast(null), 6000);
            }
          } catch { /* ignore malformed frame */ }
        };
        sock.onerror = () => { /* handled via onclose */ };
        sock.onclose = (ev) => {
          if (closed) return;
          if (ev.code === 4001 || ev.code === 4002) return; // unauthorized — never retry
          attempts += 1;
          const delay = Math.min(30000, 1000 * 2 ** attempts); // exponential backoff
          retry = setTimeout(connect, delay);
        };
      } catch { /* getToken failed */ }
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(tokenInterval);
      try {
        if (sock) {
          if (sock.readyState === WebSocket.OPEN) {
            sock.close();
          } else if (sock.readyState === WebSocket.CONNECTING) {
            sock.onopen = () => {
              try { sock.close(); } catch { /* ignore */ }
            };
          }
        }
      } catch { /* ignore */ }
    };
  }, [user?.id]);

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpenMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Cmd+K / Ctrl+K focuses the global search bar (matches the "Ctrl K" chip).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function onSearch(v) {
    setQ(v);
    if (v.trim().length < 2) {
      setResults(null);
      setOpenMenu(null);
    }
  }

  // Debounced search effect - only calls API after user stops typing
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults(null);
      setOpenMenu(null);
      return;
    }
    let active = true;
    setSearchLoading(true);
    setSearchError('');
    setOpenMenu('search');
    api.get('/search', { params: { q: debouncedQuery.trim() } })
      .then((r) => {
        if (active) {
          setResults(r.data.data || { purchaseOrders: [], products: [], suppliers: [], users: [] });
          setOpenMenu('search');
        }
      })
      .catch((error) => { if (active) { setResults(null); setSearchError(errMessage(error)); } })
      .finally(() => { if (active) setSearchLoading(false); });
    return () => { active = false; };
  }, [debouncedQuery]);

  function goSearch(item, kind) {
    setOpenMenu(null); setQ(''); setResults(null);
    if (kind === 'po') navigate(`/purchase-orders/${item.id}`);
    if (kind === 'product') navigate(hasPermission('products.view') ? `/products/${item.id}` : `/catalogue?q=${encodeURIComponent(item.sku)}`);
    if (kind === 'user' && hasPermission('users.manage')) navigate('/users');
  }

  async function markAll() {
    if (markingRef.current) return;
    markingRef.current = true; setMarking(true); setNotificationError('');
    try {
      await api.post('/notifications/read-all');
      setNotifications((list) => list.map((n) => ({ ...n, is_read: true })));
      setUnread(0);
    } catch (error) { setNotificationError(errMessage(error)); }
    finally { markingRef.current = false; setMarking(false); }
  }

  async function markOne(n) {
    if (!n.is_read) {
      try { await api.post(`/notifications/${n.id}/read`); }
      catch (error) { setNotificationError(errMessage(error)); return; }
      setUnread((u) => Math.max(0, u - 1));
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
    setOpenMenu(null);
    if (n.entity_type === 'purchase_order' && n.entity_id) navigate(`/purchase-orders/${n.entity_id}`);
  }

  function handleSelectLocation(loc) {
    if (typeof selectLocation === 'function') {
      selectLocation(loc);
    } else {
      localStorage.setItem('poms_selected_location', loc);
    }
    setOpenMenu(null);
  }

  function handleViewProfile() {
    setOpenMenu(null);
    navigate('/profile');
  }

  function handleUpdatePassword() {
    setOpenMenu(null);
    navigate('/profile?tab=password');
  }

  function handleNotifications() {
    setOpenMenu('bell');
  }

  async function handleLogout() {
    setOpenMenu(null);
    await logout();
  }

  const canSearchUsers = user.isSuperAdmin || hasPermission('users.manage');
  const r = results;

  return (
    <header className="topbar" ref={boxRef}>
      <button
        type="button"
        className="icon-btn mobile-menu-btn"
        onClick={onOpenMobile}
        aria-label="Open navigation menu"
        title="Open menu"
      >
        <Icon name="menu" size={20} />
      </button>
      <div className="topbar-search donezo-search">
        <Icon name="search" size={15} className="search-icon" />
        <input
          ref={searchRef}
          value={q}
          placeholder="Search orders, products, suppliers…"
          className="donezo-search-input"
          aria-label="Search purchase orders, products, suppliers and users"
          onChange={(e) => onSearch(e.target.value)}
          onFocus={() => results && setOpenMenu('search')}
        />
        <div className="search-shortcut">Ctrl K</div>
        {openMenu === 'search' && (searchLoading || searchError) && <div className="dropdown search-drop" role="status"><div className="drop-empty">{searchLoading ? 'Searching…' : searchError}</div></div>}
        {openMenu === 'search' && r && !searchLoading && !searchError && (
          <div className="dropdown search-drop">
            <div className="drop-section">Purchase Orders</div>
            {(r.purchaseOrders || []).map((p) => (
              <button key={p.id} className="drop-item" onClick={() => goSearch(p, 'po')}>
                <Icon name="po" size={15} /> <span><strong>{p.po_number}</strong> · {p.supplier || '—'} · {p.division || '—'}</span>
                <span className={`right chip st-${p.status || ''}`}>{(p.status || '').replace(/_/g, ' ')}</span>
              </button>
            ))}
            {!(r.purchaseOrders || []).length && <div className="drop-empty">No matching POs</div>}
            <div className="drop-section">Products</div>
            {(r.products || []).map((p) => (
              <button key={p.id} className="drop-item" onClick={() => goSearch(p, 'product')}>
                <Icon name="catalogue" size={15} /> <span><strong>{p.name}</strong> · {p.brand_name}</span>
                <span className="right muted mono">{p.sku}</span>
              </button>
            ))}
            {!(r.products || []).length && <div className="drop-empty">No matching products</div>}
            {!!(r.suppliers || []).length && <div className="drop-section">Suppliers</div>}
            {(r.suppliers || []).map((s) => (
              <div key={s.id} className="drop-item static"><Icon name="building" size={15} /> <span>{s.company_name}</span></div>
            ))}
            {canSearchUsers && !!(r.users || []).length && <div className="drop-section">Users</div>}
            {canSearchUsers && (r.users || []).map((u) => (
              <button key={u.id} className="drop-item" onClick={() => goSearch(u, 'user')}>
                <Icon name="users" size={15} /> <span>{u.full_name}</span> <span className="right muted">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-right donezo-right">
        <div className="tb-datetime">
          <strong>{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</strong>
          <span className="muted">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        <div className="tb-anchor">
          {installPrompt && (
            <button className="btn accent sm" style={{ marginRight: 16 }} onClick={handleInstallApp}>
              ↓ Install App
            </button>
          )}
          <button className="icon-btn bell" title="Notifications" onClick={() => setOpenMenu(openMenu === 'bell' ? null : 'bell')}>
            <Icon name="bell" size={19} />
            {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
        {openMenu === 'bell' && (
          <div className="dropdown bell-drop">
            {notificationError && <div className="alert error" role="alert">{notificationError}</div>}
            <div className="drop-head">
              <strong>Notifications {unread > 0 && <span className="chip">{unread} new</span>}</strong>
              <button className="btn ghost sm" disabled={marking || !unread} onClick={markAll}>{marking ? 'Updating…' : 'Mark all read'}</button>
            </div>
            <div className="drop-scroll">
              {notifications.map((n) => (
                <button key={n.id} className={`drop-item notif ${n.is_read ? '' : 'unread'}`} onClick={() => markOne(n)}>
                  <span className="notif-dot" />
                  <span>
                    <strong>{n.title}</strong>
                    {n.body && <span className="notif-body">{n.body}</span>}
                    <span className="notif-time">{new Date(n.sent_at).toLocaleString('en-IN')}</span>
                  </span>
                </button>
              ))}
              {!notifications.length && <div className="drop-empty">You're all caught up</div>}
            </div>
          </div>
        )}
        </div>

        {/* Cart — always visible in the top navigation (right section).
            Any role that places an order sees it here; checkout crosschecks
            the details once more before the order is finally placed and the
            complete summary invoice is generated. */}
        <div className="tb-anchor">
          <button
            className={`icon-btn cart-indicator ${openMenu === 'cart' ? 'active' : ''}`}
            title="Order cart — review, crosscheck and checkout"
            onClick={() => setOpenMenu(openMenu === 'cart' ? null : 'cart')}
          >
            <Icon name="po" size={19} />
            {cart.count > 0 && <span className="badge cart-badge">{cart.count}</span>}
          </button>
          {openMenu === 'cart' && (
            <div className="dropdown cart-drop">
              <div className="drop-head">Pending orders in cart</div>
              <div className="drop-scroll">
                {cart.items.map((it) => (
                  <div key={it.id} className="drop-item cart-item">
                    <span>
                      <strong className="mono">{it.poNumber}</strong>
                      <span className="notif-body">{it.sectionName} · {it.supplierName}</span>
                      <span className="notif-time">Added {new Date(it.addedAt).toLocaleString('en-IN')}</span>
                    </span>
                    <span className="right row" style={{ gap: 6 }}>
                      {it.grandTotal != null && <strong>₹{Number(it.grandTotal).toLocaleString('en-IN')}</strong>}
                      <button className="btn sm danger" aria-label={`Remove ${it.poNumber} from cart`} onClick={() => cart.removeItem(it.id)}>✕</button>
                    </span>
                  </div>
                ))}
                {!cart.items.length && <div className="drop-empty">Cart is empty — place a purchase order to add it here.</div>}
              </div>
              {!!cart.items.length && (
                <button className="btn accent" style={{ margin: 8, width: 'calc(100% - 16px)' }} onClick={() => { setOpenMenu(null); navigate('/checkout'); }}>
                  Crosscheck & Checkout →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Location Dropdown */}
        <div className="tb-anchor location-dropdown-anchor">
          <button
            type="button"
            className={`tb-location-btn ${openMenu === 'location' ? 'active' : ''}`}
            title={`Store location: ${selectedLocation}`}
            onClick={() => setOpenMenu(openMenu === 'location' ? null : 'location')}
            aria-expanded={openMenu === 'location'}
          >
            <Icon name="location" size={15} className="location-btn-icon" />
            <span className="location-btn-text">
              {!selectedLocation || selectedLocation.toLowerCase().includes('all location') ? 'All Locations' : selectedLocation}
            </span>
            <Icon name="chevronDown" size={12} className={`location-btn-chevron ${openMenu === 'location' ? 'open' : ''}`} />
          </button>
          {openMenu === 'location' && (
            <div className="dropdown location-drop">
              <div className="drop-section location-drop-header">
                STORE LOCATION
              </div>
              <div className="drop-scroll" style={{ maxHeight: 260 }}>
                {availableLocations.map((loc) => {
                  const isSelected = selectedLocation === loc;
                  return (
                    <button
                      key={loc}
                      type="button"
                      className={`drop-item location-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectLocation(loc)}
                    >
                      <div className="location-item-label">
                        <Icon name="location" size={14} className="location-item-icon" />
                        <span>{loc}</span>
                      </div>
                      {isSelected && <Icon name="check" size={14} className="location-check" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="tb-anchor profile-dropdown-anchor">
          <button
            type="button"
            className={`profile-btn ${openMenu === 'profile' ? 'active' : ''}`}
            onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
            title="Account profile & menu"
            aria-expanded={openMenu === 'profile'}
          >
            <Avatar user={user} size={34} />
            <span className="profile-meta">
              <span className="user-name">{user.fullName}</span>
              <span className="user-roles">{roleLabels(user.roles)}</span>
            </span>
            <Icon name="chevronDown" size={12} className={`profile-btn-chevron ${openMenu === 'profile' ? 'open' : ''}`} />
          </button>

          {openMenu === 'profile' && (
            <div className="dropdown profile-drop">
              <div className="profile-drop-header">
                <Avatar user={user} size={38} />
                <div className="profile-drop-info">
                  <strong className="profile-drop-name">{user.fullName || 'User'}</strong>
                  <span className="profile-drop-email">{user.email}</span>
                  <span className="profile-drop-role">{roleLabels(user.roles)}</span>
                </div>
              </div>
              <div className="profile-drop-divider" />

              <button
                type="button"
                className="drop-item profile-item"
                onClick={handleViewProfile}
              >
                <Icon name="users" size={16} className="profile-item-icon" />
                <div className="profile-item-text">
                  <strong>View my profile</strong>
                  <span className="profile-item-sub">Personal details & profile settings</span>
                </div>
                <Icon name="chevronRight" size={12} className="profile-item-arrow" />
              </button>

              <button
                type="button"
                className="drop-item profile-item"
                onClick={handleUpdatePassword}
              >
                <Icon name="lock" size={16} className="profile-item-icon" />
                <div className="profile-item-text">
                  <strong>Update password</strong>
                  <span className="profile-item-sub">Change account security password</span>
                </div>
                <Icon name="chevronRight" size={12} className="profile-item-arrow" />
              </button>

              <button
                type="button"
                className="drop-item profile-item"
                onClick={handleNotifications}
              >
                <div className="profile-item-notif-icon-wrap">
                  <Icon name="bell" size={16} className="profile-item-icon" />
                  {unread > 0 && <span className="profile-notif-dot" />}
                </div>
                <div className="profile-item-text">
                  <strong>Notification</strong>
                  <span className="profile-item-sub">{unread > 0 ? `${unread} unread notifications` : 'View alerts & inbox'}</span>
                </div>
                {unread > 0 && <span className="chip" style={{ fontSize: 11, padding: '1px 6px' }}>{unread}</span>}
              </button>

              <div className="profile-drop-divider" />

              <button
                type="button"
                className="drop-item profile-item danger"
                onClick={handleLogout}
              >
                <Icon name="logout" size={16} className="profile-item-icon danger" />
                <div className="profile-item-text">
                  <strong className="danger-text">Logout</strong>
                  <span className="profile-item-sub">Sign out of this session</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="toast" onClick={() => markOne(toast)}>
          <Icon name="bell" size={16} />
          <span><strong>{toast.title}</strong>{toast.body ? ` — ${toast.body}` : ''}</span>
        </div>
      )}

      {/* App Install Popup */}
      {installPrompt && (
        <Modal title="Get the BSC Exclusive App" onClose={() => setInstallPrompt(null)} maxWidth={400}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <img src="/bsc-logo.png" alt="BSC" style={{ width: 64, height: 64, marginBottom: 16 }} />
            <h3 style={{ margin: '0 0 10px', fontSize: 20 }}>Install the Web App</h3>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
              For the best experience managing orders on the go, install the BSC Exclusive App on your mobile device or desktop.
            </p>
            <button className="btn accent" style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 600 }} onClick={handleInstallApp}>
              Download App Now
            </button>
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={() => setInstallPrompt(null)}>
              Continue in Browser
            </button>
          </div>
        </Modal>
      )}
    </header>
  );
}