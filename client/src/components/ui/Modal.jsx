/**
 * KhanNetra — Modal
 * Theme-aware: uses CSS variables so it renders correctly in both light and dark mode.
 * Close button and backdrop get yellow hover consistent with global theme.
 */
import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import clsx from 'clsx';

const SIZES = { sm:'max-w-md', md:'max-w-2xl', lg:'max-w-4xl', xl:'max-w-6xl', full:'max-w-[95vw]' };

export default function Modal({ isOpen, onClose, title, children, size = 'md', footer }) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(10,15,30,.65)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative w-full flex flex-col max-h-[90vh] animate-slide-up',
          SIZES[size],
        )}
        style={{
          backgroundColor: 'var(--bg-card)',
          border:          '1px solid var(--border)',
          borderRadius:    '18px',
          boxShadow:       'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2
            className="text-base font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h2>

          {/* Close button — yellow on hover */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all duration-150"
            style={{ color: 'var(--text-muted)', backgroundColor: 'transparent' }}
            onMouseEnter={e => {
              e.currentTarget.style.color           = 'var(--hover-accent)';
              e.currentTarget.style.backgroundColor = 'var(--hover-accent-bg)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color           = 'var(--text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Close"
          >
            <FiX size={16}/>
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-6 py-5"
          style={{ color: 'var(--text-primary)' }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="px-6 py-4 shrink-0"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
