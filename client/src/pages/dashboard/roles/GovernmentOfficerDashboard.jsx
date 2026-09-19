/**
 * KhanNetra — Government Officer / DGMS Regulatory Authority Dashboard
 * Regulatory-focused: compliance status, violations, inspections,
 * statutory documents, high-risk mines, regulatory analytics.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCheckSquare, FiAlertOctagon, FiClipboard,
  FiTarget, FiBarChart2, FiFileText, FiMap,
  FiCpu, FiAlertTriangle, FiActivity,
} from 'react-icons/fi';
import {
  analyticsApi, violationsApi, inspectionsApi,
  riskApi, minesApi, documentsApi,
} from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, ScoreCard, Panel, NoData, ViolationRow, InspectionRow } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';
import Badge from '../../../components/ui/Badge';
import ScoreBar from '../../../components/ui/ScoreBar';

export default function GovernmentOfficerDashboard({ user }) {
  const [dash,     setDash]     = useState(null);
  const [viols,    setViols]    = useState([]);
  const [insps,    setInsps]    = useState([]);
  const [highRisk, setHighRisk] = useState([]);
  const [docs,     setDocs]     = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.allSettled([
      analyticsApi.getDashboard(),
      violationsApi.getAll({ status:'open', limit:6 }),
      inspectionsApi.getAll({ limit:6 }),
      riskApi.getHighRisk().catch(() => ({ data: { high_risk_mines: [] } })),
      documentsApi.getExpiryAlerts().catch(() => ({ data: [] })),
    ]).then(([d, v, ins, hr, docs]) => {
      setDash(d.status === 'fulfilled' ? d.value?.data : null);
      setViols(v.status === 'fulfilled' ? (v.value?.data||[]) : []);
      setInsps(ins.status === 'fulfilled' ? (ins.value?.data||[]) : []);
      setHighRisk(hr.status === 'fulfilled' ? (hr.value?.data?.high_risk_mines||[]).slice(0,5) : []);
      setDocs(docs.status === 'fulfilled' ? (Array.isArray(docs.value?.data) ? docs.value.data : docs.value?.data?.expiring || []).slice(0,5) : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4"><CardSkeleton count={4}/></div>;

  const mines      = dash?.mines      || {};
  const violations = dash?.violations || {};
  const incidents  = dash?.incidents  || {};
  const scores     = dash?.scores     || {};

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Regulatory oversight: compliance status, violations, inspections and statutory documents."
        actions={[
          { to:'/analytics',  label:'Analytics',    icon:FiBarChart2, color:'#2563eb' },
          { to:'/violations', label:'Violations',   icon:FiAlertOctagon, color:'#dc2626' },
          { to:'/ai/chat',    label:'AI Assistant', icon:FiCpu,       color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Regulatory oversight: compliance, violations, inspections and statutory documents"/>

      {/* Regulatory KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FiActivity}      label="Total Mines"      value={mines.total}         sub={`${mines.active||0} active`}          color="#2563eb" to="/mines"/>
        <StatCard icon={FiAlertOctagon}  label="Open Violations"  value={violations.open}     sub={`${violations.critical||0} critical`} color="#dc2626" to="/violations"/>
        <StatCard icon={FiClipboard}     label="Inspections"      value={insps.length}        sub="Recent inspections"                   color="#16a34a" to="/inspections"/>
        <StatCard icon={FiAlertTriangle} label="Active Incidents" value={incidents.open}      sub={`${incidents.fatal||0} fatal`}        color="#ea580c" to="/incidents"/>
      </div>

      {/* Compliance scores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard label="Compliance"    value={scores.avg_compliance} icon={FiCheckSquare}/>
        <ScoreCard label="Safety"        value={scores.avg_safety}     icon={FiAlertTriangle}/>
        <ScoreCard label="Environmental" value={scores.avg_env}        icon={FiActivity}/>
        <ScoreCard label="Risk Level"    value={scores.avg_risk}       icon={FiTarget} inverted/>
      </div>

      {/* Detail panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="🚨 Open Violations" to="/violations" toLabel="All Violations">
          {viols.length ? viols.map(v => <ViolationRow key={v.id} v={v}/>) : <NoData message="No open violations"/>}
        </Panel>
        <Panel title="🔍 Recent Inspections" to="/inspections">
          {insps.length ? insps.map(i => <InspectionRow key={i.id} ins={i}/>) : <NoData/>}
        </Panel>
        <Panel title="⚠️ High-Risk Mines" to="/risk-dashboard">
          {highRisk.length ? highRisk.map(m => (
            <div key={m.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{m.name}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{m.state} · Compliance: {Math.round(m.compliance_score||0)}%</p>
              </div>
              <Badge color="red">Risk {Math.round(m.risk_score||0)}%</Badge>
            </div>
          )) : <NoData message="No high-risk mines"/>}
        </Panel>
        <Panel title="📄 Document Alerts" to="/documents">
          {docs.length ? docs.map(d => (
            <div key={d.id} className="flex items-start justify-between py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div>
                <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{d.title}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{d.type} · Expires: {d.expiry_date}</p>
              </div>
              <Badge color={d.status==='expired'?'red':'yellow'}>{d.status}</Badge>
            </div>
          )) : <NoData message="No document alerts"/>}
        </Panel>
      </div>
    </div>
  );
}
