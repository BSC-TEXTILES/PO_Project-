import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from './api.js';
import { useAuth } from './auth.jsx';
import { getTabId } from './utils/tabId.js';

// Live tracking provider:
//  - heartbeat (every 20s and on route change) → server-side session row with
//    IP, device, browser, screen, current tab/route, and optional GPS location

const TrackingContext = createContext({ demoMode: true });

export const useTracking = () => useContext(TrackingContext);

export function TrackingProvider({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // Demo-account cards on the login page: default to the build mode, then follow
  // the server flag (DEMO_MODE env / NODE_ENV=production hides them).
  const [demoMode, setDemoMode] = useState(import.meta.env.DEV);
  const [demoAccounts, setDemoAccounts] = useState([]);
  const [geo, setGeo] = useState(null);
  const geoRef = useRef(null);

  // Public flags (login page has no token) + refresh from every heartbeat.
  useEffect(() => {
    api.get('/settings/public').then((r) => {
      if (typeof r.data.demoMode === 'boolean') setDemoMode(r.data.demoMode);
      setDemoAccounts(r.data.demoAccounts || []);
    }).catch(() => {});
  }, [location.pathname, isDev]);

  // Geolocation — one permission request per tab session; silently skipped
  // if the user declines. Coordinates ride along on every heartbeat.
  useEffect(() => {
    if (!user || geoRef.current) return;
    geoRef.current = true;
    try {
      let asked = sessionStorage.getItem('poms_geo_asked');
      if (asked) return;
      sessionStorage.setItem('poms_geo_asked', '1');
      navigator.geolocation?.getCurrentPosition(
        (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => {},
        { timeout: 8000, maximumAge: 300000 },
      );
    } catch { /* geolocation unavailable */ }
  }, [user]);

  const sendHeartbeat = useCallback(async (extra = {}) => {
    if (!user) return null;
    try {
      const { data } = await api.post('/tracking/heartbeat', {
        tabId: getTabId(),
        route: window.location.pathname,
        title: document.title,
        screen: `${window.screen.width}x${window.screen.height}`,
        lat: geoRef.current && geo ? geo.lat : undefined,
        lng: geoRef.current && geo ? geo.lng : undefined,
        accuracy: geo ? geo.accuracy : undefined,
        ...extra,
      });
      return data;
    } catch { return null; }
  }, [user, geo, isDev]);

  // Heartbeat loop + immediate beat on route change.
  useEffect(() => {
    if (!user) return undefined;
    sendHeartbeat();
    const t = setInterval(() => sendHeartbeat(), 20000);
    return () => clearInterval(t);
  }, [user, location.pathname]);

  return (
    <TrackingContext.Provider value={{ demoMode, demoAccounts, sendHeartbeat }}>
      {children}
    </TrackingContext.Provider>
  );
}