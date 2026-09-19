/**
 * KhanNetra -- My Profile
 * Three tabs: Profile Info | Change Photo | Security
 * Photo stored in localStorage; dispatches kn_avatar_updated to refresh Navbar instantly.
 */
import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FiUser, FiLock, FiSave, FiCheckSquare, FiCamera,
  FiUpload, FiX, FiCheck, FiImage, FiShield,
} from 'react-icons/fi';
import { useForm } from 'react-hook-form';
import { authApi } from '../services/api';
import useAuthStore from '../store/authStore';
import { formatDate, ROLES } from '../utils/helpers';
import Badge from '../components/ui/Badge';
import BackButton from '../components/ui/BackButton';
import toast from 'react-hot-toast';
import clsx from 'clsx';

/* ── localStorage helpers ────────────────────────────────────────────────── */
const avatarKey = (id) => `kn_avatar_${id}`;
const readAvatar = (id) => { try { return localStorage.getItem(avatarKey(id)) || null; } catch { return null; } };
const writeAvatar = (id, dataUrl) => {
  try {
    if (dataUrl) localStorage.setItem(avatarKey(id), dataUrl);
    else         localStorage.removeItem(avatarKey(id));
    window.dispatchEvent(new Event('kn_avatar_updated'));
  } catch { toast.error('Storage full — could not save photo'); }
};

/* ── Card wrapper style ──────────────────────────────────────────────────── */
const cardCss = {
  backgroundColor: 'var(--bg-card)',
  border:          '1px solid var(--border)',
  borderRadius:    '16px',
  padding:         '1.5rem',
  boxShadow:       'var(--shadow-card)',
};

export default function Profile() {
  const { user, refreshUser } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'profile');

  useEffect(() => {
    const t = searchParams.get('tab') || 'profile';
    setTab(t);
  }, [searchParams]);

  const switchTab = (t) => { setTab(t); setSearchParams({ tab: t }); };

  const roleInfo = ROLES[user?.role];

  return (
    <div className="max-w-2xl space-y-5">
      <BackButton/>

      <div>
        <h1 className="page-title">My Profile</h1>
        <p className="page-subtitle">Manage your account, profile photo and security settings</p>
      </div>

      <ProfileCard user={user} roleInfo={roleInfo}/>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id: 'profile',  label: 'Profile Info', icon: FiUser    },
          { id: 'photo',    label: 'Photo',        icon: FiCamera  },
          { id: 'password', label: 'Security',     icon: FiShield  },
        ].map(t => (
          <button key={t.id} onClick={() => switchTab(t.id)}
            className={clsx('tab-item flex items-center gap-1.5', tab === t.id && 'active')}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {tab === 'profile'  && <ProfileInfoTab  user={user} refreshUser={refreshUser}/>}
      {tab === 'photo'    && <PhotoTab        user={user}/>}
      {tab === 'password' && <SecurityTab/>}
    </div>
  );
}

/* ── Summary card ────────────────────────────────────────────────────────── */
function ProfileCard({ user, roleInfo }) {
  const [av, setAv] = useState(() => readAvatar(user?.id));
  useEffect(() => {
    const h = () => setAv(readAvatar(user?.id));
    window.addEventListener('kn_avatar_updated', h);
    return () => window.removeEventListener('kn_avatar_updated', h);
  }, [user?.id]);

  return (
    <div style={{ ...cardCss, display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.25rem 1.5rem' }}>
      {/* Avatar */}
      {av ? (
        <img src={av} alt="avatar"
          style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover',
            border: '2px solid var(--accent-border)', flexShrink: 0 }}/>
      ) : (
        <div style={{ width: 64, height: 64, borderRadius: 14, flexShrink: 0,
          backgroundColor: 'var(--accent-bg)', border: '2px solid var(--accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--accent)', fontSize: 26, fontWeight: 800 }}>
            {user?.full_name?.[0]?.toUpperCase() || 'U'}
          </span>
        </div>
      )}
      {/* Text */}
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{user?.full_name}</h2>
        <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {roleInfo && <Badge color={roleInfo.color}>{roleInfo.label}</Badge>}
          {user?.designation && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {user.designation}</span>}
        </div>
      </div>
      {/* Last login */}
      <div className="hidden sm:block text-right shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Last Login</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{formatDate(user?.last_login) || '—'}</p>
      </div>
    </div>
  );
}

