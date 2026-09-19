/**
 * KhanNetra — Corporate Management Dashboard
 * Multi-mine portfolio view: compliance, risk, safety trends,
 * production overview, high-risk mines comparison, analytics.
 * Real data only from analytics + risk APIs.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FiTool, FiCheckSquare, FiTarget, FiAlertTriangle,
  FiAlertOctagon, FiBarChart2, FiPieChart, FiMap,
  FiCpu, FiActivity, FiUsers,
} from 'react-icons/fi';
import {
  analyticsApi, riskApi, minesApi, disasterApi,
} from '../../../services/api';
import { RoleDashboardHeader, HeroBanner, StatCard, ScoreCard, Panel, NoData, AlertRow } from './_shared';
import { CardSkeleton } from '../../../components/ui/LoadingSpinner';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Badge from '../../../components/ui/Badge';
import ScoreBar from '../../../components/ui/ScoreBar';

export default function CorporateDashboard({ user }) {
  const [dash,     setDash]     = useState(null);
  const [trend,    setTrend]    = useState([]);
  const [highRisk, setHighRisk] = useState([]);
  const [mines,    setMines]    = useState([]);
  const [disaster, setDisaster] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.allSettled([
      analyticsApi.getDashboard(),
      analyticsApi.getComplianceTrend({ months: 6 }),
      riskApi.getHighRisk().catch(() => ({ data: { high_risk_mines: [] } })),
      minesApi.getAll({ limit: 10, status: 'active' }),
      disasterApi.getActive(),
    ]).then(([d, t, hr, m, dis]) => {
      setDash(d.status === 'fulfilled' ? d.value?.data : null);
      setTrend((t.status === 'fulfilled' ? t.value?.data || [] : []).map(r => ({
        month:      new Date(r.month).toLocaleDateString('en-IN', { month: 'short' }),
        violations: parseInt(r.violations) || 0,
        resolved:   parseInt(r.resolved)   || 0,
      })));
      setHighRisk(hr.status === 'fulfilled' ? (hr.value?.data?.high_risk_mines||[]).slice(0,5) : []);
      setMines(m.status === 'fulfilled' ? (m.value?.data||[]) : []);
      setDisaster(dis.status === 'fulfilled' ? (dis.value?.data||[]).filter(a=>['CRITICAL','HIGH'].includes(a.severity)).slice(0,3) : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4"><CardSkeleton count={4}/></div>;

  const minesData  = dash?.mines      || {};
  const violations = dash?.violations || {};
  const incidents  = dash?.incidents  || {};
  const scores     = dash?.scores     || {};

  return (
    <div className="space-y-5">
      <HeroBanner user={user}
        tagline="Organisation-wide mine portfolio: compliance, risk, safety trends and production overview."
        actions={[
          { to:'/analytics', label:'Full Analytics', icon:FiBarChart2, color:'#2563eb' },
          { to:'/mines',     label:'All Mines',      icon:FiMap,       color:'#d97706' },
          { to:'/ai/chat',   label:'AI Assistant',   icon:FiCpu,       color:'#7c3aed', primary:true },
        ]}/>
      <RoleDashboardHeader user={user} subtitle="Organisation-wide mine portfolio, compliance and risk overview"/>

      {/* Disaster alerts */}
      {disaster.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.25)' }}>
          <FiAlertTriangle size={14} style={{ color:'#dc2626', flexShrink:0 }}/>
          <span className="text-sm font-bold" style={{ color:'#dc2626' }}>🚨 {disaster.length} Active Disaster Alert{disaster.length>1?'s':''}</span>
          <Link to="/disaster" className="btn-danger btn-sm ml-auto">View →</Link>
        </div>
      )}

      {/* Portfolio KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={FiTool}          label="Total Mines"      value={minesData.total}      sub={`${minesData.active||0} active`}          color="#2563eb" to="/mines"/>
        <StatCard icon={FiUsers}         label="Total Workers"    value={minesData.total_workers} sub="Across all mines"                      color="#16a34a" to="/workers"/>
        <StatCard icon={FiAlertOctagon}  label="Open Violations"  value={violations.open}      sub={`${violations.critical||0} critical`}     color="#dc2626" to="/violations"/>
        <StatCard icon={FiAlertTriangle} label="Active Incidents" value={incidents.open}       sub={`${incidents.fatal||0} fatal`}            color="#ea580c" to="/incidents"/>
        <StatCard icon={FiActivity}      label="Avg Compliance"   value={scores.avg_compliance ? `${parseFloat(scores.avg_compliance).toFixed(0)}%` : '—'} sub="Portfolio average" color="#0f766e"/>
      </div>

      {/* Portfolio scores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ScoreCard label="Compliance"   value={scores.avg_compliance} icon={FiCheckSquare}/>
        <ScoreCard label="Safety"       value={scores.avg_safety}     icon={FiAlertTriangle}/>
        <ScoreCard label="Environmental" value={scores.avg_env}       icon={FiActivity}/>
        <ScoreCard label="Risk Level"   value={scores.avg_risk}       icon={FiTarget} inverted/>
      </div>

      {/* Compliance trend chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="section-title mb-0">Portfolio Violation Trend</h3>
            <p className="text-[11px]" style={{ color:'var(--text-muted)' }}>Last 6 months — total violations vs resolved</p>
          </div>
          <Link to="/analytics" className="btn-outline btn-sm">Full Analytics</Link>
        </div>
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend} margin={{ top:0, right:0, bottom:0, left:-20 }}>
              <defs>
                <linearGradient id="corpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="corpRes"  x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="month" tick={{ fontSize:11, fill:'var(--text-muted)' }}/>
              <YAxis tick={{ fontSize:11, fill:'var(--text-muted)' }}/>
              <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }}/>
              <Area type="monotone" dataKey="violations" name="Violations" stroke="#f59e0b" fill="url(#corpGrad)" strokeWidth={2}/>
              <Area type="monotone" dataKey="resolved"   name="Resolved"   stroke="#22c55e" fill="url(#corpRes)"  strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        ) : <NoData message="No trend data available"/>}
      </div>

      {/* Mine comparison + risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="⚠️ High-Risk Mines" to="/risk-dashboard" toLabel="Risk Dashboard">
          {highRisk.length ? highRisk.map(m => (
            <div key={m.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{m.name}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{m.state} · Compliance: {Math.round(m.compliance_score || 0)}%</p>
              </div>
              <div style={{ width:80 }}>
                <ScoreBar score={100 - (m.risk_score || 0)} showLabel={false} height="h-1.5"/>
              </div>
              <Badge color="red">Risk {Math.round(m.risk_score || 0)}%</Badge>
            </div>
          )) : <NoData message="No high-risk mines"/>}
        </Panel>

        <Panel title="Mine Portfolio" to="/mines" toLabel="All Mines">
          {mines.length ? mines.map(m => (
            <div key={m.id} className="flex items-center justify-between py-2.5" style={{ borderBottom:'1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{m.name}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{m.state} · {m.type}</p>
              </div>
              <Badge color={m.status==='active'?'green':m.status==='suspended'?'red':'yellow'} dot>
                {m.compliance_score ? `${Math.round(m.compliance_score)}%` : m.status}
              </Badge>
            </div>
          )) : <NoData/>}
        </Panel>
      </div>
    </div>
  );
}
