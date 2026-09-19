/**
 * KhanNetra — Sidebar Navigation
 * Role-filtered: each group and link is visible only to permitted roles.
 * Source of truth for which roles see which nav items: permissions.js NAV_PERMISSIONS.
 * Always dark navy regardless of light/dark theme.
 */
import { useState, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import {
  FiLayout, FiMap, FiNavigation2, FiLayers, FiClock, FiPaperclip,
  FiCompass, FiCheckSquare, FiUsers, FiBriefcase, FiFileText,
  FiBookOpen, FiClipboard, FiAlertOctagon,
  FiAlertTriangle, FiFeather, FiTarget, FiRss,
  FiBarChart2, FiPieChart, FiActivity, FiBell, FiSliders,
  FiBook, FiZap, FiChevronLeft, FiChevronRight, FiChevronDown,
  FiCpu, FiCamera, FiShield, FiUserCheck, FiTool,
} from 'react-icons/fi';
import useAuthStore from '../../store/authStore';
import { NAV_PERMISSIONS, ROLE_LABEL } from '../../utils/permissions';
import clsx from 'clsx';

/* ── Colour palette (always dark) ────────────────────────────────── */
const C = {
  bg:        '#0B1120',
  border:    'rgba(255,255,255,.06)',
  hdr:       '#64748B',
  text:      '#94A3B8',
  textHover: '#F5B800',
  active:    '#F5B800',
  activeBg:  'rgba(245,184,0,.13)',
  hoverBg:   'rgba(245,184,0,.08)',
  chevron:   '#94A3B8',
  divider:   'rgba(245,184,0,.20)',
};

/* ── Role shorthand sets ──────────────────────────────────────────── */
const ALL    = null; // null = visible to every authenticated role
const ADMIN  = ['admin'];
const ADMIN_GOV          = ['admin','government_officer'];
const ADMIN_GOV_INS      = ['admin','government_officer','inspector'];
const ADMIN_GOV_CORP     = ['admin','government_officer','corporate_management'];
const MINE_OPS           = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','environment_officer','mining_engineer',
                             'contractor','corporate_management'];
const MINE_SAFETY        = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','corporate_management'];
const MINE_COMPLIANCE    = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','environment_officer','corporate_management'];
const ENV_ROLES          = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','environment_officer','corporate_management'];
const INSPECTION_ROLES   = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','corporate_management'];
const MINE_PLANS_ROLES   = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','mining_engineer','corporate_management'];
const FIELD_ROLES        = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','mining_engineer','corporate_management'];
const ATTENDANCE_ROLES   = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','corporate_management','contractor'];
const CONTRACTOR_MGMT    = ['admin','government_officer','mine_manager','inspector',
                             'corporate_management'];
const VIOLATION_ROLES    = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','environment_officer','corporate_management'];
const REPORT_ROLES       = ['admin','government_officer','mine_manager','inspector',
                             'corporate_management','environment_officer'];
const NO_CONTR_NO_TEST   = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','environment_officer','mining_engineer',
                             'corporate_management'];
const PRODUCTION_ROLES   = ['admin','government_officer','mine_manager','inspector',
                             'safety_officer','mining_engineer','corporate_management'];

/* ═══════════════════════════════════════════════════════════════════
   NAVIGATION STRUCTURE
   roles: null  = visible to ALL authenticated roles
   roles: [...]  = visible only to listed roles
═══════════════════════════════════════════════════════════════════ */
const QUICK_LINKS = [
  { to:'/dashboard',   label:'Dashboard',    icon:FiLayout,       roles:ALL             },
  { to:'/compliance',  label:'Compliance',   icon:FiCheckSquare,  roles:MINE_COMPLIANCE },
  { to:'/incidents',   label:'Incidents',    icon:FiAlertTriangle,roles:MINE_SAFETY     },
  { to:'/inspections', label:'Inspections',  icon:FiClipboard,    roles:INSPECTION_ROLES},
  { to:'/environment', label:'Environment',  icon:FiFeather,      roles:ENV_ROLES       },
];

const TOOLS_LINKS = [
  { to:'/ocr',     label:'OCR Extractor',   icon:FiSliders,roles:NO_CONTR_NO_TEST },
  { to:'/disaster',label:'Disaster Alerts', icon:FiRss,    roles:ALL              },
];

