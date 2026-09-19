/**
 * KhanNetra DGMS — Unauthorized Access Page
 * Shown when a logged-in user tries to access a route their role doesn't permit.
 * Backend will also return 403 for any direct API calls — this is the frontend companion.
 */
import { useNavigate } from 'react-router-dom';
import { FiShield, FiArrowLeft, FiHome } from 'react-icons/fi';
import useAuthStore from '../store/authStore';
import { ROLE_LABEL } from '../utils/permissions';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const roleLabel = ROLE_LABEL[user?.role] || user?.role || 'Unknown';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center"
      style={{ backgroundColor: 'var(--bg-base)' }}>

      {/* Icon */}
      <div style={{
        width: 80, height: 80, borderRadius: 20, marginBottom: 24,
        background: 'rgba(239,68,68,.10)', border: '2px solid rgba(239,68,68,.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FiShield size={36} style={{ color: '#dc2626' }}/>
      </div>

      {/* Heading */}
      <h1 style={{ color: 'var(--text-primary)', fontWeight: 900, fontSize: '1.75rem',
                   margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        Access Denied
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: 420,
                  lineHeight: 1.65, margin: '0 0 8px' }}>
        You do not have permission to access this module.
      </p>

      {/* Role info */}
      {user && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 999, margin: '8px 0 28px',
          background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                         textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your role:
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            {roleLabel}
          </span>
        </div>
      )}

      {/* Explanation */}
      <div style={{
        maxWidth: 440, padding: '16px 20px', borderRadius: 14, marginBottom: 28,
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          This area requires elevated permissions. If you believe this is an error,
          please contact your system administrator or DGMS authority to request access.
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => navigate(-1)}
          className="btn-outline btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FiArrowLeft size={14}/> Go Back
        </button>
        <button
          onClick={() => navigate('/dashboard', { replace: true })}
          className="btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FiHome size={14}/> Dashboard
        </button>
      </div>

      {/* Footer note */}
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 32,
                  opacity: 0.6 }}>
        KhanNetra DGMS · Unauthorized access attempts are logged
      </p>
    </div>
  );
}
