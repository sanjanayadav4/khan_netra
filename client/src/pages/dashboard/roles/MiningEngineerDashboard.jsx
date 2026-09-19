/**
 * KhanNetra — Mining Engineer Dashboard
 * Operational focus: mine status, production, technical inspections,
 * mine plans, risk, operational incidents, field reports.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiTool, FiLayers, FiMap, FiTarget, FiAlertTriangle,
  FiClipboard, FiFileText, FiCpu, FiPackage, FiActivity,
} from 'react-icons/fi';
import {
  minesApi, inspectionsApi, incidentsApi, fieldReportsApi,
  riskApi, minePlansApi,
} from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, Panel, NoData, IncidentRow, InspectionRow } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';
import { formatDate } from '../../../utils/helpers';
import Badge from '../../../components/ui/Badge';

export default function MiningEngineerDashboard({ user }) {
  const [mine,    setMine]    = useState(null);
  const [insps,   setInsps]   = useState([]);
  const [incs,    setIncs]    = useState([]);
  const [reports, setReports] = useState([]);
  const [mpsStats,setMpsStats]= useState(null);
  const [highRisk,setHighRisk]= useState([]);
  const [loading, setLoading] = useState(true);
  const mineId = user?.mine_id;

  useEffect(() => {
    Promise.allSettled([
      mineId ? minesApi.getById(mineId) : Promise.resolve(null),
      inspectionsApi.getAll({ ...(mineId ? { mine_id: mineId } : {}), limit:5 }),
      incidentsApi.getAll({ ...(mineId ? { mine_id: mineId } : {}), limit:5 }),
      fieldReportsApi.getAll({ ...(mineId ? { mine_id: mineId } : {}), limit:5 }),
      minePlansApi.getStats().catch(() => ({ data:null })),
      riskApi.getHighRisk().catch(() => ({ data:{ high_risk_mines:[] } })),
    ]).then(([m, ins, i, fr, mps, hr]) => {
      setMine(m?.status === 'fulfilled' ? m.value?.data : null);
      setInsps(ins.status === 'fulfilled' ? (ins.value?.data||[]) : []);
      setIncs(i.status === 'fulfilled' ? (i.value?.data||[]) : []);
      setReports(fr.status === 'fulfilled' ? (fr.value?.data||[]) : []);
      setMpsStats(mps.status === 'fulfilled' ? mps.value?.data : null);
      setHighRisk(hr.status === 'fulfilled' ? (hr.value?.data?.high_risk_mines||[]).slice(0,4) : []);
    }).finally(() => setLoading(false));
  }, [mineId]);

  if (loading) return <div className="space-y-4"><CardSkeleton count={4}/></div>;

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Mine operations, production, technical inspections and engineering overview."
        actions={[
          { to:'/mines',      label:'Mine Map',     icon:FiMap,     color:'#2563eb' },
          { to:'/mine-plans', label:'Mine Plans',   icon:FiPackage, color:'#d97706' },
          { to:'/ai/chat',    label:'AI Assistant', icon:FiCpu,     color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Mine operations, production and technical engineering overview"/>

      {/* Mine summary */}
      {mine && (
        <div className="card p-4" style={{ background:'linear-gradient(135deg,var(--bg-card),rgba(2,132,199,.04))', border:'1px solid rgba(2,132,199,.2)' }}>
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color:'var(--text-muted)' }}>Assigned Mine</p>
              <p className="text-xl font-black" style={{ color:'var(--text-primary)' }}>{mine.name}</p>
              <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{mine.type} · {mine.state} · {mine.mining_method || 'N/A'}</p>
            </div>
            {[
              { label:'Depth', value:mine.depth_meters ? `${mine.depth_meters}m` : '—' },
              { label:'Area',  value:mine.area_hectares ? `${mine.area_hectares} ha` : '—' },
              { label:'Production', value:mine.current_production_mt ? `${(mine.current_production_mt/1000).toFixed(0)}K MT` : '—' },
              { label:'Workers',   value:mine.workers_count || '—' },
              { label:'Status',    value:mine.status?.toUpperCase() },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:'var(--text-muted)' }}>{label}</p>
                <p className="text-base font-bold mt-0.5" style={{ color:'var(--text-primary)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FiPackage}       label="Mine Plans"     value={mpsStats?.total_plans ?? '—'}     sub={`${mpsStats?.pending_review||0} pending`} color="#d97706" to="/mine-plans"/>
        <StatCard icon={FiClipboard}     label="Inspections"    value={insps.length}                     sub="Recent inspections"                        color="#2563eb" to="/inspections"/>
        <StatCard icon={FiAlertTriangle} label="Open Incidents" value={incs.length}                      sub="In assigned area"                          color="#ea580c" to="/incidents"/>
        <StatCard icon={FiFileText}      label="Field Reports"  value={reports.length}                   sub="Recent reports"                            color="#7c3aed" to="/field-reports"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Technical Inspections" to="/inspections">
          {insps.length ? insps.map(i => <InspectionRow key={i.id} ins={i}/>) : <NoData/>}
        </Panel>
        <Panel title="Operational Incidents" to="/incidents">
          {incs.length ? incs.map(i => <IncidentRow key={i.id} inc={i}/>) : <NoData message="No open incidents"/>}
        </Panel>
        <Panel title="High-Risk Mines" to="/risk-dashboard">
          {highRisk.length ? highRisk.map(m => (
            <div key={m.id} className="flex items-center justify-between py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div>
                <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{m.name}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{m.state}</p>
              </div>
              <Badge color="red">Risk {Math.round(m.risk_score)}%</Badge>
            </div>
          )) : <NoData/>}
        </Panel>
        <Panel title="Field Reports" to="/field-reports">
          {reports.length ? reports.map(r => (
            <div key={r.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{r.title}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{r.report_type} · {formatDate(r.created_at)}</p>
              </div>
              <Badge color={r.severity==='critical'?'red':r.severity==='high'?'orange':'yellow'}>{r.severity}</Badge>
            </div>
          )) : <NoData/>}
        </Panel>
      </div>
    </div>
  );
}
