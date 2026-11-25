import { useState, useRef, useEffect } from 'react';
import api, { errMessage, uploadFile, assetUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

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

export default function ProfileModal({ onComplete }) {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    designation: user?.designation || '',
  });
  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setForm({
        fullName: user.fullName || '',
        phone: user.phone || '',
        designation: user.designation || '',
      });
    }
  }, [user]);

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
        setSuccess('Profile photo updated!');
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
        phone: form.phone.trim(),
        designation: form.designation.trim(),
      });

      updateUser({
        fullName: data.data.full_name,
        phone: data.data.phone,
        designation: data.data.designation,
        profileUpdatedAt: data.data.profile_updated_at,
      });

      setSuccess('Profile completed! Welcome to BSC Exclusive POMS.');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 1500);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  const avatarUrl = user.profilePhotoUrl ? assetUrl(user.profilePhotoUrl) : null;

  return (
    <Modal
      title="Complete Your Profile"
      onClose={onComplete}
      wide
      showClose={false}
    >
      <div style={{ padding: '8px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="profile-avatar-wrapper" style={{ display: 'inline-flex', position: 'relative', marginBottom: 16 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={user.fullName} className="profile-hero-avatar-img" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent)' }} />
            ) : (
              <div className="profile-hero-avatar-fallback" style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 36, fontWeight: 800 }}>
                {initials(user.fullName || user.email)}
              </div>
            )}
            <button
              type="button"
              className="profile-camera-badge-btn"
              title="Change profile photo"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                border: '3px solid #fff',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
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

          <div className="profile-hero-info" style={{ textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700 }}>{user.fullName || 'User Profile'}</h2>
            <span className="chip" style={{ fontSize: 13, background: '#eef7f2', color: '#0f4c2e' }}>{user.isSuperAdmin ? 'Super Admin' : roleLabels(user.roles) || 'User'}</span>
          </div>
        </div>

        {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="alert ok" style={{ marginBottom: 16 }}>{success}</div>}

        <form onSubmit={handleSaveProfile}>
          <div className="fields-2">
            <div className="field">
              <span className="field-label">Full Name <span style={{ color: 'var(--danger)' }}>*</span></span>
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
                  autoFocus
                />
              </div>
              <span className="field-hint">Your full name as displayed on orders, reports, and team activity.</span>
            </div>

            <div className="field">
              <span className="field-label">Phone Number</span>
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
          </div>

          <div className="field">
            <span className="field-label">Designation</span>
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

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="submit" className="btn primary profile-save-btn" disabled={saving || !form.fullName?.trim()} style={{ minWidth: 160 }}>
              {saving ? 'Completing Profile…' : 'Complete Profile & Continue'}
            </button>
          </div>
        </form>

        <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 16 }}>
          Your profile is incomplete. Please fill in the details above to continue.
        </div>
      </div>
    </Modal>
  );
}