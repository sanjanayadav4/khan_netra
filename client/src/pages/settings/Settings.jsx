/**
 * KhanNetra -- Settings
 * Clean white settings page with sections:
 *   Appearance | Notifications | Account | About
 * All controls connect to existing functionality.
 * No backend changes required.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiSun, FiMoon, FiMonitor, FiBell, FiShield, FiUser,
  FiInfo, FiChevronRight, FiCheck, FiArrowLeft, FiToggleLeft, FiToggleRight,
} from 'react-icons/fi';
import { useTheme } from '../../context/ThemeContext';
import useAuthStore from '../../store/authStore';
import BackButton from '../../components/ui/BackButton';
import toast from 'react-hot-toast';
import clsx from 'clsx';

/* ─── Preference helpers (localStorage) ──────────────────────────────────── */
const PREF_KEY = 'kn_settings';
const defaultPrefs = {
  notif_critical:   true,
  notif_deadline:   true,
  notif_inspection: true,
  notif_sound:      false,
  compact_sidebar:  false,
  show_live_dot:    true,
};
const readPrefs = () => {
  try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; }
  catch { return { ...defaultPrefs }; }
};
const savePrefs = (p) => {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
};

/* ─── Reusable section wrapper ────────────────────────────────────────────── */
function Section({ title, icon: Icon, children }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg-card)',
      border:          '1px solid var(--border)',
      borderRadius:    '16px',
      overflow:        'hidden',
      boxShadow:       'var(--shadow-card)',
    }}>
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-card-hover)' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          backgroundColor: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} style={{ color: 'var(--accent)' }}/>
        </div>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ─── Row types ───────────────────────────────────────────────────────────── */
function SettingRow({ label, description, control, last }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4"
      style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="transition-all duration-200"
      style={{ color: value ? 'var(--accent)' : 'var(--text-muted)', fontSize: 0 }}
      aria-label={value ? 'Disable' : 'Enable'}
    >
      {value
        ? <FiToggleRight size={28} style={{ color: 'var(--accent)' }}/>
        : <FiToggleLeft  size={28} style={{ color: 'var(--border-strong)' }}/>}
    </button>
  );
}

function LinkRow({ label, description, to, last }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-all duration-100"
      style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {description && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>
        )}
      </div>
      <FiChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
    </button>
  );
}

/* ─── Theme selector chips ────────────────────────────────────────────────── */
function ThemeChip({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl border transition-all duration-150"
      style={{
        backgroundColor: active ? 'var(--accent-bg)'     : 'var(--bg-card-hover)',
        borderColor:     active ? 'var(--accent)'        : 'var(--border)',
        color:           active ? 'var(--accent)'        : 'var(--text-muted)',
        minWidth: 72,
      }}
    >
      <Icon size={18}/>
      <span className="text-[11px] font-semibold">{label}</span>
      {active && <FiCheck size={11} style={{ color: 'var(--accent)', marginTop: -4 }}/>}
    </button>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { user }               = useAuthStore();
  const [prefs, setPrefs]      = useState(readPrefs);

  const updatePref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
    toast.success('Setting saved', { duration: 1500 });
  };

  const setTheme = (t) => {
    if (theme !== t) toggleTheme();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <BackButton/>

      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your preferences, appearance and account options</p>
      </div>

      {/* ── Appearance ── */}
      <Section title="Appearance" icon={FiSun}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Theme</p>
          <div className="flex gap-3 flex-wrap">
            <ThemeChip icon={FiSun}     label="Light"  active={theme === 'light'} onClick={() => setTheme('light')}/>
            <ThemeChip icon={FiMoon}    label="Dark"   active={theme === 'dark'}  onClick={() => setTheme('dark')}/>
            <ThemeChip icon={FiMonitor} label="System" active={false}             onClick={() => toast('System theme not yet supported — select Light or Dark')}/>
          </div>
        </div>
        <SettingRow
          label="Compact Sidebar"
          description="Reduce sidebar width to icon-only mode by default"
          control={<Toggle value={prefs.compact_sidebar}   onChange={v => updatePref('compact_sidebar', v)}/>}
        />
        <SettingRow
          label="Show Live Indicator"
          description="Display the live status dot in the navbar"
          control={<Toggle value={prefs.show_live_dot}     onChange={v => updatePref('show_live_dot', v)}/>}
          last
        />
      </Section>

      {/* ── Notifications ── */}
      <Section title="Notifications" icon={FiBell}>
        <SettingRow
          label="Critical Alerts"
          description="Receive alerts for critical safety incidents and violations"
          control={<Toggle value={prefs.notif_critical}   onChange={v => updatePref('notif_critical', v)}/>}
        />
        <SettingRow
          label="Compliance Deadlines"
          description="Get notified when compliance deadlines are approaching"
          control={<Toggle value={prefs.notif_deadline}   onChange={v => updatePref('notif_deadline', v)}/>}
        />
        <SettingRow
          label="Inspection Reminders"
          description="Remind me when inspections are scheduled"
          control={<Toggle value={prefs.notif_inspection} onChange={v => updatePref('notif_inspection', v)}/>}
        />
        <SettingRow
          label="Sound"
          description="Play a sound for high-priority notifications"
          control={<Toggle value={prefs.notif_sound}      onChange={v => updatePref('notif_sound', v)}/>}
          last
        />
      </Section>

      {/* ── Account ── */}
      <Section title="Account & Security" icon={FiShield}>
        <SettingRow
          label="Signed in as"
          description={`${user?.email}  ·  ${user?.role?.replace(/_/g, ' ')}`}
          control={null}
        />
        <LinkRow label="Edit Profile"       description="Update your name, designation and department" to="/profile?tab=profile"/>
        <LinkRow label="Change Photo"       description="Upload or update your profile picture"        to="/profile?tab=photo"/>
        <LinkRow label="Change Password"    description="Update your account password"                 to="/profile?tab=password" last/>
      </Section>

      {/* ── About ── */}
      <Section title="About KhanNetra" icon={FiInfo}>
        <SettingRow label="Application"   description="KhanNetra DGMS — AI-powered Coal Mine Governance" control={null}/>
        <SettingRow label="Version"       description="v1.0.0  ·  SIH Problem Statement PC-24"           control={null}/>
        <SettingRow label="Ministry"      description="Ministry of Coal, Government of India"            control={null}/>
        <SettingRow label="Regulator"     description="Directorate General of Mines Safety (DGMS)"       control={null} last/>
      </Section>
    </div>
  );
}
