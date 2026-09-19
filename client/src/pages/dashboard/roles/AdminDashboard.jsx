/**
 * KhanNetra — System Admin Dashboard
 * Admin-specific: user management, pending approvals,
 * system health, audit logs, all mines.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiUsers, FiClock, FiCheckCircle, FiActivity,
  FiTool, FiShieldOff, FiAlertTriangle, FiBarChart2,
  FiSettings, FiDatabase, FiCpu,
} from 'react-icons/fi';
import {
  analyticsApi, authApi,
} from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, Panel, NoData } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';
import { timeAgo } from '../../../utils/helpers';
import Badge from '../../../components/ui/Badge';

export default function AdminDashboard({ user }) {
  const [dash,    setDash]    = useState(null);
  const [pending, setPending] = useState([]);
  const [allUsers,setAllUsers]= useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      analyticsApi.getDashboard(),
      authApi.getPendingUsers({ status: 'PENDING' }),
      authApi.getPendingUsers({ status: 'APPROVED' }),
    ]).then(([d, p, u]) => {
      setDash(d.status === 'fulfilled' ? d.value?.data : null);
      setPending(p.status === 'fulfilled' ? (p.value?.data||[]).slice(0,5) : []);
      setAllUsers(u.status === 'fulfilled' ? (u.value?.data||[]) : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4"><CardSkeleton count={4}/></div>;

  const mines      = dash?.mines      || {};
  const violations = dash?.violations || {};
  const incidents  = dash?.incidents  || {};

  const ROLE_COLOR = { admin:'red', government_officer:'blue', mine_manager:'yellow', inspector:'green', safety_officer:'orange', environment_officer:'teal', contractor:'purple', mining_engineer:'blue', corporate_management:'red', prototype_tester:'gray' };

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="System administration: user management, approvals, audit logs and system health."
        actions={[
          { to:'/users',   label:'User Management', icon:FiUsers,    color:'#2563eb' },
          { to:'/audit',   label:'Audit Log',        icon:FiActivity, color:'#dc2626' },
          { to:'/ai/chat', label:'AI Assistant',     icon:FiCpu,      color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="System administration: users, approvals, health monitoring and full access"/>

      {/* Pending approvals banner */}
      {pending.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl"
          style={{ background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.3)' }}>
          <div className="flex items-center gap-3">
            <FiClock size={14} style={{ color:'var(--accent)', flexShrink:0 }}/>
            <span className="text-sm font-bold" style={{ color:'var(--accent)' }}>
              ⏳ {pending.length} user{pending.length>1?'s':''} awaiting approval
            </span>
          </div>
          <Link to="/users" className="btn-primary btn-sm">Review Now →</Link>
        </div>
      )}

      {/* System KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FiUsers}         label="Total Users"      value={allUsers.length}        sub={`${pending.length} pending`}          color="#2563eb" to="/users"/>
        <StatCard icon={FiTool}          label="Total Mines"      value={mines.total}            sub={`${mines.active||0} active`}          color="#d97706" to="/mines"/>
        <StatCard icon={FiShieldOff}     label="Open Violations"  value={violations.open}        sub={`${violations.critical||0} critical`} color="#dc2626" to="/violations"/>
        <StatCard icon={FiAlertTriangle} label="Active Incidents" value={incidents.open}         sub={`${incidents.fatal||0} fatal`}        color="#ea580c" to="/incidents"/>
      </div>

      {/* Pending approvals + user list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="⏳ Pending Registrations" to="/users" toLabel="User Management">
          {pending.length ? pending.map(u => (
            <div key={u.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background:'rgba(245,184,0,.15)', border:'1px solid rgba(245,184,0,.3)', color:'var(--accent)' }}>
                {u.full_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{u.full_name}</p>
                <p className="text-[10px] truncate" style={{ color:'var(--text-muted)' }}>{u.email} · {u.organization || '—'}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Registered {timeAgo(u.created_at)}</p>
              </div>
              <Badge color={ROLE_COLOR[u.role]||'gray'}>{u.role?.replace(/_/g,' ')}</Badge>
            </div>
          )) : (
            <div className="flex flex-col items-center py-6 gap-2">
              <FiCheckCircle size={22} style={{ color:'#16a34a' }}/>
              <p className="text-sm" style={{ color:'var(--text-muted)' }}>No pending approvals</p>
            </div>
          )}
        </Panel>

        <Panel title="👥 Recent Users" to="/users">
          {allUsers.slice(0,6).length ? allUsers.slice(0,6).map(u => (
            <div key={u.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold"
                style={{ background:'var(--accent-bg)', border:'1px solid var(--accent-border)', color:'var(--accent)' }}>
                {u.full_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{u.full_name}</p>
                <p className="text-[10px] truncate" style={{ color:'var(--text-muted)' }}>{u.email}</p>
              </div>
              <Badge color={ROLE_COLOR[u.role]||'gray'}>{u.role?.replace(/_/g,' ')}</Badge>
            </div>
          )) : <NoData/>}
        </Panel>
      </div>

      {/* Admin quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to:'/users',        label:'User Management',  icon:FiUsers,     color:'#2563eb' },
          { to:'/audit',        label:'Audit Trail',      icon:FiActivity,  color:'#dc2626' },
          { to:'/analytics',    label:'Analytics',        icon:FiBarChart2, color:'#d97706' },
          { to:'/settings',     label:'Settings',         icon:FiSettings,  color:'#7c3aed' },
          { to:'/mines',        label:'All Mines',        icon:FiTool,      color:'#16a34a' },
          { to:'/compliance',   label:'Compliance',       icon:FiCheckCircle,color:'#0f766e'},
          { to:'/reports',      label:'Reports',          icon:FiDatabase,  color:'#0369a1' },
          { to:'/notifications',label:'Notifications',    icon:FiClock,     color:'#ea580c' },
        ].map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to}
            className="flex items-center gap-3 p-3 rounded-xl border transition-all"
            style={{ borderColor:'var(--border)', backgroundColor:'var(--bg-card)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=color+'55'; e.currentTarget.style.background=color+'08'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-card)'; }}>
            <div style={{ width:32, height:32, borderRadius:8, background:`${color}15`, border:`1px solid ${color}25`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon size={14} style={{ color }}/>
            </div>
            <span className="text-sm font-semibold" style={{ color:'var(--text-secondary)' }}>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
