/**
 * KhanNetra — Top Navigation Bar
 * Layout:
 *   LEFT  : [☰ Menu] [Logo] [Role badge]
 *   CENTRE: [Primary nav links] — role-filtered
 *   RIGHT : [🔍 Search] [Live] [🔔 Bell] [☀/🌙 Theme] [Profile]
 *
 * Search: clicking 🔍 expands a compact search input that shows
 * grouped results from /api/v1/search — no layout shift.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  FiMenu, FiBell, FiLogOut, FiChevronDown,
  FiMap, FiCheckSquare, FiCpu, FiTarget, FiCamera,
  FiSun, FiMoon, FiSettings, FiExternalLink, FiImage, FiShield,
  FiSearch, FiX, FiUser,
} from 'react-icons/fi';
import useAuthStore from '../../store/authStore';
import { useTheme } from '../../context/ThemeContext';
import { notificationsApi, searchApi } from '../../services/api';
import OfflineIndicator from '../ui/OfflineIndicator';
import { timeAgo } from '../../utils/helpers';
import { ROLE_LABEL, NAVBAR_PERMISSIONS } from '../../utils/permissions';
import clsx from 'clsx';

/* ── Primary nav ─────────────────────────────────────────────── */
const ALL_PRIMARY_NAV = [
  { to: '/mines',      label: 'Mine Map',    short: 'Map',    icon: FiMap         },
  { to: '/attendance', label: 'Attendance',  short: 'Att.',   icon: FiCheckSquare },
  { to: '/ai/chat',    label: 'AI Chat',     short: 'AI',     icon: FiCpu         },
  { to: '/ai/risk',    label: 'Risk',        short: 'Risk',   icon: FiTarget      },
  { to: '/vision',     label: 'PPE Vision',  short: 'Vision', icon: FiCamera      },
];

const NOTIF_DOT = {
  alert:'bg-red-500', incident:'bg-red-500', violation:'bg-orange-500',
  warning:'bg-amber-500', deadline:'bg-amber-500',
  info:'bg-sky-500', success:'bg-green-500',
};

/* ── Search result type colours ─────────────────────────────── */
const TYPE_CFG = {
  Mine:        { icon:'⛏',  color:'#f59e0b' },
  Worker:      { icon:'👷', color:'#06b6d4' },
  Contractor:  { icon:'🏗', color:'#8b5cf6' },
  Inspection:  { icon:'📋', color:'#3b82f6' },
  Incident:    { icon:'🚨', color:'#ef4444' },
  Compliance:  { icon:'✅', color:'#22c55e' },
  Document:    { icon:'📄', color:'#64748b' },
  Violation:   { icon:'⚠️', color:'#f97316' },
  'Audit Log': { icon:'🔒', color:'#94a3b8' },
  Alert:       { icon:'🔔', color:'#dc2626' },
};

/* ── Status dot map ──────────────────────────────────────────── */
const STATUS_DOT = {
  active:'bg-green-500', operational:'bg-green-500',
  open:'bg-red-500', critical:'bg-red-500', warning:'bg-amber-500',
  resolved:'bg-gray-400', closed:'bg-gray-400',
  compliant:'bg-green-500', non_compliant:'bg-red-500', pending:'bg-amber-500',
};

/* ── localStorage avatar ─────────────────────────────────────── */
const getStoredAvatar = (userId) => {
  if (!userId) return null;
  try { return localStorage.getItem(`kn_avatar_${userId}`) || null; } catch { return null; }
};

