import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import { FiBarChart2, FiDownload, FiTarget, FiAlertOctagon } from 'react-icons/fi';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ScatterChart, Scatter,
} from 'recharts';
import { analyticsApi, reportsApi } from '../../services/api';
import { formatMT, downloadBlob, scoreToColor } from '../../utils/helpers';
import ScoreBar from '../../components/ui/ScoreBar';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const AMBER = '#f59e0b'; const DANGER = '#ef4444'; const SUCCESS = '#22c55e';
const CYAN = '#06b6d4'; const ORANGE = '#f97316';
const PIE_COLORS = [DANGER, AMBER, CYAN, SUCCESS, ORANGE, '#8b5cf6'];

export default function Analytics() {
  const [ranking,    setRanking]    = useState([]);
  const [violation,  setViolation]  = useState(null);
  const [production, setProduction] = useState([]);
  const [trend,      setTrend]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('overview');
  const [dlPDF,      setDlPDF]      = useState(false);
  const [dlXLS,      setDlXLS]      = useState(false);

  useEffect(() => {
    Promise.all([
      analyticsApi.getMineRanking(),
      analyticsApi.getViolationAnalytics(),
      analyticsApi.getProductionAnalytics(),
      analyticsApi.getComplianceTrend({ months: 12 }),
    ]).then(([r, v, p, t]) => {
      setRanking(r.data);
      setViolation(v.data);
      setProduction(p.data);
      setTrend(t.data.map(d => ({
        month:      new Date(d.month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        violations: parseInt(d.violations) || 0,
        critical:   parseInt(d.critical)   || 0,
        resolved:   parseInt(d.resolved)   || 0,
      })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const downloadPDF = async () => {
    setDlPDF(true);
    try { const r = await reportsApi.downloadPDF({ type: 'compliance' }); downloadBlob(r, 'KhanNetra-Compliance-Report.pdf'); toast.success('PDF downloaded'); }
    catch {} finally { setDlPDF(false); }
  };
  const downloadExcel = async () => {
    setDlXLS(true);
    try { const r = await reportsApi.downloadExcel({}); downloadBlob(r, 'KhanNetra-Export.xlsx'); toast.success('Excel downloaded'); }
    catch {} finally { setDlXLS(false); }
  };

  if (loading) return <PageLoader />;

  const TABS = ['overview', 'violations', 'production', 'ranking'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiBarChart2 className="text-amber-400" /> Analytics
          </h1>
          <p className="page-subtitle">Data-driven insights across all mines and compliance parameters</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPDF} disabled={dlPDF} className="btn-outline btn-sm">
            <FiDownload size={14}/> {dlPDF ? 'Generating…' : 'PDF'}
          </button>
          <button onClick={downloadExcel} disabled={dlXLS} className="btn-primary btn-sm">
            <FiDownload size={14}/> {dlXLS ? 'Exporting…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx('tab-item capitalize', tab === t && 'active')}>
            {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-5"><BackButton className="mb-1"/>
          <div className="card">
            <h3 className="section-title">Violation Trends — 12 Months</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#343a40" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6c757d' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6c757d' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="violations" stroke={AMBER}   strokeWidth={2} name="Total" dot={false} />
                <Line type="monotone" dataKey="critical"   stroke={DANGER}  strokeWidth={2} name="Critical" dot={false} />
                <Line type="monotone" dataKey="resolved"   stroke={SUCCESS} strokeWidth={2} name="Resolved" dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <h3 className="section-title">Violations by Severity</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={violation?.bySeverity || []} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                    label={({ severity, count }) => `${severity}: ${count}`}>
                    {(violation?.bySeverity || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:'#1c2333', border:'1px solid #343a40', borderRadius:'10px', fontSize:'12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <h3 className="section-title">Violations by Type</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(violation?.byType || []).slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#343a40" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6c757d' }} />
                  <YAxis dataKey="type" type="category" tick={{ fontSize: 11, fill: '#6c757d' }} width={90} />
                  <Tooltip />
                  <Bar dataKey="count" fill={AMBER} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── VIOLATIONS ── */}
      {tab === 'violations' && (
        <div className="card">
          <h3 className="section-title">Violations by State</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={violation?.byState || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#343a40" />
              <XAxis dataKey="state" tick={{ fontSize: 11, fill: '#6c757d' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6c757d' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count"          fill={DANGER} name="Violations"     radius={[4,4,0,0]} />
              <Bar dataKey="avg_compliance" fill={SUCCESS} name="Avg Compliance" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── PRODUCTION ── */}
      {tab === 'production' && (
        <div className="card space-y-3">
          <h3 className="section-title">Mine Production vs Capacity</h3>
          {production.map(mine => {
            const util = parseFloat(mine.capacity_utilization || 0);
            const barColor = util >= 90 ? 'bg-success-500' : util >= 70 ? 'bg-amber-500' : 'bg-danger-500';
            return (
              <div key={mine.name} className="p-4 rounded-xl bg-coal-800/50 border border-coal-700/40">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-bold text-coal-200">{mine.name}</span>
                    <span className="text-xs text-coal-500 ml-2">({mine.state})</span>
                  </div>
                  <span className={clsx('text-sm font-black', util >= 90 ? 'text-success-400' : util >= 70 ? 'text-amber-400' : 'text-danger-400')}>
                    {util.toFixed(1)}%
                  </span>
                </div>
                <div className="flex gap-4 text-[11px] text-coal-500 mb-2">
                  <span>Actual: <strong className="text-coal-300">{formatMT(mine.current_production_mt)}</strong></span>
                  <span>Capacity: <strong className="text-coal-300">{formatMT(mine.production_capacity_mt)}</strong></span>
                  <span>Workers: <strong className="text-coal-300">{mine.workers_count?.toLocaleString()}</strong></span>
                </div>
                <div className="w-full bg-coal-700 rounded-full h-2 overflow-hidden">
                  <div className={clsx('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${Math.min(100, util)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── RANKING ── */}
      {tab === 'ranking' && (
        <div className="card space-y-3">
          <h3 className="section-title">Mine Compliance Ranking</h3>
          {ranking.map((mine, i) => (
            <div key={mine.id} className={clsx('p-4 rounded-xl border flex items-center gap-4',
              mine.status === 'suspended' ? 'bg-danger-600/8 border-danger-500/25' :
              mine.status === 'under_inspection' ? 'bg-amber-500/8 border-amber-500/25' :
              'bg-coal-800/40 border-coal-700/40')}>
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0',
                i === 0 ? 'bg-amber-500/25 text-amber-400 border border-amber-500/40' :
                i === 1 ? 'bg-coal-600/40 text-coal-400 border border-coal-600/40' :
                i === 2 ? 'bg-safety-500/20 text-safety-400 border border-safety-500/30' :
                'bg-coal-800 text-coal-600 border border-coal-700/40')}>
                #{i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-bold text-coal-200 text-sm">{mine.name}</span>
                  <span className="text-[11px] text-coal-600">{mine.state}</span>
                  <Badge color={mine.status === 'active' ? 'green' : mine.status === 'suspended' ? 'red' : 'yellow'}>{mine.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                  {[['Compliance', mine.compliance_score], ['Safety', mine.safety_score], ['Env.', mine.environmental_score]].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-[9px] text-coal-600 mb-0.5">{label}</p>
                      <ScoreBar score={val} showLabel={false} height="h-1" />
                    </div>
                  ))}
                </div>
              </div>
              <p className={clsx('text-2xl font-black tabular-nums shrink-0', scoreToColor(mine.compliance_score))}>
                {parseFloat(mine.compliance_score).toFixed(0)}%
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
