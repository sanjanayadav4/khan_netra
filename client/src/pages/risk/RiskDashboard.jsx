/**
 * KhanNetra DGMS — AI Risk Prediction & Early Warning Dashboard
 *
 * Two views:
 *  1. National Dashboard — high-risk mines ranking, recurring violations,
 *     anomaly indicators, trend charts (all roles)
 *  2. Mine Deep-Dive — select a mine to get a full AI analysis:
 *     current risk score + predictive risk + recurring violations + anomalies
 *     — each with explainable evidence trail
 *
 * Alert types shown:
 *   🔴 HIGH_RISK           — current risk score is high/critical
 *   ⚠️  PREDICTED_RISK     — trend-based future risk projection
 *   🔁 RECURRING_VIOLATION — same violation repeating over time
 *   🚨 ANOMALY_DETECTED    — statistical spike vs baseline
 *
 * All data from real backend DB. No hardcoded scores.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertTriangle, FiTrendingUp, FiAlertCircle, FiRefreshCw,
  FiShield, FiMapPin, FiActivity, FiZap, FiSearch,
  FiChevronRight, FiInfo, FiCpu, FiAlertOctagon,
  FiBarChart2, FiRepeat, FiTarget,
} from 'react-icons/fi';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { riskApi, minesApi } from '../../services/api';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import ScoreBar from '../../components/ui/ScoreBar';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatDate, scoreToColor } from '../../utils/helpers';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

/* ── Helpers ─────────────────────────────────────────────────────────── */
const RISK_COLOR = { CRITICAL:'#dc2626', HIGH:'#ea580c', MEDIUM:'#d97706', LOW:'#16a34a' };
const RISK_BG    = { CRITICAL:'rgba(220,38,38,.10)', HIGH:'rgba(234,88,12,.08)', MEDIUM:'rgba(245,158,11,.08)', LOW:'rgba(22,163,74,.07)' };
const RISK_BORDER= { CRITICAL:'rgba(220,38,38,.35)', HIGH:'rgba(234,88,12,.30)', MEDIUM:'rgba(245,158,11,.30)', LOW:'rgba(22,163,74,.25)' };
const RISK_BADGE = { CRITICAL:'red', HIGH:'orange', MEDIUM:'yellow', LOW:'green' };

const ALERT_STYLE = {
  HIGH_RISK:           { border:'rgba(220,38,38,.35)', bg:'rgba(220,38,38,.06)',  titleColor:'#dc2626' },
  PREDICTED_RISK:      { border:'rgba(245,158,11,.35)',bg:'rgba(245,158,11,.06)', titleColor:'#d97706' },
  RECURRING_VIOLATION: { border:'rgba(139,92,246,.35)',bg:'rgba(139,92,246,.06)', titleColor:'#7c3aed' },
  ANOMALY_DETECTED:    { border:'rgba(59,130,246,.35)', bg:'rgba(59,130,246,.06)',titleColor:'#2563eb' },
};

function riskLevel(score) {
  const s = parseFloat(score || 0);
  return s >= 75 ? 'CRITICAL' : s >= 50 ? 'HIGH' : s >= 25 ? 'MEDIUM' : 'LOW';
}

function scoreColor(score) {
  const s = parseFloat(score || 0);
  return s >= 75 ? '#dc2626' : s >= 50 ? '#ea580c' : s >= 25 ? '#d97706' : '#16a34a';
}

