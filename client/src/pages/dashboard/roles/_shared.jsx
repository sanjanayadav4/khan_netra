/**
 * KhanNetra — Shared building blocks used by all role dashboards.
 * No fake data. No hardcoded numbers.
 */
import { Link } from 'react-router-dom';
import { FiArrowRight, FiAlertTriangle, FiInfo } from 'react-icons/fi';
import Badge from '../../../components/ui/Badge';
import ScoreBar from '../../../components/ui/ScoreBar';
import HeroCarousel from '../../../components/ui/HeroCarousel';
import { timeAgo, formatDate, scoreToColor } from '../../../utils/helpers';
import { ROLE_LABEL } from '../../../utils/permissions';
import clsx from 'clsx';

/* ── Role-colour map ───────────────────────────────────────────────── */
const ROLE_ACCENT = {
  admin:                '#dc2626',
  government_officer:   '#2563eb',
  mine_manager:         '#d97706',
  inspector:            '#16a34a',
  safety_officer:       '#ea580c',
  environment_officer:  '#0f766e',
  contractor:           '#7c3aed',
  mining_engineer:      '#0369a1',
  corporate_management: '#9f1239',
  prototype_tester:     '#4b5563',
};

/* ══════════════════════════════════════════════════════════════════════
   HeroBanner — compact two-column layout
   LEFT  (3/4 width): compact carousel + role/welcome overlay
   RIGHT (1/4 width): Quick Actions panel
   Responds to tablet/mobile by stacking vertically.
══════════════════════════════════════════════════════════════════════ */
export function HeroBanner({ user, tagline, actions }) {
  const role   = user?.role  || '';
  const accent = ROLE_ACCENT[role] || '#d97706';
  const label  = ROLE_LABEL[role]  || role;
  const name   = user?.full_name?.split(' ')[0] || 'User';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-5">

      {/* ── LEFT: compact carousel ──────────────────────────────── */}
      <div className="lg:col-span-3 relative rounded-2xl overflow-hidden"
        style={{ minHeight: 200, boxShadow: '0 4px 20px rgba(15,39,71,.16)' }}>

        {/* Carousel as background */}
        <HeroCarousel style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%', minHeight: 200,
          borderRadius: 0, boxShadow: 'none',
        }}/>

        {/* Overlay */}
        <div className="relative z-20 flex flex-col justify-between p-5 sm:p-6"
          style={{ minHeight: 200 }}>

          {/* Top row: role badge + date */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            {/* Role badge */}
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full"
              style={{ background:`${accent}25`, border:`1px solid ${accent}50`,
                       backdropFilter:'blur(8px)' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:accent,
                             display:'inline-block', boxShadow:`0 0 5px ${accent}` }}/>
              <span style={{ fontSize:10, fontWeight:700, color:'#fff',
                             textTransform:'uppercase', letterSpacing:'0.07em' }}>
                {label}
              </span>
              {(user?.mine_name || user?.mine_db_name) && (
                <>
                  <span style={{ color:'rgba(255,255,255,.45)', fontSize:9 }}>·</span>
                  <span style={{ fontSize:10, fontWeight:600,
                                 color:'rgba(255,255,255,.85)',
                                 maxWidth:130, overflow:'hidden',
                                 textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {user.mine_name || user.mine_db_name}
                  </span>
                </>
              )}
            </div>

            {/* Date pill */}
            <div style={{ padding:'7px 12px', borderRadius:10, textAlign:'right',
              background:'rgba(255,255,255,.10)', border:'1px solid rgba(255,255,255,.18)',
              backdropFilter:'blur(10px)' }}>
              <p style={{ color:'rgba(255,255,255,.42)', fontSize:9, fontWeight:700,
                          textTransform:'uppercase', letterSpacing:'0.08em', margin:0 }}>Today</p>
              <p style={{ color:'#f1f5f9', fontSize:12, fontWeight:700, margin:'2px 0 1px' }}>
                {new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })}
              </p>
              <p style={{ color:'rgba(255,255,255,.55)', fontSize:11, margin:0 }}>
                Welcome, <strong style={{ color:'#fbbf24' }}>{name}</strong>
              </p>
            </div>
          </div>

          {/* Bottom: headline + tagline */}
          <div>
            <h1 style={{ color:'#f1f5f9', fontWeight:900,
                         fontSize:'clamp(1.15rem,2.1vw,1.65rem)',
                         lineHeight:1.1, margin:'0 0 5px' }}>
              Intelligent <span style={{ color:'#f59e0b' }}>Governance.</span>{' '}
              Safer Mines.
            </h1>
            <p style={{ color:'rgba(255,255,255,.52)', fontSize:12,
                        maxWidth:380, lineHeight:1.5, margin:0 }}>
              {tagline || 'AI-powered compliance monitoring for India\'s coal mining sector.'}
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Quick Actions panel ─────────────────────────── */}
      <div className="lg:col-span-1 flex flex-col gap-3"
        style={{ background:'var(--bg-card)', borderRadius:16,
                 border:'1px solid var(--border)', padding:'16px 14px',
                 boxShadow:'var(--shadow-card)' }}>

        {/* Panel header */}
        <div style={{ paddingBottom:10, borderBottom:'1px solid var(--border)' }}>
          <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase',
                      letterSpacing:'0.1em', color:'var(--text-muted)', margin:0 }}>
            Quick Actions
          </p>
          <p style={{ fontSize:11, color:'var(--text-muted)', margin:'2px 0 0' }}>
            Core features
          </p>
        </div>

        {/* Action buttons — rendered from props */}
        <div className="flex flex-col gap-2 flex-1">
          {actions && actions.length > 0 ? (
            actions.map((act, i) => {
              const Icon = act.icon;
              const isPrimary = act.primary;
              return (
                <Link key={i} to={act.to}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-all group"
                  style={{
                    borderColor: isPrimary ? `${accent}40` : 'var(--border)',
                    background:  isPrimary ? `${accent}08` : 'var(--bg-card-hover)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = `${accent}60`;
                    e.currentTarget.style.background  = `${accent}12`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = isPrimary ? `${accent}40` : 'var(--border)';
                    e.currentTarget.style.background  = isPrimary ? `${accent}08` : 'var(--bg-card-hover)';
                  }}>
                  {Icon && (
                    <div style={{ width:30, height:30, borderRadius:8, flexShrink:0,
                      background:`${act.color || accent}15`,
                      border:`1px solid ${act.color || accent}30`,
                      display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <Icon size={14} style={{ color: act.color || accent }}/>
                    </div>
                  )}
                  <span style={{ fontSize:12, fontWeight:600,
                                 color:'var(--text-secondary)' }}>
                    {act.label}
                  </span>
                </Link>
              );
            })
          ) : (
            /* Fallback if no actions provided */
            <div className="flex items-center justify-center flex-1">
              <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center' }}>
                No quick actions
              </p>
            </div>
          )}
        </div>

        {/* DGMS badge at bottom */}
        <div style={{ padding:'8px 10px', borderRadius:10, textAlign:'center',
          background:'linear-gradient(135deg,#0f2747,#172d4d)',
          border:'1px solid rgba(255,255,255,.07)' }}>
          <p style={{ fontSize:9, fontWeight:700, color:'#f59e0b',
                      textTransform:'uppercase', letterSpacing:'0.1em', margin:0 }}>
            Ministry of Coal
          </p>
          <p style={{ fontSize:9, color:'rgba(255,255,255,.4)', margin:'2px 0 0' }}>
            Govt. of India · DGMS
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Page header with role badge (compact — used below the hero) ───── */
export function RoleDashboardHeader({ user, subtitle, children }) {
  const role   = user?.role || '';
  const accent = ROLE_ACCENT[role] || 'var(--accent)';
  const label  = ROLE_LABEL[role] || role;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
      <div>
        {/* Role badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3"
          style={{ background: `${accent}15`, border: `1px solid ${accent}35` }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:accent, display:'inline-block' }}/>
          <span style={{ fontSize:11, fontWeight:700, color:accent, textTransform:'uppercase', letterSpacing:'0.06em' }}>
            {label}
          </span>
          {(user?.mine_name || user?.mine_db_name) && (
            <>
              <span style={{ color:'var(--text-muted)', fontSize:10 }}>·</span>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)' }}>
                {user.mine_name || user.mine_db_name}
              </span>
            </>
          )}
        </div>
        <h1 className="page-title">
          Welcome, {user?.full_name?.split(' ')[0] || 'User'}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

/* ── Stat card ─────────────────────────────────────────────────────── */
export function StatCard({ icon: Icon, label, value, sub, color = '#d97706', to }) {
  const inner = (
    <div className="card flex flex-col gap-2 h-full transition-all"
      style={{ cursor: to ? 'pointer' : 'default' }}>
      <div className="flex items-center justify-between">
        <div style={{ width:36, height:36, borderRadius:10, background:`${color}15`,
          border:`1px solid ${color}25`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={16} style={{ color }}/>
        </div>
        {to && <FiArrowRight size={13} style={{ color:'var(--text-muted)' }}/>}
      </div>
      <p className="text-2xl font-black tabular-nums" style={{ color:'var(--text-primary)' }}>{value ?? '—'}</p>
      <p className="text-xs font-bold" style={{ color:'var(--text-secondary)' }}>{label}</p>
      {sub && <p className="text-[11px]" style={{ color:'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
  return to ? <Link to={to} className="no-underline">{inner}</Link> : inner;
}

/* ── Score card ────────────────────────────────────────────────────── */
export function ScoreCard({ label, value, icon: Icon, inverted = false }) {
  const v    = parseFloat(value || 0);
  const disp = inverted ? 100 - v : v;
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} style={{ color:'var(--accent)' }}/>
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color:'var(--text-muted)' }}>{label}</span>
      </div>
      <p className={clsx('text-3xl font-black tabular-nums mb-2', scoreToColor(disp))}>{v.toFixed(1)}%</p>
      <ScoreBar score={disp} showLabel={false}/>
    </div>
  );
}

/* ── Section panel ─────────────────────────────────────────────────── */
export function Panel({ title, to, toLabel = 'View All', children, className = '' }) {
  return (
    <div className={clsx('card', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title mb-0">{title}</h3>
        {to && <Link to={to} className="text-[11px] font-semibold flex items-center gap-1"
          style={{ color:'var(--accent)' }}>{toLabel} <FiArrowRight size={10}/></Link>}
      </div>
      {children}
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────────────── */
export function NoData({ message = 'No data available' }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <FiInfo size={22} style={{ color:'var(--text-muted)' }}/>
      <p className="text-sm" style={{ color:'var(--text-muted)' }}>{message}</p>
    </div>
  );
}

/* ── Alert row ─────────────────────────────────────────────────────── */
export function AlertRow({ alert }) {
  const colors = { CRITICAL:'red', HIGH:'orange', MEDIUM:'yellow', LOW:'blue' };
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
      <FiAlertTriangle size={13} style={{ color: alert.severity === 'CRITICAL' ? '#dc2626' : '#f97316', flexShrink:0, marginTop:2 }}/>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{alert.title}</p>
        <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{alert.alert_type} · {timeAgo(alert.alert_time)}</p>
      </div>
      <Badge color={colors[alert.severity] || 'gray'}>{alert.severity}</Badge>
    </div>
  );
}

/* ── Violation row ─────────────────────────────────────────────────── */
export function ViolationRow({ v }) {
  const colors = { critical:'red', high:'orange', medium:'yellow', low:'blue' };
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{v.description?.slice(0,80) || v.type}</p>
        <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{v.category} · {formatDate(v.detected_date)}</p>
      </div>
      <Badge color={colors[v.severity] || 'gray'}>{v.severity}</Badge>
    </div>
  );
}

/* ── Incident row ──────────────────────────────────────────────────── */
export function IncidentRow({ inc }) {
  const colors = { fatal:'red', serious:'orange', minor:'yellow', near_miss:'gray' };
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{inc.description?.slice(0,80) || inc.type}</p>
        <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{inc.type} · {formatDate(inc.incident_date)}</p>
      </div>
      <Badge color={colors[inc.severity] || 'gray'}>{inc.severity}</Badge>
    </div>
  );
}

/* ── Inspection row ────────────────────────────────────────────────── */
export function InspectionRow({ ins }) {
  const statusColor = { scheduled:'blue', completed:'green', in_progress:'yellow', overdue:'red' };
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>
          {ins.inspection_number} · {ins.type}
        </p>
        <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
          {ins.mine_name || '—'} · {formatDate(ins.scheduled_date)}
          {ins.overall_score != null ? ` · Score: ${Math.round(ins.overall_score)}%` : ''}
        </p>
      </div>
      <Badge color={statusColor[ins.status] || 'gray'} dot>{ins.status}</Badge>
    </div>
  );
}

export { timeAgo, formatDate, ROLE_LABEL };
