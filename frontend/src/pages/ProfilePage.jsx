import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMessage, uploadFile, assetUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';

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

function roleLabels(roles = []) {
  return roles.map((r) => ROLE_LABELS[r] || String(r).replace(/_/g, ' ')).join(', ');
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

function formatLastLogin(d) {
  if (!d) return 'Today, Active';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(d) {
  if (!d) return 'Recently';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'password' ? 'password' : 'personal';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Change password states
  const [passwordFlow, setPasswordFlow] = useState('idle'); // idle, awaiting_otp, success
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', emailOtp: '', phoneOtp: '', newPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);

  // Sync state if user changes in context
  useEffect(() => {
    if (user) {
      setForm({
        fullName: user.fullName || '',
        email: user.email || '',
        phone: user.phone || '',
        designation: user.designation || '',
      });
    }
  }, [user]);

  // Handle tab switch
  function handleTabChange(tab) {
    setActiveTab(tab);
    setError('');
    setSuccess('');
    setPwdError('');
    setPwdSuccess('');
    setSearchParams(tab === 'password' ? { tab: 'password' } : {});
  }

  // Upload Profile Photo
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError('');
    try {
      const { data } = await uploadFile('/users/me/photo', file, 'file');
      if (data?.data?.profilePhotoUrl) {
        updateUser({ profilePhotoUrl: data.data.profilePhotoUrl });
        setSuccess('Profile photo updated successfully!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  }

  // Update Personal Information
  async function handleSaveProfile(e) {
    e.preventDefault();
    if (!form.fullName?.trim()) {
      setError('Full name is required');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await api.patch('/users/me', {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        designation: form.designation.trim(),
      });

      updateUser({
        fullName: data.data.full_name,
        email: data.data.email,
        phone: data.data.phone,
        designation: data.data.designation,
        profileUpdatedAt: data.data.profile_updated_at,
      });

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Password Flow: Request OTP
  async function handleRequestOtp() {
    setPwdError('');
    setPwdSuccess('');
    setPwdBusy(true);
    try {
      const { data } = await api.post('/auth/change-password/request-otp', {
        currentPassword: pwdForm.currentPassword,
      });
      setPasswordFlow('awaiting_otp');
      setPwdSuccess(data.message || 'Verification code sent to your registered email and phone.');
    } catch (err) {
      setPwdError(errMessage(err));
    } finally {
      setPwdBusy(false);
    }
  }

  // Password Flow: Verify OTP & Change Password
  async function handleChangePassword(e) {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    setPwdBusy(true);
    try {
      await api.post('/auth/change-password/verify', {
        emailOtp: pwdForm.emailOtp.trim(),
        phoneOtp: pwdForm.phoneOtp.trim(),
        newPassword: pwdForm.newPassword,
      });
      setPasswordFlow('success');
      setPwdForm({ currentPassword: '', emailOtp: '', phoneOtp: '', newPassword: '' });
      setPwdSuccess('Password changed successfully! Please keep your new password safe.');
      setTimeout(() => {
        setPasswordFlow('idle');
        setPwdSuccess('');
      }, 4000);
    } catch (err) {
      setPwdError(errMessage(err));
    } finally {
      setPwdBusy(false);
    }
  }

  if (!user) {
    return <div className="page"><div className="loading-spinner" /></div>;
  }

  const roleText = user.isSuperAdmin ? 'Super Admin' : (roleLabels(user.roles) || 'User');
  const avatarUrl = user.profilePhotoUrl ? assetUrl(user.profilePhotoUrl) : null;

  return (
    <div className="page profile-page-container">
      {/* ─── PAGE HEADER ─── */}
      <div className="profile-page-header">
        <h1 className="page-title">My Profile</h1>
        <p className="page-sub">Manage your personal information, security settings and account preferences.</p>
      </div>

      {/* ─── HERO BANNER CARD ─── */}
      <div className="card profile-hero-card">
        <div className="profile-hero-content">
          {/* Avatar with Camera Icon Overlay */}
          <div className="profile-avatar-wrapper">
            {avatarUrl ? (
              <img src={avatarUrl} alt={user.fullName} className="profile-hero-avatar-img" />
            ) : (
              <div className="profile-hero-avatar-fallback">
                {initials(user.fullName || user.email)}
              </div>
            )}
            <button
              type="button"
              className="profile-camera-badge-btn"
              title="Change profile photo"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? '…' : <Icon name="camera" size={14} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handlePhotoUpload}
            />
          </div>

          {/* User Details */}
          <div className="profile-hero-info">
            <div className="profile-hero-name-row">
              <h2 className="profile-hero-name">{user.fullName || 'User Profile'}</h2>
              <span className="profile-hero-role-chip">{roleText}</span>
            </div>

            <div className="profile-hero-meta-row">
              <span className="profile-meta-item">
                <Icon name="mail" size={14} className="profile-meta-icon" />
                <span>{user.email}</span>
              </span>

              <span className="profile-meta-separator">•</span>

              <span className="profile-meta-item">
                <span className="profile-active-dot" />
                <span className="profile-active-text">Active</span>
              </span>

              <span className="profile-meta-separator">•</span>

              <span className="profile-meta-item">
                <Icon name="clock" size={14} className="profile-meta-icon" />
                <span>Last login: {formatLastLogin(user.lastLoginAt)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Edit Profile Button on Far Right */}
        <div className="profile-hero-actions">
          <button
            type="button"
            className="btn profile-edit-btn"
            onClick={() => {
              handleTabChange('personal');
              setTimeout(() => nameInputRef.current?.focus(), 80);
            }}
          >
            <Icon name="edit" size={15} />
            <span>Edit Profile</span>
          </button>
        </div>
      </div>

      {/* ─── TAB NAVIGATION ─── */}
      <div className="profile-tabs-bar">
        <button
          type="button"
          className={`profile-tab-item ${activeTab === 'personal' ? 'active' : ''}`}
          onClick={() => handleTabChange('personal')}
        >
          <Icon name="user" size={16} />
          <span>Personal Information</span>
        </button>

        <button
          type="button"
          className={`profile-tab-item ${activeTab === 'password' ? 'active' : ''}`}
          onClick={() => handleTabChange('password')}
        >
          <Icon name="lock" size={16} />
          <span>Change Password</span>
        </button>
      </div>

      {/* ─── 2-COLUMN GRID LAYOUT ─── */}
      <div className="profile-main-grid">
        {/* LEFT COLUMN: Active Tab Form Card */}
        <div className="profile-grid-left">
          {activeTab === 'personal' ? (
            <div className="card profile-card-panel">
              <div className="profile-card-header">
                <h3 className="profile-card-title">Personal Information</h3>
                <p className="profile-card-sub">Update your personal details and how you appear across the system.</p>
              </div>

              {error && <div className="alert error" style={{ marginBottom: 18 }}>{error}</div>}
              {success && <div className="alert ok" style={{ marginBottom: 18 }}>{success}</div>}

              <form onSubmit={handleSaveProfile} className="profile-form-body">
                {/* Full Name */}
                <div className="profile-input-group">
                  <label className="profile-label">Full Name</label>
                  <div className="profile-field-container">
                    <Icon name="user" size={16} className="profile-field-icon" />
                    <input
                      ref={nameInputRef}
                      type="text"
                      className="profile-input"
                      placeholder="e.g. Rajeshwar V. Rao"
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      required
                    />
                  </div>
                  <span className="profile-hint">Your full name as displayed on orders, reports, and team activity.</span>
                </div>

                {/* Email Address */}
                <div className="profile-input-group">
                  <label className="profile-label">Email Address</label>
                  <div className="profile-field-container">
                    <Icon name="mail" size={16} className="profile-field-icon" />
                    <input
                      type="email"
                      className="profile-input"
                      placeholder="e.g. user@exclusivepoms.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                    />
                  </div>
                  <span className="profile-hint">Primary email used for system notifications and secure login.</span>
                </div>

                {/* Phone & Designation Row */}
                <div className="profile-input-row">
                  <div className="profile-input-group">
                    <label className="profile-label">Phone Number</label>
                    <div className="profile-field-container">
                      <Icon name="phone" size={16} className="profile-field-icon" />
                      <input
                        type="tel"
                        className="profile-input"
                        placeholder="+91 98765 43210"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="profile-input-group">
                    <label className="profile-label">Designation</label>
                    <div className="profile-field-container">
                      <Icon name="briefcase" size={16} className="profile-field-icon" />
                      <input
                        type="text"
                        className="profile-input"
                        placeholder="e.g. Purchase Manager"
                        value={form.designation}
                        onChange={(e) => setForm({ ...form, designation: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="profile-actions-row">
                  <button
                    type="submit"
                    className="btn primary profile-save-btn"
                    disabled={saving || !form.fullName?.trim()}
                  >
                    {saving ? 'Updating Profile…' : 'Update Profile'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* CHANGE PASSWORD TAB */
            <div className="card profile-card-panel">
              <div className="profile-card-header">
                <h3 className="profile-card-title">Change Password</h3>
                <p className="profile-card-sub">Ensure your account is protected with a strong, secure password.</p>
              </div>

              {pwdError && <div className="alert error" style={{ marginBottom: 18 }}>{pwdError}</div>}
              {pwdSuccess && <div className="alert ok" style={{ marginBottom: 18 }}>{pwdSuccess}</div>}

              {passwordFlow === 'idle' && (
                <div className="profile-form-body">
                  <div className="profile-input-group">
                    <label className="profile-label">Current Password</label>
                    <div className="profile-field-container">
                      <Icon name="lock" size={16} className="profile-field-icon" />
                      <input
                        type="password"
                        className="profile-input"
                        placeholder="Enter your current password"
                        value={pwdForm.currentPassword}
                        onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                      />
                    </div>
                    <span className="profile-hint">To change your password, verify your identity with your current password first.</span>
                  </div>

                  <div className="profile-actions-row">
                    <button
                      type="button"
                      className="btn primary profile-save-btn"
                      disabled={pwdBusy || !pwdForm.currentPassword}
                      onClick={handleRequestOtp}
                    >
                      {pwdBusy ? 'Sending OTP…' : 'Request Verification OTP'}
                    </button>
                  </div>
                </div>
              )}

              {passwordFlow === 'awaiting_otp' && (
                <form onSubmit={handleChangePassword} className="profile-form-body">
                  <div className="profile-input-row">
                    <div className="profile-input-group">
                      <label className="profile-label">Email OTP</label>
                      <div className="profile-field-container">
                        <Icon name="mail" size={16} className="profile-field-icon" />
                        <input
                          type="text"
                          maxLength={6}
                          className="profile-input"
                          placeholder="6-digit code"
                          value={pwdForm.emailOtp}
                          onChange={(e) => setPwdForm({ ...pwdForm, emailOtp: e.target.value })}
                          required
                          style={{ letterSpacing: 2, fontWeight: 700 }}
                        />
                      </div>
                    </div>

                    <div className="profile-input-group">
                      <label className="profile-label">Phone OTP</label>
                      <div className="profile-field-container">
                        <Icon name="phone" size={16} className="profile-field-icon" />
                        <input
                          type="text"
                          maxLength={6}
                          className="profile-input"
                          placeholder="6-digit code"
                          value={pwdForm.phoneOtp}
                          onChange={(e) => setPwdForm({ ...pwdForm, phoneOtp: e.target.value })}
                          required
                          style={{ letterSpacing: 2, fontWeight: 700 }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="profile-input-group">
                    <label className="profile-label">New Password</label>
                    <div className="profile-field-container">
                      <Icon name="lock" size={16} className="profile-field-icon" />
                      <input
                        type="password"
                        className="profile-input"
                        placeholder="Enter new strong password"
                        value={pwdForm.newPassword}
                        onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                        required
                        minLength={8}
                      />
                    </div>
                    <span className="profile-hint">Minimum 8 characters with letters, numbers, and special characters.</span>
                  </div>

                  <div className="profile-actions-row" style={{ gap: 12 }}>
                    <button
                      type="submit"
                      className="btn primary profile-save-btn"
                      disabled={pwdBusy || !pwdForm.emailOtp || !pwdForm.phoneOtp || !pwdForm.newPassword}
                    >
                      {pwdBusy ? 'Verifying…' : 'Verify & Change Password'}
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setPasswordFlow('idle');
                        setPwdForm({ currentPassword: '', emailOtp: '', phoneOtp: '', newPassword: '' });
                        setPwdError('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Widgets */}
        <div className="profile-grid-right">
          {/* Account Security Summary Card */}
          <div className="card profile-card-panel">
            <div className="profile-widget-head">
              <h3 className="profile-card-title">Account Security</h3>
              <span className="profile-secure-badge">
                <Icon name="checkCircle" size={13} /> Protected
              </span>
            </div>
            <p className="profile-card-sub" style={{ marginBottom: 16 }}>
              Overview of your authentication settings and session protections.
            </p>

            <div className="profile-sec-items-list">
              {/* Password Row */}
              <button
                type="button"
                className="profile-sec-item-btn"
                onClick={() => handleTabChange('password')}
                title="Change account password"
              >
                <div className="profile-sec-item-icon-box lock-box">
                  <Icon name="lock" size={17} />
                </div>
                <div className="profile-sec-item-details">
                  <strong className="profile-sec-item-title">Password</strong>
                  <span className="profile-sec-item-desc">
                    {user.passwordChangedAt
                      ? `Last changed on ${formatDate(user.passwordChangedAt)}`
                      : 'Initial password set'}
                  </span>
                </div>
                <Icon name="chevronRight" size={15} className="profile-sec-item-arrow" />
              </button>

              {/* Two-Factor Authentication Row */}
              <div className="profile-sec-item-btn static">
                <div className="profile-sec-item-icon-box shield-box">
                  <Icon name="shield" size={17} />
                </div>
                <div className="profile-sec-item-details">
                  <strong className="profile-sec-item-title">Two-Factor Authentication</strong>
                  <span className="profile-sec-item-desc">Email & SMS OTP verification active</span>
                </div>
                <span className="profile-sec-status-pill green">Enabled</span>
              </div>

              {/* Login Activity Row */}
              <div className="profile-sec-item-btn static">
                <div className="profile-sec-item-icon-box clock-box">
                  <Icon name="clock" size={17} />
                </div>
                <div className="profile-sec-item-details">
                  <strong className="profile-sec-item-title">Login Activity</strong>
                  <span className="profile-sec-item-desc">Current session verified and active</span>
                </div>
                <span className="profile-sec-status-pill blue">Active</span>
              </div>
            </div>
          </div>

          {/* Need Help? Card */}
          <div className="card profile-help-panel">
            <div className="profile-help-circle-icon">
              <Icon name="help" size={24} />
            </div>
            <h4 className="profile-help-heading">Need Help?</h4>
            <p className="profile-help-text">
              Have questions or need assistance with your account permissions? Our support team is available to assist you.
            </p>
            <a
              href="mailto:support@exclusivepoms.com?subject=ExclusivePOMS%20Account%20Support"
              className="btn profile-contact-support-btn"
            >
              <Icon name="mail" size={15} />
              <span>Contact Support</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