/* ── Profile Info tab ────────────────────────────────────────────────────── */
function ProfileInfoTab({ user, refreshUser }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: user || {} });
  const onSubmit = async (data) => {
    try { await authApi.updateProfile(data); await refreshUser(); toast.success('Profile updated'); }
    catch { toast.error('Failed to update profile'); }
  };
  return (
    <div style={cardCss}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group sm:col-span-2">
            <label className="label">Full Name</label>
            <input {...register('full_name')} className="input" placeholder="Your full name"/>
          </div>
          <div className="form-group">
            <label className="label">Email Address</label>
            <input value={user?.email || ''} disabled className="input cursor-not-allowed" style={{ opacity: .5 }}/>
          </div>
          <div className="form-group">
            <label className="label">Phone Number</label>
            <input {...register('phone')} className="input" placeholder="+91 XXXXX XXXXX"/>
          </div>
          <div className="form-group">
            <label className="label">Designation</label>
            <input {...register('designation')} className="input"/>
          </div>
          <div className="form-group">
            <label className="label">Department</label>
            <input {...register('department')} className="input"/>
          </div>
        </div>
        <div className="flex justify-end pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            <FiSave size={14}/> {isSubmitting ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Photo tab ───────────────────────────────────────────────────────────── */
function PhotoTab({ user }) {
  const fileRef   = useRef(null);
  const [preview, setPreview] = useState(() => readAvatar(user?.id));
  const [saved,   setSaved]   = useState(false);
  const [drag,    setDrag]    = useState(false);

  const loadFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file (JPG, PNG, WebP)'); return; }
    if (file.size > 2 * 1024 * 1024)    { toast.error('Image must be under 2 MB'); return; }
    const r = new FileReader();
    r.onload = (e) => { setPreview(e.target.result); setSaved(false); };
    r.readAsDataURL(file);
  };

  const onFileChange  = (e)  => loadFile(e.target.files?.[0]);
  const onDrop        = (e)  => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files?.[0]); };
  const onDragOver    = (e)  => { e.preventDefault(); setDrag(true); };
  const onDragLeave   = ()   => setDrag(false);

  const savePhoto = () => {
    if (!preview) return;
    writeAvatar(user?.id, preview);
    setSaved(true);
    toast.success('Profile photo saved');
  };
  const removePhoto = () => {
    setPreview(null); setSaved(false);
    writeAvatar(user?.id, null);
    toast.success('Photo removed');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={cardCss} className="space-y-5">
      <div>
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Profile Photo</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Upload a professional photo. Supported: JPG, PNG, WebP — max 2 MB.
          The photo is stored in your browser and shown in the navbar and profile pages.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-6">
        {/* Preview circle */}
        <div className="shrink-0">
          {preview ? (
            <img src={preview} alt="Preview"
              style={{ width: 100, height: 100, borderRadius: 16, objectFit: 'cover',
                border: '2px solid var(--border-strong)' }}/>
          ) : (
            <div style={{ width: 100, height: 100, borderRadius: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'var(--bg-card-hover)', border: '2px dashed var(--border-strong)' }}>
              <FiUser size={32} style={{ color: 'var(--text-muted)' }}/>
            </div>
          )}
        </div>

        {/* Drop zone + actions */}
        <div className="flex-1 w-full space-y-3">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={onFileChange}/>
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
            style={{
              border:          `2px dashed ${drag ? 'var(--accent)' : 'var(--border-strong)'}`,
              borderRadius:    '12px',
              padding:         '1.25rem',
              textAlign:       'center',
              cursor:          'pointer',
              backgroundColor: drag ? 'var(--accent-bg)' : 'var(--bg-card-hover)',
              transition:      'all .15s',
            }}
          >
            <FiUpload size={22} style={{ color: 'var(--accent)', margin: '0 auto 8px' }}/>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Click to upload or drag & drop
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>JPG, PNG or WebP — max 2 MB</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={savePhoto} disabled={!preview || saved} className="btn-primary btn-sm">
              {saved ? <><FiCheck size={13}/> Saved</> : <><FiImage size={13}/> Save Photo</>}
            </button>
            {preview && (
              <button onClick={removePhoto} className="btn-outline btn-sm">
                <FiX size={13}/> Remove Photo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 p-3 rounded-xl text-sm"
        style={{ backgroundColor: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
        <FiCheckSquare size={15} style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}/>
        <p style={{ color: 'var(--text-secondary)' }}>
          Your photo is saved locally in this browser. It is never sent to the server and
          is not visible to other users.
        </p>
      </div>
    </div>
  );
}

/* ── Security tab ────────────────────────────────────────────────────────── */
function SecurityTab() {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
  const onSubmit = async (data) => {
    if (data.new_password !== data.confirm_password) { toast.error('Passwords do not match'); return; }
    try { await authApi.changePassword(data); toast.success('Password changed successfully'); reset(); }
    catch { toast.error('Failed — check your current password'); }
  };
  return (
    <div style={cardCss} className="space-y-5">
      <div>
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Change Password</h3>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Use a strong password — at least 8 characters with numbers and symbols.
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="form-group">
          <label className="label">Current Password *</label>
          <input type="password" {...register('current_password', { required: true })} className="input" placeholder="Enter current password"/>
        </div>
        <div className="form-group">
          <label className="label">New Password *</label>
          <input type="password" {...register('new_password', { required: true, minLength: 8 })} className="input" placeholder="At least 8 characters"/>
        </div>
        <div className="form-group">
          <label className="label">Confirm New Password *</label>
          <input type="password" {...register('confirm_password', { required: true })} className="input" placeholder="Repeat new password"/>
        </div>
        <div className="flex justify-end pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            <FiLock size={14}/> {isSubmitting ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
