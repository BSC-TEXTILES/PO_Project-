import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api.js';

// An outage should not hide sign-in, legal pages or the current work surface.
export default function BackendHealthCheck({ children }) {
  const [issue, setIssue] = useState('');
  const [checking, setChecking] = useState(false);
  const active = useRef(true);
  const pending = useRef(false);
  const check = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setChecking(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE.replace(/\/$/, '')}/health`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('unavailable');
      const health = await response.json();
      if (active.current) setIssue(health.dbStatus === 'error' ? 'The data service is temporarily unavailable. Your changes may not be saved. Please try again shortly.' : '');
    } catch {
      if (active.current) setIssue('Unable to reach the service. Check your connection and try again.');
    } finally {
      clearTimeout(timeout);
      pending.current = false;
      if (active.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    check();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30000);
    window.addEventListener('online', check);
    return () => { active.current = false; clearInterval(timer); window.removeEventListener('online', check); };
  }, [check]);
  return <div className="service-layout">{issue && <aside className="service-notice" role="status"><span>{issue}</span><button className="btn sm" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Retry connection'}</button></aside>}<div className="service-content">{children}</div></div>;
}