/* ── Alert card component ─────────────────────────────────────────────── */
function AlertCard({ alert }) {
  const [expanded, setExpanded] = useState(false);
  const st = ALERT_STYLE[alert.alert_type] || ALERT_STYLE.PREDICTED_RISK;
  const sevBadge = { CRITICAL:'red', HIGH:'orange', MEDIUM:'yellow', LOW:'blue' };

  return (
    <div className="rounded-xl p-4 transition-all"
      style={{ background:st.bg, border:`1px solid ${st.border}` }}>
      <div className="flex items-start gap-3">
        <span style={{ fontSize:20, flexShrink:0, lineHeight:1 }}>{alert.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge color={sevBadge[alert.severity]||'gray'}>{alert.severity}</Badge>
            <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-muted)' }}>
              {alert.alert_type?.replace(/_/g,' ')}
            </span>
            {alert.confidence && (
              <span style={{ fontSize:9, padding:'1px 6px', borderRadius:999, background:'var(--bg-card-hover)', border:'1px solid var(--border)', color:'var(--text-muted)', fontWeight:600 }}>
                {alert.confidence} confidence
              </span>
            )}
          </div>
          <p className="font-bold text-sm mb-1" style={{ color: st.titleColor }}>{alert.title}</p>
          <p className="text-xs leading-relaxed" style={{ color:'var(--text-secondary)' }}>{alert.body}</p>

          {alert.data_points?.length > 0 && (
            <div style={{ marginTop:8, height:48 }}>
              <ResponsiveContainer width="100%" height={48}>
                <AreaChart data={alert.data_points} margin={{ top:0, right:0, bottom:0, left:0 }}>
                  <Area type="monotone" dataKey="value" stroke={st.titleColor} fill={`${st.titleColor}20`} strokeWidth={1.5}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {alert.factors?.length > 0 && expanded && (
            <div className="mt-3 space-y-1.5">
              {alert.factors.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg"
                  style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate" style={{ color:'var(--text-primary)' }}>{f.name}</p>
                    <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{f.evidence}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-bold" style={{ color: f.raw > 0 ? '#dc2626' : '#16a34a' }}>
                      {Math.round(f.normalised)}%
                    </p>
                    <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>wt {f.weight}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {alert.action && (
              <p style={{ fontSize:11, color:'var(--text-secondary)', background:'var(--bg-card-hover)', padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', flex:1 }}>
                💡 {alert.action}
              </p>
            )}
            {(alert.factors?.length > 0) && (
              <button onClick={() => setExpanded(v => !v)}
                style={{ fontSize:10, fontWeight:700, color:st.titleColor, background:'none', border:'none', cursor:'pointer', whiteSpace:'nowrap' }}>
                {expanded ? 'Hide factors ▲' : `See ${alert.factors.length} factors ▼`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MINE ANALYSIS PANEL
════════════════════════════════════════════════════════════════════════ */
function MineAnalysisPanel({ mineId, mineName, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    riskApi.getFullAnalysis(mineId)
      .then(r => setAnalysis(r.data))
      .catch(() => setError('Failed to load analysis — check connection'))
      .finally(() => setLoading(false));
  }, [mineId]);

  if (loading) return (
    <div className="card">
      <div className="flex items-center gap-3 py-8 justify-center">
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor:'var(--border)', borderTopColor:'var(--accent)' }}/>
        <p style={{ color:'var(--text-muted)', fontSize:13 }}>Running AI analysis for {mineName}…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="card text-center py-8">
      <FiAlertCircle size={28} style={{ color:'#dc2626', margin:'0 auto 8px' }}/>
      <p style={{ color:'#dc2626', fontSize:13 }}>{error}</p>
      <button onClick={onClose} className="btn-outline btn-sm mt-3">← Back</button>
    </div>
  );

  if (!analysis) return null;

  const { current_risk: cr, summary: sum, alert_feed, predictive_risk: pr, recurring_violations: rv } = analysis;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onClose} className="flex items-center gap-1 text-sm mb-2 transition-colors"
            style={{ color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color='var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
            ← Back to dashboard
          </button>
          <h2 className="text-xl font-black" style={{ color:'var(--text-primary)' }}>
            {analysis.mine_name}
          </h2>
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>
            {analysis.mine_state} · AI Risk Analysis
          </p>
        </div>
        <div style={{ padding:'12px 18px', borderRadius:14, textAlign:'center', background:RISK_BG[cr.level], border:`2px solid ${RISK_BORDER[cr.level]}` }}>
          <p style={{ fontSize:36, fontWeight:900, color:RISK_COLOR[cr.level], margin:0, lineHeight:1 }}>{cr.score}</p>
          <p style={{ fontSize:10, fontWeight:700, color:RISK_COLOR[cr.level], margin:'4px 0 0', textTransform:'uppercase' }}>
            Risk Score
          </p>
          <Badge color={RISK_BADGE[cr.level]}>{cr.level}</Badge>
        </div>
      </div>

      {/* Alert summary pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label:`${sum.critical_alerts} Critical`, color:'#dc2626', show: sum.critical_alerts > 0 },
          { label:`${sum.high_alerts} High`,     color:'#ea580c', show: sum.high_alerts > 0       },
          { label:`${sum.predictions_count} Predictions`, color:'#d97706', show: sum.predictions_count > 0 },
          { label:`${sum.recurring_count} Recurring`,     color:'#7c3aed', show: sum.recurring_count > 0   },
          { label:`${sum.anomaly_count} Anomalies`,       color:'#2563eb', show: sum.anomaly_count > 0      },
        ].filter(p => p.show).map(p => (
          <span key={p.label} style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:`${p.color}15`, border:`1px solid ${p.color}40`, color:p.color }}>
            {p.label}
          </span>
        ))}
        {sum.total_alerts === 0 && (
          <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:'rgba(22,163,74,.12)', border:'1px solid rgba(22,163,74,.3)', color:'#16a34a' }}>
            ✓ No active alerts
          </span>
        )}
      </div>

      {/* Alert feed */}
      {alert_feed.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color:'var(--text-muted)' }}>
            Alert Feed ({alert_feed.length} alerts — sorted by severity)
          </p>
          {alert_feed.map((alert, i) => <AlertCard key={i} alert={alert}/>)}
        </div>
      )}

      {/* Factor breakdown */}
      {cr.factors?.length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2 mb-4">
            <FiBarChart2 size={14} style={{ color:'var(--accent)' }}/> Risk Factor Breakdown
          </h3>
          <div className="space-y-2">
            {cr.factors.filter(f => f.raw >= 0).map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-40 shrink-0">
                  <p className="text-[11px] font-semibold truncate" style={{ color:'var(--text-primary)' }}>{f.name}</p>
                  <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>wt {f.weight}%</p>
                </div>
                <div className="flex-1">
                  <div style={{ height:6, borderRadius:999, background:'var(--border)', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:999,
                      width:`${f.normalised}%`,
                      background: f.normalised >= 75?'#dc2626':f.normalised >= 50?'#ea580c':f.normalised >= 25?'#d97706':'#16a34a',
                      transition:'width .5s',
                    }}/>
                  </div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, minWidth:32, textAlign:'right', color: f.raw > 0 ? scoreColor(100 - f.normalised) : '#16a34a' }}>
                  {f.raw > 0 ? Math.round(f.normalised) + '%' : '✓'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:12, padding:'10px 12px', borderRadius:8, background:'var(--blue-bg)', border:'1px solid var(--blue-border)' }}>
            <p style={{ fontSize:11, color:'var(--text-secondary)', margin:0, lineHeight:1.5 }}>
              <strong style={{ color:'var(--blue)' }}>Model: </strong>
              Evidence-based weighted scoring (v1.0). Each factor is normalised 0–100 then multiplied by its weight.
              Score = sum of weighted factors + license expired bonus. Data source: violations, incidents, environment, documents, compliance deadlines.
            </p>
          </div>
        </div>
      )}

      {/* Prediction trend data */}
      {pr?.predictions?.filter(p => p.data_points?.length > 2).map((pred, i) => (
        <div key={i} className="card">
          <h3 className="section-title mb-3" style={{ color: pred.severity === 'CRITICAL' ? '#dc2626' : pred.severity === 'HIGH' ? '#ea580c' : '#d97706' }}>
            {pred.icon} {pred.category} — Trend
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={pred.data_points} margin={{ top:0, right:0, bottom:0, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="period" tick={{ fontSize:10, fill:'var(--text-muted)' }}/>
              <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }}/>
              <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}/>
              <Area type="monotone" dataKey="value" name="Count"
                stroke={pred.severity === 'CRITICAL' ? '#dc2626' : pred.severity === 'HIGH' ? '#ea580c' : '#d97706'}
                fill={`${pred.severity === 'CRITICAL' ? '#dc2626' : '#ea580c'}20`}
                strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
            Projected next period: <strong style={{ color: pred.severity==='CRITICAL'?'#dc2626':'#ea580c' }}>{pred.projected_value}</strong>
            {pred.confidence && ` (${pred.confidence} confidence)`}
          </p>
        </div>
      ))}

      {/* Recurring violations */}
      {rv?.length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2 mb-4">
            <FiRepeat size={14} style={{ color:'#7c3aed' }}/> Recurring Violations ({rv.length})
          </h3>
          <div className="space-y-2">
            {rv.map((r, i) => (
              <div key={i} className="p-3 rounded-xl"
                style={{ background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.25)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>
                      🔁 {r.category} — {r.type}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color:'var(--text-muted)' }}>
                      Occurred {r.occurrences}× in {r.analysis_window} · {r.open_count} still open
                      · Last: {formatDate(r.last_detected)}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color:'var(--text-muted)' }}>
                      Total fines: ₹{Number(r.total_fines).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <Badge color={r.worst_severity==='critical'?'red':r.worst_severity==='high'?'orange':'yellow'}>
                    {r.worst_severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI disclaimer */}
      <div style={{ padding:'10px 14px', borderRadius:10, background:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p style={{ fontSize:11, color:'var(--text-muted)', margin:0, lineHeight:1.5 }}>
          <FiInfo size={11} style={{ display:'inline', marginRight:4 }}/>
          <strong>Disclaimer:</strong> All risk scores and predictions are computed algorithmically from real database records.
          Results represent statistical patterns only and should be reviewed by qualified safety professionals.
          Data freshness: {new Date(analysis.generated_at).toLocaleString('en-IN')}.
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════════════════════════════════════════════ */
export default function RiskDashboard() {
  const { user } = useAuthStore();
  const [data,        setData]        = useState(null);
  const [roleData,    setRoleData]    = useState(null);
  const [mines,       setMines]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [searchQ,     setSearchQ]     = useState('');
  const [selectedMine,setSelectedMine]= useState(null);  // {id, name} for deep-dive
  const [analysisMinId, setAnalysisMinId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hr, rb, ms] = await Promise.all([
        riskApi.getHighRisk(),
        riskApi.getRoleBased(),
        minesApi.getAll({ limit: 100 }),
      ]);
      setData(hr.data);
      setRoleData(rb);
      setMines(ms.data || []);
    } catch {}
    finally { setLoading(false); setLastRefresh(new Date()); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader message="Running AI risk analysis…"/>;

  /* ── Mine search + analysis trigger ─────────────────────────────── */
  const filteredMines = searchQ.trim()
    ? mines.filter(m => m.name.toLowerCase().includes(searchQ.toLowerCase()) || m.mine_id?.toLowerCase().includes(searchQ.toLowerCase()))
    : [];

  const trendData = (data?.compliance_trend || []).map(t => ({
    month:      t.month,
    violations: parseInt(t.violations) || 0,
    critical:   parseInt(t.critical)   || 0,
  }));

  const catData = (data?.top_categories || []).slice(0,6).map(c => ({
    name:  (c.category||'Unknown').substring(0,12),
    count: parseInt(c.count),
  }));

  /* ── Render: mine analysis drill-down ───────────────────────────── */
  if (analysisMinId) {
    return (
      <div className="space-y-5">
        <BackButton/>
        <MineAnalysisPanel
          mineId={analysisMinId.id}
          mineName={analysisMinId.name}
          onClose={() => setAnalysisMinId(null)}
        />
      </div>
    );
  }

  /* ── Main dashboard ─────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      <BackButton/>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiTarget style={{ color:'var(--accent)' }}/> AI Risk Prediction
          </h1>
          <p className="page-subtitle">
            Evidence-based risk scoring · Predictive analysis · Recurring violations · Anomaly detection
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color:'var(--text-muted)' }}>
            Refreshed {lastRefresh.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
          </span>
          <button onClick={load} className="btn-outline btn-sm"><FiRefreshCw size={13}/> Refresh</button>
        </div>
      </div>

      {/* Mine selector for AI analysis */}
      <div className="card p-4">
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'var(--text-muted)' }}>
          <FiCpu size={11} style={{ display:'inline', marginRight:4 }}/> Run AI Analysis for a Specific Mine
        </p>
        <div className="relative">
          <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            className="input" style={{ paddingLeft:32 }}
            placeholder="Search mine name or ID to run AI analysis…"/>
        </div>
        {filteredMines.length > 0 && (
          <div className="mt-2 space-y-1">
            {filteredMines.slice(0, 6).map(m => (
              <button key={m.id} onClick={() => { setAnalysisMinId({ id:m.id, name:m.name }); setSearchQ(''); }}
                className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl text-left transition-all"
                style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--hover-accent-border)'; e.currentTarget.style.background='var(--hover-accent-bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-card-hover)'; }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{m.name}</p>
                  <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{m.mine_id} · {m.state}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span style={{ fontSize:11, fontWeight:700, color: scoreColor(m.risk_score) }}>
                    Risk {Math.round(m.risk_score||0)}%
                  </span>
                  <FiChevronRight size={12} style={{ color:'var(--text-muted)' }}/>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Role-based panel */}
      {roleData && <RolePanel role={roleData.role} data={roleData.data} onAnalyse={setAnalysisMinId}/>}

      {/* High-risk mines */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title flex items-center gap-2 mb-0">
            <FiAlertCircle style={{ color:'#dc2626' }}/> High-Risk Mines Ranking
          </h3>
          {data?.meta?.data_freshness && (
            <span className="text-[10px] font-mono" style={{ color:'var(--text-muted)' }}>
              {data.meta.risk_model} · {new Date(data.meta.data_freshness).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {(data?.high_risk_mines || []).slice(0,8).map((mine, i) => {
            const displayScore = mine.computed_risk_score ?? parseFloat(mine.risk_score);
            const level        = mine.computed_risk_level  ?? riskLevel(displayScore);
            const evidence     = mine.evidence || [];
            return (
              <div key={mine.id} className="flex items-start gap-3 p-3 rounded-xl transition-all"
                style={{ background:RISK_BG[level], border:`1px solid ${RISK_BORDER[level]}` }}>
                {/* Rank */}
                <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900,
                  background: i===0?'rgba(220,38,38,.25)':i<=2?'rgba(234,88,12,.20)':'var(--bg-card-hover)',
                  color: i===0?'#dc2626':i<=2?'#ea580c':'var(--text-muted)' }}>
                  #{i+1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{mine.name}</span>
                    <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>{mine.state}</span>
                    <Badge color={mine.status==='suspended'?'red':mine.status==='active'?'green':'yellow'}>{mine.status}</Badge>
                  </div>
                  {/* Evidence trail */}
                  {evidence.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {evidence.slice(0,4).map((e, ei) => (
                        <span key={ei} style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'rgba(220,38,38,.10)', color:'#dc2626', border:'1px solid rgba(220,38,38,.20)' }}>
                          {e}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px]" style={{ color:'var(--text-muted)' }}>
                      {mine.critical_violations||0} critical violations · {mine.recent_serious_incidents||0} serious incidents (90d) · {mine.env_alerts||0} env alerts
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <p style={{ fontSize:22, fontWeight:900, color:RISK_COLOR[level], margin:0, lineHeight:1 }}>
                    {Math.round(displayScore)}
                  </p>
                  <Badge color={RISK_BADGE[level]}>{level}</Badge>
                  <button onClick={() => setAnalysisMinId({ id:mine.id, name:mine.name })}
                    style={{ fontSize:10, fontWeight:700, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
                    <FiCpu size={10}/> Analyse
                  </button>
                </div>
              </div>
            );
          })}
          {!data?.high_risk_mines?.length && (
            <p className="text-center py-6" style={{ color:'var(--text-muted)', fontSize:13 }}>No high-risk mines detected</p>
          )}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <h3 className="section-title">Violation Trend (6 Months)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top:0,right:0,bottom:0,left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="month" tick={{ fontSize:11, fill:'var(--text-muted)' }}/>
              <YAxis tick={{ fontSize:11, fill:'var(--text-muted)' }}/>
              <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}/>
              <Line type="monotone" dataKey="violations" stroke="var(--accent)" strokeWidth={2} name="Total" dot={false}/>
              <Line type="monotone" dataKey="critical"   stroke="#dc2626"        strokeWidth={2} name="Critical" dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="section-title">Top Violation Categories</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={catData} layout="vertical" margin={{ top:0,right:0,bottom:0,left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis type="number" tick={{ fontSize:10, fill:'var(--text-muted)' }}/>
              <YAxis dataKey="name" type="category" tick={{ fontSize:10, fill:'var(--text-muted)' }} width={80}/>
              <Tooltip contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, fontSize:11 }}/>
              <Bar dataKey="count" name="Count" radius={[0,4,4,0]}>
                {catData.map((_,i) => <Cell key={i} fill={i===0?'#dc2626':i<=2?'#ea580c':'#3b82f6'}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recurring violations */}
      {data?.recurring_violations?.length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <FiRepeat style={{ color:'#7c3aed' }}/> 🔁 Recurring Violations Detected
          </h3>
          <p className="text-xs mb-3" style={{ color:'var(--text-muted)' }}>
            Same violation category/type repeating 2+ times in 180 days — indicates systemic issue.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.recurring_violations.slice(0,8).map((r, i) => (
              <div key={i} className="p-3 rounded-xl"
                style={{ background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.25)' }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>
                    {r.category} — {r.type}
                  </span>
                  <span style={{ fontSize:16, fontWeight:900, color:'#7c3aed' }}>{r.occurrences}×</span>
                </div>
                <p className="text-[11px]" style={{ color:'var(--text-muted)' }}>
                  {r.mine_name} · Last: {formatDate(r.last_detected)}
                </p>
                <p className="text-[10px] mt-1" style={{ color:'var(--text-muted)' }}>
                  {r.open_count > 0 && <span style={{ color:'#dc2626', fontWeight:700 }}>{r.open_count} still open · </span>}
                  Fines: ₹{Number(r.total_fines).toLocaleString('en-IN')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomaly indicators */}
      {data?.anomaly_mines?.length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <FiZap style={{ color:'#d97706' }}/> 🚨 Anomaly Indicators
          </h3>
          <p className="text-xs mb-3" style={{ color:'var(--text-muted)' }}>
            Statistical spikes detected — current rate significantly above historical baseline.
          </p>
          <div className="space-y-2">
            {data.anomaly_mines.slice(0,6).map((m, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl transition-all"
                style={{ background:'rgba(245,158,11,.06)', border:'1px solid rgba(245,158,11,.25)' }}>
                <FiAlertTriangle size={14} style={{ color:'#d97706', flexShrink:0 }}/>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>
                    {m.mine_name || m.name}
                    <span className="text-[10px] ml-2" style={{ color:'var(--text-muted)' }}>{m.state}</span>
                  </p>
                  {m.description && <p className="text-[11px] mt-0.5" style={{ color:'var(--text-muted)' }}>{m.description}</p>}
                  {!m.description && (
                    <p className="text-[11px] mt-0.5" style={{ color:'var(--text-muted)' }}>
                      {m.recent_violations||0} violations in 30d · Risk: {parseFloat(m.risk_score||0).toFixed(0)}%
                    </p>
                  )}
                </div>
                <button onClick={() => setAnalysisMinId({ id:m.mine_id||m.id, name:m.mine_name||m.name })}
                  style={{ fontSize:10, fontWeight:700, color:'var(--accent)', background:'none', border:'1px solid var(--accent-border)', borderRadius:7, padding:'4px 8px', cursor:'pointer', whiteSpace:'nowrap' }}>
                  <FiCpu size={10} style={{ display:'inline', marginRight:3 }}/>Analyse
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Role panel ───────────────────────────────────────────────────────── */
function RolePanel({ role, data, onAnalyse }) {
  if (!data) return null;

  if (role === 'mine_manager') {
    const mine = data.mine;
    if (!mine) return null;
    const level = riskLevel(data.risk_summary?.score || mine.risk_score);
    return (
      <div className="p-5 rounded-2xl" style={{ background:RISK_BG[level], border:`2px solid ${RISK_BORDER[level]}` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2 mb-3" style={{ color:'var(--text-primary)' }}>
              <FiMapPin size={14}/> {mine.name} — Your Mine
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Open Violations', data.violations?.find(v=>v.status==='open')?.c||0, '#dc2626'],
                ['Incidents (90d)',  (data.incidents||[]).reduce((s,i)=>s+parseInt(i.c),0), '#ea580c'],
                ['Env Alerts (7d)', data.env_alerts||0, '#d97706'],
                ['Overdue Deadlines', data.overdue_deadlines||0, '#dc2626'],
              ].map(([label,val,color]) => (
                <div key={label} className="rounded-xl p-3 text-center" style={{ background:'var(--bg-card)' }}>
                  <p style={{ fontSize:22, fontWeight:900, color, margin:0 }}>{val}</p>
                  <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center">
            <p style={{ fontSize:36, fontWeight:900, color:RISK_COLOR[level], lineHeight:1, margin:0 }}>
              {data.risk_summary?.score ?? Math.round(mine.risk_score || 0)}
            </p>
            <Badge color={RISK_BADGE[level]}>{level}</Badge>
            <div className="mt-2">
              <button onClick={() => onAnalyse({ id: mine.id, name: mine.name })} className="btn-primary btn-sm">
                <FiCpu size={12}/> Full AI Analysis
              </button>
            </div>
          </div>
        </div>
        {data.risk_summary?.evidence?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
            {data.risk_summary.evidence.map((e, i) => (
              <span key={i} style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:'rgba(220,38,38,.10)', color:'#dc2626', border:'1px solid rgba(220,38,38,.20)' }}>
                {e}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (role === 'inspector') {
    return (
      <div className="card">
        <h3 className="section-title flex items-center gap-2"><FiActivity size={14}/> Your Assignments</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color:'var(--text-muted)' }}>Upcoming Inspections</p>
            {(data.upcoming_inspections||[]).slice(0,4).map(i => (
              <div key={i.id} className="flex items-center justify-between py-1.5" style={{ borderBottom:'1px solid var(--border)' }}>
                <span className="text-sm" style={{ color:'var(--text-secondary)' }}>{i.mine_name}</span>
                <span className="text-xs" style={{ color:'var(--accent)' }}>{formatDate(i.scheduled_date)}</span>
              </div>
            ))}
            {!(data.upcoming_inspections||[]).length && <p className="text-xs" style={{ color:'var(--text-muted)' }}>No upcoming inspections</p>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color:'var(--text-muted)' }}>Pending Corrective Actions</p>
            {(data.pending_actions||[]).slice(0,4).map(a => (
              <div key={a.id} className="flex items-center justify-between py-1.5" style={{ borderBottom:'1px solid var(--border)' }}>
                <span className="text-sm truncate" style={{ color:'var(--text-secondary)' }}>{a.category}</span>
                <span className="text-xs ml-2" style={{ color:'#dc2626' }}>{formatDate(a.due_date)}</span>
              </div>
            ))}
            {!(data.pending_actions||[]).length && <p className="text-xs" style={{ color:'var(--text-muted)' }}>No pending actions</p>}
          </div>
        </div>
      </div>
    );
  }

  // Admin / Govt
  return (
    <div className="card">
      <h3 className="section-title flex items-center gap-2"><FiShield size={14}/> National Overview</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(data.mine_stats||[]).map(s => (
          <div key={s.status} className="rounded-xl p-3 text-center" style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
            <p className="text-2xl font-black" style={{ color:'var(--text-primary)', margin:0 }}>{s.count}</p>
            <p className="text-[10px] capitalize mt-0.5" style={{ color:'var(--text-muted)' }}>{s.status} mines</p>
            <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Avg compliance: {parseFloat(s.avg_compliance||0).toFixed(0)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}
