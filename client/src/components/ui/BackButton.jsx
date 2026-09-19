/**
 * KhanNetra — BackButton
 * Uses browser history (navigate(-1)).
 * Falls back to /dashboard if there is no history entry to go back to.
 * Theme-aware: uses CSS variables so it looks right in both light and dark mode.
 */
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

export default function BackButton({ label = 'Back', fallback = '/dashboard', className = '' }) {
  const navigate = useNavigate();

  const handleBack = () => {
    // window.history.length > 2 means there is a real previous page
    // (length === 1 means this is the first page ever loaded in this tab)
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  return (
    <button
      onClick={handleBack}
      aria-label="Go back"
      title="Go back"
      className={`inline-flex items-center gap-1.5 text-sm font-semibold
        px-3 py-1.5 rounded-lg transition-all duration-150
        border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
        focus-visible:ring-yellow-400
        ${className}`}
      style={{
        color:           'var(--text-secondary)',
        backgroundColor: 'var(--bg-card)',
        borderColor:     'var(--border)',
        focusRingColor:  'var(--accent)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color           = 'var(--hover-accent)';
        e.currentTarget.style.borderColor     = 'var(--hover-accent-border)';
        e.currentTarget.style.backgroundColor = 'var(--hover-accent-bg)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color           = 'var(--text-secondary)';
        e.currentTarget.style.borderColor     = 'var(--border)';
        e.currentTarget.style.backgroundColor = 'var(--bg-card)';
      }}
    >
      <FiArrowLeft size={14} className="shrink-0"/>
      {label}
    </button>
  );
}
