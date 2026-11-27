import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import api, { errMessage } from '../api.js';
import Icon from '../components/Icon.jsx';

const REMEMBER_KEY = 'poms_remember_email';
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const pending = useRef(false);
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => !!localStorage.getItem(REMEMBER_KEY));
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfaUserId, setMfaUserId] = useState(null);
  const [otp, setOtp] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [notice] = useState(() => sessionStorage.getItem('poms_logout_reason') || '');
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(mfaUserId ? '/auth/login/verify-mfa' : '/auth/login',
        mfaUserId ? { userId: mfaUserId, otp } : { email: email.trim(), password });
      if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
      else localStorage.removeItem(REMEMBER_KEY);
      if (data.mfaRequired) { setMfaUserId(data.userId); setPassword(''); return; }
      sessionStorage.removeItem('poms_logout_reason');
      login(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(errMessage(err)); }
    finally { pending.current = false; setBusy(false); }
  }
  return (
    <div className="auth-workspace">
      <section className="auth-story" aria-label="BSC purchase management">
        <Link className="auth-brand" to="/landing"><span className="auth-monogram">BSC</span><span>BSC Exclusive<small>Purchase management</small></span></Link>
        <div className="auth-story-body">
          <span className="eyebrow">THE PROCUREMENT WORKSPACE</span>
          <h1>Every order.<br />One clear view.</h1>
          <p>Bring your catalogue, purchase orders, approvals and deliveries together. Stay focused on the work that moves your business forward.</p>
          <div className="auth-workflow">
            <div><Icon name="catalogue" /><span>Build orders<small>Products, sizes and pricing in one place</small></span></div>
            <div><Icon name="approvals" /><span>Review with confidence<small>Clear approvals and a traceable history</small></span></div>
            <div><Icon name="receipts" /><span>Follow every delivery<small>From supplier dispatch to goods received</small></span></div>
          </div>
        </div>
        <div className="auth-story-footer">BSC Exclusive · Operations workspace</div>
      </section>
      <main className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
          <h2>{mfaUserId ? 'Verify your sign-in' : 'Welcome back'}</h2>
          <p className="auth-description">{mfaUserId ? 'Enter your six-digit authentication code to continue.' : 'Sign in with your work account to continue.'}</p>
          {notice && <div className="alert info" role="status">{notice}</div>}
          {error && <div className="alert error" role="alert">{error}</div>}
          <form onSubmit={submit} aria-busy={busy}>
            {mfaUserId ? <label className="field">Authentication code<input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} required /></label> : <>
              <label className="field">Work email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required /></label>
              <label className="field">Password<div className="password-control"><input type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>{visible ? 'Hide' : 'Show'}</button></div></label>
              <div className="auth-options"><label><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember my email</label><button type="button" className="text-button" onClick={() => setRecovery(v => !v)} aria-expanded={recovery}>Need help?</button></div>
              {recovery && <p className="auth-help" role="status">For a forgotten password or account access, contact your organization's administrator. Self-service recovery is not configured.</p>}
            </>}
            <button type="submit" className="btn primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : mfaUserId ? 'Verify and sign in' : 'Sign in'}</button>
            {mfaUserId && <button type="button" className="btn ghost auth-submit" disabled={busy} onClick={() => { setMfaUserId(null); setOtp(''); setError(''); }}>Back to sign in</button>}
          </form>
          {!mfaUserId && <p className="auth-register">New to the team? <Link to="/signup">Create an account</Link></p>}
          <footer className="auth-legal"><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms of use</Link></footer>
        </div>
      </main>
    </div>
  );
}
