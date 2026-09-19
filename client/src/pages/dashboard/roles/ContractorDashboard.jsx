/**
 * KhanNetra — Contractor Dashboard
 * Restricted to contractor's own work: assigned mine/site,
 * workforce attendance, safety compliance, alerts.
 * No corporate analytics, no other contractor data.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiBriefcase, FiUsers, FiCheckSquare, FiAlertTriangle,
  FiClock, FiRss, FiCpu, FiFileText,
} from 'react-icons/fi';
import { contractorsApi, attendanceApi, disasterApi } from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, Panel, NoData, AlertRow } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';
import { formatDate } from '../../../utils/helpers';
import Badge from '../../../components/ui/Badge';

export default function ContractorDashboard({ user }) {
  const [contractors, setContractors] = useState([]);
  const [attendance,  setAttendance]  = useState(null);
  const [disaster,    setDisaster]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const mineId = user?.mine_id;

  useEffect(() => {
    Promise.allSettled([
      contractorsApi.getAll({ ...(mineId ? { mine_id: mineId } : {}), limit: 5 }),
      attendanceApi.getDailySummary({ ...(mineId ? { mine_id: mineId } : {}) }).catch(() => null),
      disasterApi.getActive(),
    ]).then(([c, att, dis]) => {
      setContractors(c.status === 'fulfilled' ? (c.value?.data||[]) : []);
      setAttendance(att?.status === 'fulfilled' ? att.value?.data : null);
      setDisaster(dis.status === 'fulfilled' ? (dis.value?.data||[]).slice(0,3) : []);
    }).finally(() => setLoading(false));
  }, [mineId]);

  if (loading) return <div className="space-y-4"><CardSkeleton count={3}/></div>;

  const myContractor = contractors[0]; // Contractor sees their own record first

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Your assigned work, workforce attendance and safety compliance."
        actions={[
          { to:'/attendance',   label:'Attendance',    icon:FiClock,    color:'#16a34a' },
          { to:'/field-reports',label:'Field Report',  icon:FiFileText, color:'#2563eb' },
          { to:'/ai/chat',      label:'AI Assistant',  icon:FiCpu,      color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Your assigned work, workforce and safety compliance"/>

      {/* Contractor profile card */}
      {myContractor ? (
        <div className="card p-5" style={{ background:'linear-gradient(135deg,var(--bg-card),rgba(124,58,237,.04))', border:'1px solid rgba(124,58,237,.2)' }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color:'var(--text-muted)' }}>Contractor Profile</p>
          <div className="flex flex-wrap gap-6 items-start">
            <div>
              <p className="text-lg font-black" style={{ color:'var(--text-primary)' }}>{myContractor.name}</p>
              <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{myContractor.work_type}</p>
            </div>
            {[
              { label:'Mine',       value: myContractor.mine_name || user?.mine_name || '—' },
              { label:'Workers',    value: myContractor.workers_count ?? '—' },
              { label:'Safety',     value: myContractor.safety_score ? `${myContractor.safety_score}%` : '—' },
              { label:'Contract End', value: myContractor.contract_end ? formatDate(myContractor.contract_end) : '—' },
              { label:'Status',     value: myContractor.status?.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:'var(--text-muted)' }}>{label}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color:'var(--text-primary)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card p-5">
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>No contractor profile found. Contact your administrator.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FiUsers}         label="My Workers"      value={myContractor?.workers_count ?? '—'}    sub="Total workforce"      color="#7c3aed" to="/workers"/>
        <StatCard icon={FiCheckSquare}   label="Attendance"      value={attendance?.present ?? '—'}            sub="Present today"        color="#16a34a" to="/attendance"/>
        <StatCard icon={FiAlertTriangle} label="Violations"      value={myContractor?.violations_count ?? 0}   sub="Total violations"     color={myContractor?.violations_count>0?'#dc2626':'#16a34a'} to="/violations"/>
        <StatCard icon={FiRss}           label="Disaster Alerts" value={disaster.length}                       sub="Active alerts"        color={disaster.length>0?"#dc2626":"#16a34a"} to="/disaster"/>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="🚨 Safety & Disaster Alerts" to="/disaster">
          {disaster.length ? disaster.map(a => <AlertRow key={a.id} alert={a}/>) : <NoData message="No active alerts"/>}
        </Panel>
        <Panel title="My Contractors" to="/contractors">
          {contractors.length ? contractors.map(c => (
            <div key={c.id} className="flex items-start justify-between py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div>
                <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{c.name}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{c.work_type} · {c.mine_name}</p>
              </div>
              <Badge color={c.status==='active'?'green':'red'} dot>{c.status}</Badge>
            </div>
          )) : <NoData message="No contractor records"/>}
        </Panel>
      </div>

      {/* Quick links — limited scope */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to:'/attendance', label:'Worker Attendance', icon:FiClock,        color:'#16a34a' },
          { to:'/field-reports',label:'Submit Report',  icon:FiFileText,     color:'#2563eb' },
          { to:'/disasters',  label:'Safety Alerts',    icon:FiRss,          color:'#dc2626' },
          { to:'/ai/chat',    label:'AI Assistant',     icon:FiCpu,          color:'#7c3aed' },
        ].map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to}
            className="flex items-center gap-3 p-3 rounded-xl border transition-all"
            style={{ borderColor:'var(--border)', backgroundColor:'var(--bg-card)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=color+'55'; e.currentTarget.style.background=color+'08'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-card)'; }}>
            <div style={{ width:32, height:32, borderRadius:8, background:`${color}15`, border:`1px solid ${color}25`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon size={14} style={{ color }}/>
            </div>
            <span className="text-sm font-semibold" style={{ color:'var(--text-secondary)' }}>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