/* ════════════════════════════════════════════════════════════════
   COMPACT SEARCH BAR
   Renders as a magnifier icon. Click → input expands inline.
   Results appear in a dropdown below.
════════════════════════════════════════════════════════════════ */
function SearchBar({ isDark }) {
  const navigate  = useNavigate();
  const [open,     setOpen]     = useState(false);
  const [q,        setQ]        = useState('');
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [selIdx,   setSelIdx]   = useState(-1);
  const inputRef  = useRef(null);
  const wrapRef   = useRef(null);
  const timerRef  = useRef(null);

  /* Group results by type */
  const grouped = results.reduce((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  /* Debounced search */
  const doSearch = useCallback(async (val) => {
    if (!val || val.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await searchApi.search(val, 5);
      setResults(r.data || []);
    } catch {
      setResults([]);
    } finally { setLoading(false); }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQ(val); setSelIdx(-1);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 280);
  };

  const openSearch = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const closeSearch = () => {
    setOpen(false); setQ(''); setResults([]); setLoading(false);
  };

  const navigateTo = (item) => {
    closeSearch();
    navigate(item.path || item.module || '/dashboard');
  };

  /* Keyboard nav */
  const handleKey = (e) => {
    const flat = results;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(s => Math.min(s + 1, flat.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(s => Math.max(s - 1, -1)); }
    if (e.key === 'Escape')    { closeSearch(); }
    if (e.key === 'Enter' && selIdx >= 0 && flat[selIdx]) navigateTo(flat[selIdx]);
  };

  /* Close on outside click */
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) closeSearch(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* Global keyboard shortcut: Ctrl+K or / */
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))) {
        e.preventDefault(); openSearch();
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const btnCls = clsx(
    'relative flex items-center justify-center p-2 rounded-xl transition-all duration-150',
    isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
           : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
  );

  let flatIdx = 0;

  return (
    <div ref={wrapRef} className="relative flex items-center">
      {/* Collapsed: just the icon */}
      {!open && (
        <button onClick={openSearch} className={btnCls} title="Search (Ctrl+K)">
          <FiSearch size={17}/>
        </button>
      )}

      {/* Expanded: input */}
      {open && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-input)', border: '1.5px solid var(--accent)',
          borderRadius: 12, padding: '4px 10px', width: 260,
          boxShadow: '0 0 0 3px var(--hover-accent-ring)',
        }}>
          <FiSearch size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
          <input
            ref={inputRef}
            value={q}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder="Search mines, workers, incidents…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 12,
            }}
          />
          {loading && (
            <div style={{ width: 13, height: 13, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', flexShrink: 0, animation: 'kn-spin .6s linear infinite' }}/>
          )}
          {!loading && (
            <button onClick={closeSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center' }}>
              <FiX size={13}/>
            </button>
          )}
        </div>
      )}

      {/* Results dropdown */}
      {open && q.length >= 2 && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 9999, minWidth: 320,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: 'var(--shadow-lg)', maxHeight: 400, overflowY: 'auto',
        }}>
          {!loading && results.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No results for <strong style={{ color: 'var(--text-secondary)' }}>"{q}"</strong>
            </div>
          ) : (
            <>
              {Object.entries(grouped).map(([type, items]) => {
                const cfg = TYPE_CFG[type] || { icon: '📁', color: 'var(--text-muted)' };
                return (
                  <div key={type}>
                    <div style={{ padding: '8px 14px 3px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 11 }}>{cfg.icon}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: cfg.color }}>{type}</span>
                    </div>
                    {items.map((item) => {
                      const idx = flatIdx++;
                      const isActive = idx === selIdx;
                      const dot = item.status ? STATUS_DOT[item.status] : null;
                      return (
                        <button
                          key={item.id + idx}
                          onClick={() => navigateTo(item)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8,
                            padding: '7px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                            background: isActive ? 'var(--bg-card-hover)' : 'transparent',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; setSelIdx(idx); }}
                          onMouseLeave={e => { if (selIdx !== idx) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span style={{ fontSize: 15, lineHeight: '18px', flexShrink: 0 }}>{cfg.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.name}
                              </span>
                              {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0 }} className={dot}/>}
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.subtitle}{item.date ? '  ·  ' + item.date.slice(0,10) : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <div style={{ padding: '6px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes kn-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN NAVBAR
════════════════════════════════════════════════════════════════ */
export default function Navbar({ onMenuToggle }) {
  const { user, logout }       = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const navigate               = useNavigate();
  const isDark                 = theme === 'dark';
  const userRole               = user?.role || '';

  const PRIMARY_NAV = ALL_PRIMARY_NAV.filter(({ to }) => {
    const allowed = NAVBAR_PERMISSIONS[to];
    return !allowed || allowed.includes(userRole);
  });

  const [notifs,        setNotifs]      = useState([]);
  const [unread,        setUnread]      = useState(0);
  const [showNotifs,    setShowNotifs]  = useState(false);
  const [showProfile,   setShowProfile] = useState(false);
  const [loadingNotifs, setLoadingN]    = useState(false);
  const [avatar,        setAvatar]      = useState(() => getStoredAvatar(user?.id));

  const notifsRef  = useRef(null);
  const profileRef = useRef(null);

  /* Avatar sync */
  useEffect(() => {
    setAvatar(getStoredAvatar(user?.id));
    const r = () => setAvatar(getStoredAvatar(user?.id));
    window.addEventListener('kn_avatar_updated', r);
    return () => window.removeEventListener('kn_avatar_updated', r);
  }, [user?.id]);

  /* Notification count polling */
  useEffect(() => {
    const fetchCount = async () => {
      try { const r = await notificationsApi.getUnreadCount(); setUnread(r.data?.count ?? r.count ?? 0); }
      catch {}
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => clearInterval(t);
  }, []);

  /* Close dropdowns on outside click */
  useEffect(() => {
    const h = (e) => {
      if (notifsRef.current  && !notifsRef.current.contains(e.target))  setShowNotifs(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openNotifs = async () => {
    setShowNotifs(v => !v);
    if (!showNotifs) {
      setLoadingN(true);
      try { const r = await notificationsApi.getAll({ limit: 8, is_read: false }); setNotifs(r.data || []); }
      catch {} finally { setLoadingN(false); }
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };
  const goTo = (path) => { setShowProfile(false); navigate(path); };

  const dropStyle = {
    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '14px', boxShadow: 'var(--shadow-lg)',
  };

  const iconBtn = clsx(
    'relative p-2 rounded-xl transition-all duration-150',
    isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
           : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
  );

  const DropRow = ({ icon: Icon, label, onClick, danger }) => (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
      style={{ color: danger ? '#DC2626' : 'var(--text-secondary)' }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(220,38,38,.06)' : 'var(--bg-card-hover)'; if (!danger) e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = danger ? '#DC2626' : 'var(--text-secondary)'; }}>
      <Icon size={14} className="shrink-0"/>
      {label}
    </button>
  );

  const AvatarEl = ({ size }) => {
    const r = size < 36 ? '10px' : '14px';
    return avatar ? (
      <img src={avatar} alt="avatar" style={{ width: size, height: size, borderRadius: r, objectFit: 'cover', border: '1.5px solid var(--accent-border)', flexShrink: 0 }}/>
    ) : (
      <div style={{ width: size, height: size, borderRadius: r, flexShrink: 0, backgroundColor: 'var(--accent-bg)', border: '1.5px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 700, fontSize: size * 0.43, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {user?.full_name?.[0]?.toUpperCase() || 'U'}
      </div>
    );
  };

  return (
    <header className="h-14 flex items-center justify-between px-3 sm:px-5 sticky top-0 z-30 shrink-0"
      style={{ backgroundColor: 'var(--bg-navbar)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow-nav)' }}>

      {/* ── LEFT: hamburger + logo + role badge ── */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onMenuToggle} className={iconBtn} aria-label="Toggle sidebar">
          <FiMenu size={18}/>
        </button>

        <Link to="/dashboard" className="flex items-center gap-2 select-none">
          <img src="/khannetra-logo.svg" alt="KhanNetra"
            style={{ width: 30, height: 30, filter: 'drop-shadow(0 0 6px rgba(217,119,6,.45))' }}/>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>KhanNetra</span>
            <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>DGMS</span>
          </div>
        </Link>

        <div className="hidden md:block w-px h-5 mx-1" style={{ backgroundColor: 'var(--border)' }}/>

        {userRole && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl"
            style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }}/>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
              {ROLE_LABEL[userRole] || userRole}
            </span>
            {(user?.mine_name || user?.mine_db_name) && (
              <>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>·</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.mine_name || user.mine_db_name}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── CENTRE: primary nav links ── */}
      <nav className="flex items-center gap-0.5 flex-1 justify-center overflow-x-auto mx-2" style={{ scrollbarWidth: 'none' }}>
        {PRIMARY_NAV.map(({ to, label, short, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-[12px] sm:text-[13px] font-medium whitespace-nowrap transition-all duration-150',
              isActive
                ? 'text-white font-semibold shadow-sm'
                : isDark ? 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
                         : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            )}
            style={({ isActive }) => isActive ? { backgroundColor: 'var(--accent)' } : {}}>
            <Icon size={14} className="shrink-0"/>
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{short}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── RIGHT: search + live + bell + theme + profile ── */}
      <div className="flex items-center gap-0.5 shrink-0">

        {/* Compact live indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2 mr-1">
          <span className="status-dot-green"/>
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Live</span>
        </div>

        <div className="hidden sm:block mr-1"><OfflineIndicator compact/></div>

        {/* 🔍 Search */}
        <SearchBar isDark={isDark}/>

        {/* 🔔 Notifications */}
        <div ref={notifsRef} className="relative">
          <button onClick={openNotifs} className={iconBtn} aria-label="Notifications">
            <FiBell size={17}/>
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                style={{ backgroundColor: '#DC2626' }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-12 w-80 z-50 overflow-hidden animate-slide-up" style={dropStyle}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Notifications
                  {unread > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: 'var(--accent)' }}>{unread}</span>}
                </span>
                <Link to="/notifications" onClick={() => setShowNotifs(false)}
                  className="text-[11px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  View all <FiExternalLink size={10}/>
                </Link>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {loadingNotifs ? (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}/>
                  </div>
                ) : notifs.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-2">
                    <FiBell size={20} style={{ color: 'var(--text-muted)' }}/>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>All caught up!</p>
                  </div>
                ) : notifs.map(n => (
                  <Link to="/notifications" key={n.id} onClick={() => setShowNotifs(false)}
                    className="flex items-start gap-3 px-4 py-3 transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                    <span className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0', NOTIF_DOT[n.type] || 'bg-slate-400')}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{n.message}</p>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{timeAgo(n.created_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ☀ / 🌙 Theme */}
        <button onClick={toggleTheme} className={iconBtn}
          aria-label={isDark ? 'Light mode' : 'Dark mode'} title={isDark ? 'Light mode' : 'Dark mode'}>
          {isDark ? <FiSun size={16} style={{ color: '#FCD34D' }}/> : <FiMoon size={16}/>}
        </button>

        {/* 👤 Profile */}
        <div ref={profileRef} className="relative ml-0.5">
          <button onClick={() => setShowProfile(v => !v)}
            className={clsx('flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all duration-150',
              isDark ? 'hover:bg-white/8' : 'hover:bg-slate-100')}>
            <AvatarEl size={28}/>
            <div className="hidden md:block text-left leading-none">
              <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {user?.full_name?.split(' ')[0]}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {ROLE_LABEL[user?.role] || user?.role}
              </p>
            </div>
            <FiChevronDown size={12} className="hidden md:block" style={{ color: 'var(--text-muted)' }}/>
          </button>

          {showProfile && (
            <div className="absolute right-0 top-12 w-60 z-50 overflow-hidden animate-slide-up" style={dropStyle}>
              <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <AvatarEl size={40}/>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{user?.full_name}</p>
                  <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-1 inline-block"
                    style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
                    {ROLE_LABEL[user?.role] || user?.role}
                  </span>
                </div>
              </div>
              <div className="py-1">
                <DropRow icon={FiUser}     label="My Profile"   onClick={() => goTo('/profile?tab=profile')}/>
                <DropRow icon={FiImage}    label="Change Photo" onClick={() => goTo('/profile?tab=photo')}/>
                <DropRow icon={FiShield}   label="Security"     onClick={() => goTo('/profile?tab=password')}/>
                <DropRow icon={FiSettings} label="Settings"     onClick={() => goTo('/settings')}/>
                <div style={{ margin: '4px 12px', height: '1px', backgroundColor: 'var(--border)' }}/>
                <DropRow icon={FiLogOut}   label="Sign Out"     onClick={handleLogout} danger/>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