const GROUPS = [
  {
    id:'mine-ops', label:'Mine Operations', icon:FiMap,
    groupRoles: MINE_OPS,
    links:[
      { to:'/mines',      label:'Mines & GIS',         icon:FiMap,         roles:MINE_OPS         },
      { to:'/gis',        label:'Enhanced GIS Map',     icon:FiNavigation2, roles:MINE_OPS         },
      { to:'/mine-plans', label:'Mine Plans',           icon:FiLayers,      roles:MINE_PLANS_ROLES },
      { to:'/production', label:'Production Monitoring',icon:FiBarChart2,   roles:PRODUCTION_ROLES },
      { to:'/deadlines',  label:'Compliance Deadlines', icon:FiClock,       roles:MINE_COMPLIANCE  },
      { to:'/documents',  label:'Documents',            icon:FiPaperclip,   roles:MINE_OPS         },
    ],
  },
  {
    id:'field', label:'Field & Workforce', icon:FiCompass,
    groupRoles: [...new Set([...FIELD_ROLES, 'contractor'])],
    links:[
      { to:'/field',         label:'Field Dashboard',   icon:FiCompass,    roles:FIELD_ROLES      },
      { to:'/attendance',    label:'Attendance',        icon:FiCheckSquare,roles:ATTENDANCE_ROLES  },
      { to:'/workers',       label:'Workers Registry',  icon:FiUsers,      roles:MINE_SAFETY       },
      { to:'/field-reports', label:'Field Reports',     icon:FiFileText,   roles:FIELD_ROLES       },
      { to:'/contractors',   label:'Contractors',       icon:FiBriefcase,  roles:CONTRACTOR_MGMT   },
    ],
  },
  {
    id:'governance', label:'Governance & Compliance', icon:FiClipboard,
    groupRoles: MINE_COMPLIANCE,
    links:[
      { to:'/compliance',             label:'Compliance',  icon:FiCheckSquare, roles:MINE_COMPLIANCE  },
      { to:'/compliance/regulations', label:'Regulations', icon:FiBookOpen,    roles:MINE_COMPLIANCE  },
      { to:'/inspections',            label:'Inspections', icon:FiClipboard,   roles:INSPECTION_ROLES },
      { to:'/violations',             label:'Violations',  icon:FiAlertOctagon,roles:VIOLATION_ROLES  },
    ],
  },
  {
    id:'safety', label:'Safety & Environment', icon:FiAlertTriangle,
    groupRoles: ENV_ROLES,
    links:[
      { to:'/safety-hub',     label:'Safety Hub',     icon:FiShield,       roles:MINE_SAFETY          },
      { to:'/incidents',      label:'Incidents',      icon:FiAlertTriangle,roles:MINE_SAFETY          },
      { to:'/environment',    label:'Environment',    icon:FiFeather,      roles:ENV_ROLES             },
      { to:'/risk-dashboard', label:'Risk Dashboard', icon:FiTarget,       roles:NO_CONTR_NO_TEST      },
      { to:'/disaster',       label:'Disaster Alerts',icon:FiRss,          roles:ALL                   },
    ],
  },
  {
    id:'ai-tools', label:'AI & Analytics', icon:FiCpu,
    groupRoles: ALL,
    links:[
      { to:'/ai/chat',  label:'AI Assistant',    icon:FiCpu,      roles:ALL              },
      { to:'/ai/risk',  label:'Risk Prediction', icon:FiTarget,   roles:NO_CONTR_NO_TEST },
      { to:'/vision',   label:'Safety Vision',   icon:FiCamera,   roles:[...FIELD_ROLES] },
      { to:'/ocr',      label:'OCR Extractor',   icon:FiSliders,  roles:NO_CONTR_NO_TEST },
    ],
  },
  {
    id:'reports', label:'Reports & Analytics', icon:FiBarChart2,
    groupRoles: REPORT_ROLES,
    links:[
      { to:'/reports',   label:'Reports',   icon:FiBarChart2, roles:REPORT_ROLES   },
      { to:'/analytics', label:'Analytics', icon:FiPieChart,  roles:ADMIN_GOV_CORP },
    ],
  },
  {
    id:'admin', label:'Administration', icon:FiBook,
    groupRoles: ALL,
    links:[
      { to:'/notifications', label:'Notifications',  icon:FiBell,     roles:ALL          },
      { to:'/audit',         label:'Audit Trail',    icon:FiActivity, roles:ADMIN_GOV_INS },
      { to:'/users',         label:'User Management',icon:FiUsers,    roles:ADMIN_GOV    },
    ],
  },
];

/* ── helpers ──────────────────────────────────────────────────────── */
function canSee(roles, userRole) {
  if (roles === null || roles === undefined) return true; // ALL
  return roles.includes(userRole);
}

