/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* ── Coal / Graphite – primary neutrals ─────────────────────── */
        coal: {
          50:  '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          300: '#dee2e6',
          400: '#adb5bd',
          500: '#6c757d',
          600: '#495057',
          700: '#343a40',
          800: '#212529',
          900: '#161b22',
          950: '#0d1117',
        },
        /* ── Amber / Gold – accent highlights ───────────────────────── */
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        /* ── Safety Orange ───────────────────────────────────────────── */
        safety: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        /* ── Danger / Alert ─────────────────────────────────────────── */
        danger: {
          50:  '#fef2f2',
          100: '#fee2e2',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        /* ── Success / Safe ─────────────────────────────────────────── */
        success: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        /* ── Cyan / Info ────────────────────────────────────────────── */
        info: {
          50:  '#ecfeff',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        /* ── Legacy "primary" kept so old imports don't break ────────── */
        primary: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        /* ── Gov dark panel ─────────────────────────────────────────── */
        gov: {
          700: '#1a2332',
          800: '#131b27',
          900: '#0c1219',
          950: '#070c12',
        },
        /* ── Navy — deep professional blue ───────────────────────────── */
        navy: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#1e3a5f',
          600: '#172d4d',
          700: '#0f2747',
          800: '#0a1c33',
          900: '#060f1e',
        },
        /* ── Teal — AI/intelligence accent ───────────────────────────── */
        teal: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0f9d8a',
          700: '#0d8a79',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.3)',
        hover: '0 4px 12px rgba(0,0,0,.5)',
        glow:  '0 0 20px rgba(245,158,11,.15)',
        'glow-danger': '0 0 20px rgba(239,68,68,.15)',
        inner: 'inset 0 2px 4px rgba(0,0,0,.3)',
        panel: '0 8px 32px rgba(0,0,0,.4)',
      },
      backgroundImage: {
        'coal-gradient':   'linear-gradient(135deg,#161b22 0%,#1c2333 50%,#161b22 100%)',
        'amber-gradient':  'linear-gradient(135deg,#d97706 0%,#f59e0b 50%,#d97706 100%)',
        'panel-gradient':  'linear-gradient(180deg,#1c2333 0%,#161b22 100%)',
        'danger-gradient': 'linear-gradient(135deg,#b91c1c 0%,#dc2626 100%)',
        'success-gradient':'linear-gradient(135deg,#15803d 0%,#16a34a 100%)',
        'mesh': 'radial-gradient(circle at 20% 20%, rgba(245,158,11,.05) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(249,115,22,.04) 0%, transparent 60%)',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':     'fadeIn 0.3s ease-out',
        'slide-up':    'slideUp 0.3s ease-out',
        'glow-pulse':  'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        glowPulse: { '0%,100%': { boxShadow: '0 0 8px rgba(245,158,11,.3)' }, '50%': { boxShadow: '0 0 20px rgba(245,158,11,.6)' } },
      },
      borderRadius: {
        xl: '12px', '2xl': '16px', '3xl': '20px',
      },
    },
  },
  plugins: [],
};
