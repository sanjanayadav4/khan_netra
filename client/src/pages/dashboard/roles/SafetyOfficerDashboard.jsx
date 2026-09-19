/**
 * KhanNetra — Safety Officer Dashboard
 * Focused on safety: incidents, violations, inspections,
 * corrective actions, risk, disaster alerts, safety vision.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertTriangle, FiAlertOctagon, FiClipboard,
  FiCheckSquare, FiTarget, FiCamera, FiRss, FiCpu, FiShieldOff,
} from 'react-icons/fi';
import {
  violationsApi, incidentsApi, inspectionsApi, disasterApi,
} from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, Panel, NoData, ViolationRow, IncidentRow, InspectionRow, AlertRow, StatCard } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';

export default function SafetyOfficerDashboard({ user }) {
  const [viols,   setViols]   = useState([]);
  const [incs,    setIncs]    = useState([]);
  const [insps,   setInsps]   = useState([]);
  const [disaster,setDisaster]= useState([]);
  const [stats,   setStats]   = useState({});
  const [loading, setLoading] = useState(true);
  const p = user?.mine_id ? { mine_id: user.mine_id } : {};

  useEffect(() => {
    Promise.allSettled([
      violationsApi.getAll({ ...p, status:'open', limit:6 }),
      incidentsApi.getAll({ ...p, status:'open', limit:6 }),
      inspectionsApi.getAll({ ...p, limit:5 }),
      disasterApi.getActive(),
      incidentsApi.getStats(),
    ]).then(([v, i, ins, dis, st]) => {
      const vd = v.status === 'fulfilled' ? (v.value?.data||[]) : [];
      const id = i.status === 'fulfilled' ? (i.value?.data||[]) : [];
      setViols(vd);
      setIncs(id);
      setInsps(ins.status === 'fulfilled' ? (ins.value?.data||[]) : []);
      setDisaster(dis.status === 'fulfilled' ? (dis.value?.data||[]).slice(0,3) : []);
      setStats({
        openViolations: vd.length,
        criticalViols: vd.filter(v=>v.severity==='critical').length,
        openIncidents: id.length,
        fatalIncidents: id.filter(i=>i.severity==='fatal').length,
        ...( st.status === 'fulfilled' ? st.value?.data : {} ),
      });
    }).finally(() => setLoading(false));
  }, [user?.mine_id]);

  if (loading) return <div className="space-y-4"><CardSkeleton count={4}/></div>;

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Safety monitoring: incidents, violations, inspections, risk prediction and Safety Vision."
        actions={[
          { to:'/vision',        label:'Safety Vision',  icon:FiCamera, color:'#7c3aed' },
          { to:'/risk-dashboard',label:'Risk Dashboard', icon:FiTarget, color:'#dc2626' },
          { to:'/ai/chat',       label:'AI Assistant',   icon:FiCpu,    color:'#d97706', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Safety monitoring, incidents, violations and inspections"/>

      {/* Key safety stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FiShieldOff}     label="Open Violations"  value={stats.openViolations}  sub={`${stats.criticalViols||0} critical`}  color="#dc2626" to="/violations"/>
        <StatCard icon={FiAlertTriangle} label="Active Incidents" value={stats.openIncidents}   sub={`${stats.fatalIncidents||0} fatal`}     color="#ea580c" to="/incidents"/>
        <StatCard icon={FiClipboard}     label="Inspections"      value={insps.length}          sub="Recent inspections"                     color="#2563eb" to="/inspections"/>
        <StatCard icon={FiRss}           label="Disaster Alerts"  value={disaster.length}       sub="Active alerts"                          color={disaster.length>0?"#dc2626":"#16a34a"} to="/disaster"/>
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="🚨 Active Violations" to="/violations" toLabel="All Violations">
          {viols.length ? viols.map(v => <ViolationRow key={v.id} v={v}/>) : <NoData message="No open violations"/>}
        </Panel>
        <Panel title="⚠️ Active Incidents" to="/incidents" toLabel="All Incidents">
          {incs.length ? incs.map(i => <IncidentRow key={i.id} inc={i}/>) : <NoData message="No active incidents"/>}
        </Panel>
        <Panel title="🔍 Recent Inspections" to="/inspections" toLabel="All Inspections">
          {insps.length ? insps.map(i => <InspectionRow key={i.id} ins={i}/>) : <NoData/>}
        </Panel>
        <Panel title="🌪️ Disaster Alerts" to="/disaster">
          {disaster.length ? disaster.map(a => <AlertRow key={a.id} alert={a}/>) : <NoData message="No active disaster alerts"/>}
        </Panel>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to:'/risk-dashboard', label:'Risk Dashboard', icon:FiTarget,       color:'#dc2626' },
          { to:'/compliance',     label:'Compliance',     icon:FiCheckSquare,  color:'#16a34a' },
          { to:'/vision',         label:'Safety Vision',  icon:FiCamera,       color:'#7c3aed' },
          { to:'/field-reports',  label:'Field Reports',  icon:FiAlertOctagon, color:'#0369a1' },
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
