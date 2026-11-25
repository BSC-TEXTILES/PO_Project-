/**
 * Frontend Security & Diagnostics Module
 * Genuine security is enforced on the backend via session validation,
 * RBAC authorization, and API guards.
 * Right-click and keyboard navigation are fully enabled across the UI.
 */

export function initSecurityProtections() {
  if (typeof window === 'undefined') return;

  // 1. Security notice in browser console
  try {
    const titleStyle = 'color: #ef4444; font-size: 20px; font-weight: 800; font-family: sans-serif;';
    const textStyle = 'color: #334155; font-size: 13px; font-family: sans-serif; line-height: 1.5;';
    console.log('%c⚠️ BSC Exclusive POMS Security Notice', titleStyle);
    console.log(
      '%cAll API operations are cryptographically authenticated and audit-logged on the server.',
      textStyle
    );
  } catch {
    /* ignore console styling errors */
  }

  // 2. Global structured error logging
  const handleGlobalError = (event) => {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      type: 'uncaught_error',
      message: event.message || 'Unknown error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    };
    if (import.meta.env.DEV) {
      console.warn('[POMS Error Guard]', errorDetails);
    }
  };

  const handleUnhandledRejection = (event) => {
    const errorDetails = {
      timestamp: new Date().toISOString(),
      type: 'unhandled_rejection',
      reason: event.reason?.message || String(event.reason || 'Unknown rejection'),
    };
    if (import.meta.env.DEV) {
      console.warn('[POMS Promise Guard]', errorDetails);
    }
  };

  window.addEventListener('error', handleGlobalError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleGlobalError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}
