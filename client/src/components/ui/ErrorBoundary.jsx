  /**
 * KhanNetra — Global Error Boundary
 * Catches any React render crash and shows a useful recovery UI
 * instead of a completely blank white page.
 * Uses a class component because error boundaries require lifecycle methods.
 */
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console in development; in production swap for a real error tracker
    console.error('[KhanNetra] Uncaught render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error }   = this.state;
    const isDev       = import.meta.env.DEV;
    const isRefError  = error?.name === 'ReferenceError';
    const isTypeError = error?.name === 'TypeError';

    return (
      <div
        style={{
          minHeight:       '100vh',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          background:      'var(--bg-base, #F8FAFC)',
          padding:         '24px',
          fontFamily:      'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth:     '480px',
            width:        '100%',
            background:   'var(--bg-card, #fff)',
            border:       '1px solid var(--border, #E2E8F0)',
            borderRadius: '20px',
            padding:      '32px',
            textAlign:    'center',
            boxShadow:    '0 4px 24px rgba(0,0,0,.08)',
          }}
        >
          {/* Icon */}
          <div style={{
            width:'56px', height:'56px', borderRadius:'14px',
            background:'rgba(239,68,68,.10)', border:'1px solid rgba(239,68,68,.25)',
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            marginBottom:'20px',
          }}>
            <svg width="26" height="26" fill="none" stroke="#ef4444" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          {/* Heading */}
          <h2 style={{ color:'var(--text-primary,#0F2747)', fontWeight:800, fontSize:'18px', margin:'0 0 8px' }}>
            Something went wrong
          </h2>
          <p style={{ color:'var(--text-secondary,#64748B)', fontSize:'14px', lineHeight:1.6, margin:'0 0 24px' }}>
            {isRefError || isTypeError
              ? 'A component failed to load. This may be a temporary issue.'
              : 'Unable to display this section of the application.'}
          </p>

          {/* Dev-only error details */}
          {isDev && error && (
            <pre style={{
              textAlign:'left', background:'#1E293B', color:'#f87171',
              borderRadius:'10px', padding:'14px', fontSize:'11px',
              overflowX:'auto', marginBottom:'20px', whiteSpace:'pre-wrap',
              wordBreak:'break-word',
            }}>
              {error.name}: {error.message}
            </pre>
          )}

          {/* Action buttons */}
          <div style={{ display:'flex', gap:'10px', justifyContent:'center', flexWrap:'wrap' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding:'10px 20px', borderRadius:'10px', fontWeight:600,
                fontSize:'14px', cursor:'pointer', border:'none',
                background:'var(--accent,#D99A00)', color:'#fff',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding:'10px 20px', borderRadius:'10px', fontWeight:600,
                fontSize:'14px', cursor:'pointer',
                background:'transparent', color:'var(--text-secondary,#64748B)',
                border:'1px solid var(--border,#E2E8F0)',
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard'; }}
              style={{
                padding:'10px 20px', borderRadius:'10px', fontWeight:600,
                fontSize:'14px', cursor:'pointer',
                background:'transparent', color:'var(--text-secondary,#64748B)',
                border:'1px solid var(--border,#E2E8F0)',
              }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
