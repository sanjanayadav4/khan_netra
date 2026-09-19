/**
 * KhanNetra — Field Inspector / DGMS Inspector Dashboard
 * Field-first: assigned inspections front and centre,
 * incidents to report, violations, corrective actions, field reports.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiClipboard, FiAlertTriangle, FiAlertOctagon,
  FiFileText, FiMap, FiCpu, FiCheckSquare, FiCamera,
} from 'react-icons/fi';
import { inspectionsApi, violationsApi, incidentsApi, fieldReportsApi } from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, Panel, NoData, ViolationRow, IncidentRow, InspectionRow } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';
import Badge from '../../../components/ui/Badge';
import { formatDate } from '../../../utils/helpers';

export default function InspectorDashboard({ user }) {
  const [insps,   setInsps]   = useState([]);
  const [viols,   setViols]   = useState([]);
  const [incs,    setIncs]    = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      inspectionsApi.getAll({ limit: 8 }),
      violationsApi.getAll({ status: 'open', limit: 6 }),
      incidentsApi.getAll({ status: 'open', limit: 5 }),
      fieldReportsApi.getAll({ limit: 5 }),
    ]).then(([ins, v, i, fr]) => {
      setInsps(ins.status === 'fulfilled' ? (ins.value?.data||[]) : []);
      setViols(v.status === 'fulfilled' ? (v.value?.data||[]) : []);
      setIncs(i.status === 'fulfilled' ? (i.value?.data||[]) : []);
      setReports(fr.status === 'fulfilled' ? (fr.value?.data||[]) : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4"><CardSkeleton count={4}/></div>;

  const scheduled  = insps.filter(i => i.status === 'scheduled');
  const inProgress = insps.filter(i => i.status === 'in_progress');
  const completed  = insps.filter(i => i.status === 'completed');

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Field inspections, violations, safety observations and incident reporting."
        actions={[
          { to:'/inspections',  label:'Inspections',   icon:FiClipboard,    color:'#2563eb' },
          { to:'/field',        label:'Field View',    icon:FiMap,          color:'#16a34a' },
          { to:'/ai/chat',      label:'AI Assistant',  icon:FiCpu,          color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Your assigned inspections, violations and field work"/>

      {/* Inspection summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Scheduled', count: scheduled.length,  color:'#2563eb' },
          { label:'In Progress',count: inProgress.length, color:'#d97706' },
          { label:'Completed',  count: completed.length,  color:'#16a34a' },
        ].map(({ label, count, color }) => (
          <div key={label} className="card text-center py-3">
            <p style={{ fontSize:28, fontWeight:900, color, margin:0 }}>{count}</p>
            <p className="text-xs font-semibold mt-1" style={{ color:'var(--text-secondary)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FiClipboard}     label="All Inspections"  value={insps.length}   sub="Recent inspections"       color="#2563eb" to="/inspections"/>
        <StatCard icon={FiAlertOctagon}  label="Open Violations"  value={viols.length}   sub="Needs attention"          color="#dc2626" to="/violations"/>
        <StatCard icon={FiAlertTriangle} label="Open Incidents"   value={incs.length}    sub="Active incidents"         color="#ea580c" to="/incidents"/>
        <StatCard icon={FiFileText}      label="Field Reports"    value={reports.length} sub="Recent reports"           color="#7c3aed" to="/field-reports"/>
      </div>

      {/* Assigned inspections — PRIMARY FOCUS */}
      <Panel title="📋 Assigned Inspections" to="/inspections" toLabel="All Inspections">
        {insps.length ? insps.map(i => <InspectionRow key={i.id} ins={i}/>) : <NoData message="No inspections assigned"/>}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Open Violations" to="/violations">
          {viols.length ? viols.map(v => <ViolationRow key={v.id} v={v}/>) : <NoData message="No open violations"/>}
        </Panel>
        <Panel title="Active Incidents" to="/incidents">
          {incs.length ? incs.map(i => <IncidentRow key={i.id} inc={i}/>) : <NoData message="No active incidents"/>}
        </Panel>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to:'/inspections',   label:'Start Inspection', icon:FiClipboard,    color:'#2563eb' },
          { to:'/incidents',     label:'Report Incident',  icon:FiAlertTriangle,color:'#dc2626' },
          { to:'/field-reports', label:'Field Report',     icon:FiFileText,     color:'#7c3aed' },
          { to:'/attendance',    label:'Attendance',       icon:FiCheckSquare,  color:'#16a34a' },
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