function isGroupActive(group, pathname) {
  return group.links.some(l => pathname === l.to || pathname.startsWith(l.to + '/'));
}

/* ── NavLink item ─────────────────────────────────────────────────── */
function SideLink({ link, collapsed, userRole }) {
  const location = useLocation();
  if (!canSee(link.roles, userRole)) return null;

  const Icon     = link.icon;
  const isActive = location.pathname === link.to
    || (link.to !== '/dashboard' && location.pathname.startsWith(link.to + '/'));

  if (collapsed) {
    return (
      <NavLink
        to={link.to} title={link.label}
        className="flex items-center justify-center w-10 h-9 mx-auto rounded-xl transition-all"
        style={{ background: isActive ? C.activeBg : '' }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.background = C.hoverBg;
            const ic = e.currentTarget.querySelector('.nav-icon-inner');
            if (ic) ic.style.color = C.textHover;
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            e.currentTarget.style.background = '';
            const ic = e.currentTarget.querySelector('.nav-icon-inner');
            if (ic) ic.style.color = C.text;
          }
        }}
      >
        <Icon size={16} className="nav-icon-inner"
          style={{ color: isActive ? C.active : C.text, transition:'color .15s' }}/>
      </NavLink>
    );
  }

  return (
    <NavLink
      to={link.to}
      className="flex items-center gap-2.5 pl-5 pr-3 py-2 rounded-xl text-[12px] font-medium transition-all relative"
      style={isActive
        ? { color:C.active, background:C.activeBg, boxShadow:`inset 3px 0 0 ${C.active}`, fontWeight:600 }
        : { color:C.text }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.background = C.hoverBg;
          e.currentTarget.style.color = C.textHover;
          const ic = e.currentTarget.querySelector('.nav-icon-inner');
          if (ic) ic.style.color = C.textHover;
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.background = '';
          e.currentTarget.style.color = C.text;
          const ic = e.currentTarget.querySelector('.nav-icon-inner');
          if (ic) ic.style.color = '#64748B';
        }
      }}
    >
      <Icon size={13} className="shrink-0 nav-icon-inner"
        style={{ color: isActive ? C.active : '#64748B', transition:'color .15s' }}/>
      <span className="truncate">{link.label}</span>
    </NavLink>
  );
}

