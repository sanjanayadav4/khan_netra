/**
 * KhanNetra — Mine Manager Dashboard
 * Full operational view of assigned mine: compliance, safety, production,
 * workers, contractors, environment, inspections, incidents, risk, alerts.
 * All data from real APIs filtered to user.mine_id.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiTool, FiShieldOff, FiAlertTriangle, FiUserCheck, FiPackage,
  FiCheckSquare, FiFeather, FiTarget, FiClock, FiBriefcase,
  FiClipboard, FiMap, FiCpu, FiFileText, FiRss,
} from 'react-icons/fi';
import {
  analyticsApi, violationsApi, incidentsApi, inspectionsApi,
  contractorsApi, disasterApi,
} from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, ScoreCard, Panel, NoData, ViolationRow, IncidentRow, InspectionRow, AlertRow } from './_shared';
import { CardSkeleton, PageLoader } from '../../../components/ui/LoadingSpinner';

export default function MineManagerDashboard({ user }) {
  const [dash,     setDash]     = useState(null);
  const [viols,    setViols]    = useState([]);
  const [incs,     setIncs]     = useState([]);
  const [insps,    setInsps]    = useState([]);
  const [contrs,   setContrs]   = useState(null);
  const [disaster, setDisaster] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const mineId = user?.mine_id;

  useEffect(() => {
    const p = mineId ? { mine_id: mineId } : {};
    Promise.allSettled([
      analyticsApi.getDashboard(),
      violationsApi.getAll({ ...p, status: 'open', limit: 5 }),
      incidentsApi.getAll({ ...p, status: 'open', limit: 5 }),
      inspectionsApi.getAll({ ...p, limit: 5 }),
      mineId ? contractorsApi.getStats({ mine_id: mineId }) : Promise.resolve({ data: null }),
      disasterApi.getActive(),
    ]).then(([d, v, i, ins, c, dis]) => {
      setDash(d.status === 'fulfilled' ? d.value?.data : null);
      setViols(v.status === 'fulfilled' ? (v.value?.data || []) : []);
      setIncs(i.status === 'fulfilled' ? (i.value?.data || []) : []);
      setInsps(ins.status === 'fulfilled' ? (ins.value?.data || []) : []);
      setContrs(c.status === 'fulfilled' ? (c.value?.data) : null);
      setDisaster(dis.status === 'fulfilled' ? (dis.value?.data || []).filter(a => ['CRITICAL','HIGH'].includes(a.severity)).slice(0,3) : []);
    }).finally(() => setLoading(false));
  }, [mineId]);

  if (loading) return <div className="space-y-4"><CardSkeleton count={4}/></div>;

  const mines = dash?.mines || {};
  const scores = dash?.scores || {};
  const violations = dash?.violations || {};
  const incidents = dash?.incidents || {};

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Full mine operations: compliance, safety, workers, contractors and environmental monitoring."
        actions={[
          { to:'/mines',     label:'Mine Map',     icon:FiMap,  color:'#2563eb' },
          { to:'/compliance',label:'Compliance',   icon:FiCheckSquare, color:'#16a34a' },
          { to:'/ai/chat',   label:'AI Assistant', icon:FiCpu,  color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Full operational view of your assigned mine"/>

      {/* Disaster alerts */}
      {disaster.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.25)' }}>
          <FiRss size={14} style={{ color:'#dc2626', flexShrink:0 }}/>
          <span className="text-sm font-bold" style={{ color:'#dc2626' }}>🚨 {disaster.length} Active Disaster Alert{disaster.length>1?'s':''}</span>
          <Link to="/disaster" className="btn-danger btn-sm ml-auto">View →</Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={FiTool}          label="Total Mines"       value={mines.total}           sub={`${mines.active||0} active`}                  color="#2563eb" to="/mines"/>
        <StatCard icon={FiShieldOff}     label="Open Violations"   value={violations.open}       sub={`${violations.critical||0} critical`}          color="#dc2626" to="/violations"/>
        <StatCard icon={FiAlertTriangle} label="Active Incidents"  value={incidents.open}        sub={`${incidents.fatal||0} fatal`}                 color="#ea580c" to="/incidents"/>
        <StatCard icon={FiUserCheck}     label="Total Workers"     value={mines.total_workers}   sub={`Across ${mines.total||0} mines`}              color="#16a34a" to="/workers"/>
        <StatCard icon={FiBriefcase}     label="Contractors"       value={contrs?.total_contractors ?? '—'} sub="Active contractors"              color="#7c3aed" to="/contractors"/>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard label="Compliance"   value={scores.avg_compliance} icon={FiCheckSquare}/>
        <ScoreCard label="Safety"       value={scores.avg_safety}     icon={FiAlertTriangle}/>
        <ScoreCard label="Environmental" value={scores.avg_env}       icon={FiFeather}/>
        <ScoreCard label="Risk Level"   value={scores.avg_risk}       icon={FiTarget} inverted/>
      </div>

      {/* Three-column detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Open Violations" to="/violations">
          {viols.length ? viols.map(v => <ViolationRow key={v.id} v={v}/>) : <NoData/>}
        </Panel>
        <Panel title="Active Incidents" to="/incidents">
          {incs.length ? incs.map(i => <IncidentRow key={i.id} inc={i}/>) : <NoData/>}
        </Panel>
        <Panel title="Recent Inspections" to="/inspections">
          {insps.length ? insps.map(i => <InspectionRow key={i.id} ins={i}/>) : <NoData/>}
        </Panel>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to:'/compliance',    label:'Compliance',      icon:FiCheckSquare, color:'#16a34a' },
          { to:'/attendance',    label:'Attendance',      icon:FiUserCheck,   color:'#2563eb' },
          { to:'/environment',   label:'Environment',     icon:FiFeather,     color:'#0f766e' },
          { to:'/mine-plans',    label:'Mine Plans',      icon:FiPackage,     color:'#d97706' },
          { to:'/documents',     label:'Documents',       icon:FiFileText,    color:'#7c3aed' },
          { to:'/risk-dashboard',label:'Risk Dashboard',  icon:FiTarget,      color:'#dc2626' },
          { to:'/field-reports', label:'Field Reports',   icon:FiClipboard,   color:'#0369a1' },
          { to:'/disaster',      label:'Disaster Alerts', icon:FiRss,         color:'#f97316' },
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