/* ── Collapsible group ────────────────────────────────────────────── */
function NavGroup({ group, collapsed, userRole }) {
  const location = useLocation();
  const active   = isGroupActive(group, location.pathname);
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);

  // Filter visible links for this role
  const visible = group.links.filter(l => canSee(l.roles, userRole));
  if (!visible.length) return null;
  // Also hide the whole group if this role can't see any group-level items
  if (group.groupRoles !== null && !canSee(group.groupRoles, userRole)) return null;

  const Icon = group.icon;

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {visible.map(link => (
          <SideLink key={link.to} link={link} collapsed userRole={userRole}/>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
        style={{ color: active ? '#CBD5E1' : C.hdr }}
        onMouseEnter={e => { e.currentTarget.style.background = C.hoverBg; e.currentTarget.style.color = C.textHover; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = active ? '#CBD5E1' : C.hdr; }}
      >
        <Icon size={13} className="shrink-0" style={{ color: active ? C.active : C.text }}/>
        <span className="flex-1 text-left truncate">{group.label}</span>
        <FiChevronDown
          size={13} className="shrink-0 transition-transform duration-200"
          style={{ color: active ? C.active : C.chevron, transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
        />
      </button>

      <div className={clsx(
        'overflow-hidden transition-all duration-200',
        open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className="pl-1 pb-1 space-y-0.5 mt-0.5">
          {visible.map(link => (
            <SideLink key={link.to} link={link} collapsed={false} userRole={userRole}/>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN SIDEBAR
════════════════════════════════════════════════════════════════════ */
export default function Sidebar({ collapsed, onToggle }) {
  const { user }  = useAuthStore();
  const location  = useLocation();
  const userRole  = user?.role || '';

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 h-screen flex flex-col z-40 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{ background:C.bg, borderRight:`1px solid ${C.border}` }}
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <div
        className={clsx('flex items-center gap-2.5 px-3', collapsed ? 'py-3.5 justify-center' : 'py-3.5')}
        style={{ borderBottom:`1px solid ${C.border}` }}
      >
        <img src="/khannetra-logo.svg" alt="KhanNetra"
          style={{ width:34, height:34, flexShrink:0, filter:'drop-shadow(0 0 6px rgba(245,158,11,.5))' }}/>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[14px] leading-tight tracking-tight text-white">KhanNetra</p>
              <p className="text-[9px] mt-0.5 font-semibold uppercase tracking-widest" style={{ color:C.hdr }}>
                DGMS · Ministry of Coal
              </p>
            </div>
            <button onClick={onToggle} title="Collapse sidebar"
              className="p-1.5 rounded-lg transition-colors shrink-0"
              style={{ color:C.chevron }}
              onMouseEnter={e => { e.currentTarget.style.background=C.hoverBg; e.currentTarget.style.color=C.textHover; }}
              onMouseLeave={e => { e.currentTarget.style.background=''; e.currentTarget.style.color=C.chevron; }}>
              <FiChevronLeft size={14} style={{ color:'inherit' }}/>
            </button>
          </>
        )}
      </div>

      {/* ── Role badge ────────────────────────────────────────── */}
      {!collapsed && userRole && (
        <div style={{ padding:'8px 12px 4px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:5,
            padding:'3px 10px', borderRadius:999,
            background:'rgba(245,184,0,.08)', border:`1px solid ${C.divider}`,
          }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:C.active, flexShrink:0 }}/>
            <span style={{ color:C.active, fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>
              {ROLE_LABEL[userRole] || userRole}
            </span>
          </div>
        </div>
      )}

      {/* ── Nav content ───────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 scrollbar-thin"
        style={{ scrollbarWidth:'thin', scrollbarColor:`${C.border} transparent` }}>

        {collapsed && (
          <button onClick={onToggle} title="Expand sidebar"
            className="w-full flex justify-center py-2.5 rounded-xl transition-colors mb-1"
            style={{ color:C.chevron }}
            onMouseEnter={e => { e.currentTarget.style.background=C.hoverBg; e.currentTarget.style.color=C.textHover; }}
            onMouseLeave={e => { e.currentTarget.style.background=''; e.currentTarget.style.color=C.chevron; }}>
            <FiChevronRight size={15} style={{ color:'inherit' }}/>
          </button>
        )}

        {/* Quick Access */}
        {!collapsed && (
          <p className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-[.15em]" style={{ color:C.hdr }}>
            Quick Access
          </p>
        )}
        <div className={clsx('space-y-0.5', collapsed ? '' : 'px-1')}>
          {QUICK_LINKS.map(link => (
            <SideLink key={link.to} link={link} collapsed={collapsed} userRole={userRole}/>
          ))}
        </div>

        {/* Tools & Alerts */}
        <div className={clsx('mt-3', collapsed ? '' : 'mx-1')}>
          {!collapsed && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded-lg"
              style={{ background:'rgba(245,158,11,.08)', border:`1px solid ${C.divider}` }}>
              <FiZap size={10} style={{ color:C.active }}/>
              <p className="text-[9px] font-bold uppercase tracking-[.15em]" style={{ color:C.active }}>
                Tools &amp; Alerts
              </p>
            </div>
          )}
          {collapsed && <div style={{ height:1, background:C.divider, margin:'8px 10px' }}/>}
          <div className="space-y-0.5">
            {TOOLS_LINKS.map(link => (
              <SideLink key={link.to} link={link} collapsed={collapsed} userRole={userRole}/>
            ))}
          </div>
        </div>

        {/* Collapsible groups */}
        <div className={clsx('mt-3 space-y-0.5', collapsed ? '' : 'px-1')}>
          {!collapsed && (
            <p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-[.15em]" style={{ color:C.hdr }}>
              All Modules
            </p>
          )}
          {GROUPS.map(group => (
            <NavGroup key={group.id} group={group} collapsed={collapsed} userRole={userRole}/>
          ))}
        </div>
      </nav>

      {/* ── User profile strip ────────────────────────────────── */}
      {!collapsed && user && (
        <div className="px-2 py-2.5 shrink-0" style={{ borderTop:`1px solid ${C.border}` }}>
          <Link to="/profile"
            className="flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all"
            onMouseEnter={e => { e.currentTarget.style.background=C.hoverBg; e.currentTarget.querySelector('.profile-name').style.color=C.textHover; }}
            onMouseLeave={e => { e.currentTarget.style.background=''; e.currentTarget.querySelector('.profile-name').style.color='#FFFFFF'; }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold"
              style={{ background:'rgba(245,184,0,.18)', border:`1px solid rgba(245,184,0,.3)`, color:C.active }}>
              {user.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="profile-name text-[11px] font-semibold truncate text-white transition-colors">{user.full_name}</p>
              <p className="text-[9px] truncate" style={{ color:C.hdr }}>
                {ROLE_LABEL[userRole] || userRole}
              </p>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}
