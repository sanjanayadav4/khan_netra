/**
 * KhanNetra — Environmental Monitoring  v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Tabs:
 *   Dashboard  — live parameter cards per mine, category KPI row, unack alerts
 *   History    — searchable/filterable readings table with date range
 *   Charts     — trend chart (hourly/daily) for any mine+parameter
 *   Alerts     — env_alerts log with acknowledge action
 *   Add Reading — manual entry form (+ sensor info)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader, LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { environmentApi, minesApi } from '../../services/api';
import { formatDate, formatDateTime, timeAgo } from '../../utils/helpers';
import { useForm } from 'react-hook-form';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  FiPlus, FiAlertTriangle, FiFeather, FiDroplet, FiVolume2,
  FiTrash2, FiRefreshCw, FiSearch, FiCheck, FiActivity,
  FiBarChart2, FiList, FiBell, FiLayers, FiFilter,
  FiCalendar, FiMapPin, FiCpu, FiWifi,
} from 'react-icons/fi';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart,
} from 'recharts';

/* ── Status helpers ─────────────────────────────────────────────────── */
const STATUS_COLOR  = { normal:'green', warning:'yellow', critical:'red', alert:'orange' };
const STATUS_ICON   = { normal:'🟢', warning:'🟡', critical:'🔴', alert:'🟠' };
const STATUS_BG     = {
  normal:   'bg-green-500/8 border-green-500/25',
  warning:  'bg-amber-500/8 border-amber-500/25',
  critical: 'bg-red-500/8   border-red-500/25',
  alert:    'bg-orange-500/8 border-orange-500/25',
};
const CAT_ICON = {
  'Air Quality': FiFeather,
  'Water':       FiDroplet,
  'Noise':       FiVolume2,
  'Waste':       FiTrash2,
  'Land':        FiLayers,
};
const CAT_COLOR = {
  'Air Quality': 'text-blue-500',
  'Water':       'text-cyan-500',
  'Noise':       'text-purple-500',
  'Waste':       'text-amber-500',
  'Land':        'text-green-600',
};

const CATEGORIES = ['Air Quality', 'Water', 'Noise', 'Waste', 'Land'];
const TABS = [
  { key:'dashboard', label:'Dashboard',    icon:FiActivity  },
  { key:'charts',    label:'Trend Charts', icon:FiBarChart2 },
  { key:'alerts',    label:'Alerts',       icon:FiBell      },
  { key:'history',   label:'History',      icon:FiList      },
];

/* ── Stat chip ──────────────────────────────────────────────────────── */
function Chip({ label, value, color = '' }) {
  return (
    <div className="card-sm text-center border border-[var(--border)] py-2">
      <p className={clsx('text-xl font-black', color)}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

/* ── Parameter live card ────────────────────────────────────────────── */
function ParamCard({ reading }) {
  const { parameter, value, unit, status, threshold_max, location, recorded_at, category, sensor_type } = reading;
  const Icon  = CAT_ICON[category] || FiFeather;
  const pct   = threshold_max > 0 ? Math.min(100, Math.round((parseFloat(value) / threshold_max) * 100)) : 0;
  const barCl = status === 'critical' ? 'bg-red-500' : status === 'warning' ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className={clsx('rounded-2xl border p-3 space-y-2', STATUS_BG[status] || 'border-[var(--border)]')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon size={13} className={CAT_COLOR[category] || 'text-[var(--text-muted)]'}/>
          <p className="text-xs font-bold" style={{ color:'var(--text-primary)' }}>{parameter}</p>
          {sensor_type === 'automatic' && <FiWifi size={10} className="text-green-500" title="Sensor"/>}
        </div>
        <span className="text-base">{STATUS_ICON[status] || '⚪'}</span>
      </div>
      <div>
        <p className={clsx('text-2xl font-black tabular-nums',
          status==='critical'?'text-red-500':status==='warning'?'text-amber-500':'text-green-600')}>
          {parseFloat(value).toFixed(2)}
          <span className="text-xs font-normal ml-1" style={{ color:'var(--text-muted)' }}>{unit}</span>
        </p>
        {threshold_max > 0 && (
          <div className="mt-1.5">
            <div className="w-full bg-[var(--border)] rounded-full h-1.5 overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', barCl)} style={{ width:`${pct}%` }}/>
            </div>
            <p className="text-[9px] mt-0.5" style={{ color:'var(--text-muted)' }}>
              {pct}% of limit ({threshold_max} {unit})
            </p>
          </div>
        )}
      </div>
      {location && <p className="text-[10px] flex items-center gap-0.5" style={{ color:'var(--text-muted)' }}><FiMapPin size={9}/> {location}</p>}
      <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>{timeAgo(recorded_at)}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: DASHBOARD
   ════════════════════════════════════════════════════════════════════════ */
function DashboardTab({ mines, user }) {
  const [data,        setData]       = useState(null);
  const [stats,       setStats]      = useState(null);
  const [loading,     setLoading]    = useState(true);
  const [mineFilter,  setMineFilter] = useState(user?.mine_id || '');
  const [catFilter,   setCatFilter]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        environmentApi.getDashboard(mineFilter ? { mine_id: mineFilter } : {}),
        environmentApi.getStats(mineFilter ? { mine_id: mineFilter } : {}),
      ]);
      setData(d.data);
      setStats(s.data);
    } catch { toast.error('Failed to load dashboard'); }
    finally { setLoading(false); }
  }, [mineFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader/>;

  const latestReadings = (data?.latest_readings || []).filter(r => !catFilter || r.category === catFilter);
  const byMine = {};
  for (const r of latestReadings) {
    if (!byMine[r.mine_id]) byMine[r.mine_id] = { mine_name: r.mine_name, readings: [] };
    byMine[r.mine_id].readings.push(r);
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={mineFilter} onChange={e => setMineFilter(e.target.value)} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setCatFilter('')}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              !catFilter ? 'bg-amber-500 text-white border-amber-500' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-amber-500/40')}>
            All
          </button>
          {CATEGORIES.map(cat => {
            const Icon = CAT_ICON[cat] || FiFeather;
            return (
              <button key={cat} onClick={() => setCatFilter(c => c === cat ? '' : cat)}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1',
                  catFilter===cat ? 'bg-amber-500 text-white border-amber-500' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-amber-500/40')}>
                <Icon size={10}/> {cat}
              </button>
            );
          })}
        </div>
        <button onClick={load} className="btn-outline btn-sm ml-auto"><FiRefreshCw size={12}/> Refresh</button>
      </div>

      {/* KPI chips */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Chip label="Total Readings" value={stats.totals?.total || 0}/>
          <Chip label="Critical"       value={stats.totals?.critical || 0} color="text-red-500"/>
          <Chip label="Warning"        value={stats.totals?.warning || 0}  color="text-amber-500"/>
          <Chip label="Normal"         value={stats.totals?.normal || 0}   color="text-green-600"/>
          <Chip label="Unack Alerts"   value={stats.unack_alerts || 0}     color={stats.unack_alerts > 0 ? 'text-red-500' : 'text-green-600'}/>
        </div>
      )}

      {/* Category KPI cards */}
      {stats?.by_category?.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {CATEGORIES.map(cat => {
            const cd   = stats.by_category.find(c => c.category === cat) || {};
            const Icon = CAT_ICON[cat] || FiFeather;
            const hasCrit = (cd.critical || 0) > 0;
            const hasWarn = (cd.warning  || 0) > 0;
            return (
              <div key={cat}
                className={clsx('card p-3 border-2 cursor-pointer transition-all',
                  hasCrit ? 'border-red-500/40'    :
                  hasWarn ? 'border-amber-500/40'  : 'border-[var(--border)]',
                  catFilter===cat && 'ring-2 ring-amber-500/50')}
                onClick={() => setCatFilter(c => c===cat ? '' : cat)}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon size={14} className={CAT_COLOR[cat]}/>
                  <p className="text-xs font-bold" style={{ color:'var(--text-primary)' }}>{cat}</p>
                </div>
                <div className="flex gap-3 text-xs">
                  {(cd.critical||0) > 0 && <span className="text-red-500 font-bold">🔴 {cd.critical}</span>}
                  {(cd.warning ||0) > 0 && <span className="text-amber-500 font-bold">⚠ {cd.warning}</span>}
                  {(cd.normal  ||0) > 0 && <span className="text-green-500">✓ {cd.normal}</span>}
                  {!(cd.total) && <span style={{ color:'var(--text-muted)' }}>No data</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-mine parameter cards */}
      {Object.keys(byMine).length === 0 ? (
        <EmptyState icon={FiActivity} title="No readings yet"
          description="Add environmental readings to see live values here"/>
      ) : (
        Object.entries(byMine).map(([mineId, { mine_name, readings }]) => (
          <div key={mineId} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"/>
              <h3 className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{mine_name}</h3>
              <span className="text-xs" style={{ color:'var(--text-muted)' }}>({readings.length} parameters)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {readings.map((r, i) => <ParamCard key={i} reading={r}/>)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: CHARTS
   ════════════════════════════════════════════════════════════════════════ */
function ChartsTab({ mines }) {
  const [mineId,    setMineId]    = useState('');
  const [parameter, setParameter] = useState('PM10');
  const [days,      setDays]      = useState(7);
  const [groupBy,   setGroupBy]   = useState('hour');
  const [data,      setData]      = useState([]);
  const [params,    setParams]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [threshMax, setThreshMax] = useState(null);

  useEffect(() => {
    environmentApi.getParameters()
      .then(r => setParams(r.data || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!mineId || !parameter) return;
    setLoading(true);
    try {
      const r = await environmentApi.getTrends({ mine_id: mineId, parameter, days, groupBy });
      const rows = (r.data || []).map(t => ({
        time:    groupBy === 'day'
          ? new Date(t.time).toLocaleDateString('en-IN', { month:'short', day:'numeric' })
          : new Date(t.time).toLocaleTimeString('en-IN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
        avg:     parseFloat(t.avg_value  || 0).toFixed(3),
        max:     parseFloat(t.max_value  || 0).toFixed(3),
        min:     parseFloat(t.min_value  || 0).toFixed(3),
        count:   t.reading_count,
        critical:t.critical_count,
        warning: t.warning_count,
      }));
      setData(rows);
      if (r.data?.[0]?.threshold_max) setThreshMax(parseFloat(r.data[0].threshold_max));
    } catch { toast.error('Failed to load trend data'); }
    finally { setLoading(false); }
  }, [mineId, parameter, days, groupBy]);

  useEffect(() => { load(); }, [load]);

  const paramDef  = params.find(p => p.name === parameter);
  const unit      = paramDef?.unit || '';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <div className="form-group mb-0">
          <label className="label">Mine *</label>
          <select value={mineId} onChange={e => setMineId(e.target.value)} className="select w-48">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Parameter</label>
          <select value={parameter} onChange={e => setParameter(e.target.value)} className="select w-36">
            {params.length > 0
              ? params.map(p => <option key={p.id} value={p.name}>{p.name} ({p.unit})</option>)
              : ['PM10','PM2.5','SO2','CH4','CO','pH','TDS','Noise','Dust'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Period</label>
          <select value={days} onChange={e => setDays(e.target.value)} className="select w-28">
            {[1,3,7,14,30,60,90].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Group By</label>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="select w-24">
            <option value="hour">Hour</option>
            <option value="day">Day</option>
          </select>
        </div>
        <button onClick={load} disabled={!mineId} className="btn-primary btn-sm self-end">
          <FiBarChart2 size={12}/> Load
        </button>
      </div>

      {/* Parameter info */}
      {paramDef && (
        <div className="flex flex-wrap gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card-hover)] text-xs">
          <span style={{ color:'var(--text-muted)' }}><strong style={{ color:'var(--text-primary)' }}>{paramDef.display_name || paramDef.name}</strong> · {paramDef.category}</span>
          <span style={{ color:'var(--text-muted)' }}>Safe limit: <strong className="text-green-500">{paramDef.threshold_max} {paramDef.unit}</strong></span>
          {paramDef.critical_max && <span style={{ color:'var(--text-muted)' }}>Critical: <strong className="text-red-500">{paramDef.critical_max} {paramDef.unit}</strong></span>}
          {paramDef.cpcb_standard && <span style={{ color:'var(--text-muted)' }}>Standard: {paramDef.cpcb_standard}</span>}
          {paramDef.description && <span style={{ color:'var(--text-muted)' }}>{paramDef.description}</span>}
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg"/></div>
      ) : !mineId ? (
        <div className="flex flex-col items-center justify-center py-16 text-center" style={{ color:'var(--text-muted)' }}>
          <FiBarChart2 size={32} className="mb-3 opacity-40"/>
          <p className="font-semibold">Select a mine to view trend data</p>
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={FiBarChart2} title="No trend data" description={`No ${parameter} readings found for this period`}/>
      ) : (
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="section-title mb-0">{parameter} Trend — last {days} days</h3>
            <span className="text-xs" style={{ color:'var(--text-muted)' }}>{data.length} data points</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top:10, right:10, left:0, bottom:0 }}>
              <defs>
                <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="time" tick={{ fontSize:10 }} interval="preserveStartEnd"/>
              <YAxis tick={{ fontSize:10 }} tickFormatter={v => `${v}`}/>
              <Tooltip
                contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'12px', fontSize:'11px' }}
                formatter={(v, name) => [`${v} ${unit}`, name]}
              />
              <Legend wrapperStyle={{ fontSize:'11px' }}/>
              {threshMax && (
                <ReferenceLine y={threshMax} stroke="#f59e0b" strokeDasharray="6 3"
                  label={{ value:`Limit ${threshMax}${unit}`, position:'right', fontSize:10, fill:'#f59e0b' }}/>
              )}
              <Area type="monotone" dataKey="avg" stroke="#3b82f6" fill="url(#avgGrad)" strokeWidth={2} name="Avg" dot={false}/>
              <Line type="monotone" dataKey="max" stroke="#ef4444" strokeWidth={1.5} name="Max" dot={false} strokeDasharray="4 2"/>
              <Line type="monotone" dataKey="min" stroke="#22c55e" strokeWidth={1.5} name="Min" dot={false} strokeDasharray="4 2"/>
            </AreaChart>
          </ResponsiveContainer>

          {/* Mini stats below chart */}
          {data.length > 0 && (() => {
            const avgVals = data.map(d => parseFloat(d.avg));
            const maxVals = data.map(d => parseFloat(d.max));
            const overall = (avgVals.reduce((s,v)=>s+v,0)/avgVals.length).toFixed(3);
            const peak    = Math.max(...maxVals).toFixed(3);
            const alerts  = data.reduce((s,d) => s + parseInt(d.critical||0) + parseInt(d.warning||0), 0);
            return (
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--border)]">
                <div className="text-center">
                  <p className="text-sm font-black" style={{ color:'var(--text-primary)' }}>{overall} {unit}</p>
                  <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Period Average</p>
                </div>
                <div className="text-center">
                  <p className={clsx('text-sm font-black', threshMax && parseFloat(peak) > threshMax ? 'text-red-500' : 'text-green-500')}>{peak} {unit}</p>
                  <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Peak Value</p>
                </div>
                <div className="text-center">
                  <p className={clsx('text-sm font-black', alerts > 0 ? 'text-amber-500' : 'text-green-500')}>{alerts}</p>
                  <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Alert Events</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: ALERTS
   ════════════════════════════════════════════════════════════════════════ */
function AlertsTab({ mines, user }) {
  const [alerts,   setAlerts]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [mineF,    setMineF]    = useState(user?.mine_id || '');
  const [sevF,     setSevF]     = useState('');
  const [ackF,     setAckF]     = useState('false');
  const [page,     setPage]     = useState(1);
  const [meta,     setMeta]     = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await environmentApi.getAlerts({
        mine_id: mineF || undefined, severity: sevF || undefined,
        acknowledged: ackF, page, limit: 30,
      });
      setAlerts(r.data || []);
      setMeta(r.pagination || {});
    } catch { toast.error('Failed to load alerts'); }
    finally { setLoading(false); }
  }, [mineF, sevF, ackF, page]);

  useEffect(() => { load(); }, [load]);

  const canAck = ['admin','government_officer','environment_officer','mine_manager','inspector'].includes(user?.role);

  const ack = async (id) => {
    try {
      await environmentApi.acknowledgeAlert(id);
      toast.success('Alert acknowledged');
      load();
    } catch { toast.error('Failed to acknowledge'); }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <select value={mineF} onChange={e => { setMineF(e.target.value); setPage(1); }} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={sevF} onChange={e => { setSevF(e.target.value); setPage(1); }} className="select w-32">
          <option value="">All Severity</option>
          <option value="critical">🔴 Critical</option>
          <option value="warning">⚠️ Warning</option>
        </select>
        <select value={ackF} onChange={e => { setAckF(e.target.value); setPage(1); }} className="select w-40">
          <option value="false">Unacknowledged</option>
          <option value="true">Acknowledged</option>
          <option value="all">All</option>
        </select>
        <button onClick={load} className="btn-outline btn-sm"><FiRefreshCw size={12}/> Refresh</button>
      </div>

      {loading ? <PageLoader/> : alerts.length === 0 ? (
        <EmptyState icon={FiBell} title="No alerts"
          description={ackF === 'false' ? 'All alerts have been acknowledged' : 'No alerts found'}/>
      ) : (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id}
              className={clsx('card flex items-start gap-4 p-3',
                a.severity==='critical' ? 'border-red-500/30 bg-red-500/5'
                : 'border-amber-500/30 bg-amber-500/5')}>
              <div className="text-xl shrink-0 mt-0.5">
                {a.severity === 'critical' ? '🔴' : '⚠️'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>
                      {a.parameter} — {a.mine_name}
                    </p>
                    <p className="text-xs" style={{ color:'var(--text-secondary)' }}>{a.message}</p>
                    {a.location && (
                      <p className="text-[11px] flex items-center gap-0.5 mt-0.5" style={{ color:'var(--text-muted)' }}>
                        <FiMapPin size={9}/> {a.location}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge color={STATUS_COLOR[a.severity]||'gray'}>{a.severity}</Badge>
                    {a.is_acknowledged
                      ? <span className="text-[10px] text-green-500">✓ Acknowledged</span>
                      : canAck && (
                        <button onClick={() => ack(a.id)}
                          className="btn-sm bg-green-500/10 text-green-600 border border-green-500/25 hover:bg-green-500/20 rounded-lg px-2 py-1 text-xs font-bold flex items-center gap-1">
                          <FiCheck size={11}/> Acknowledge
                        </button>
                      )}
                  </div>
                </div>
                <p className="text-[10px] mt-1" style={{ color:'var(--text-muted)' }}>
                  {timeAgo(a.created_at)} · {formatDateTime(a.created_at)}
                </p>
              </div>
            </div>
          ))}
          {meta.pages > 1 && (
            <div className="flex justify-center gap-2">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="btn-outline btn-sm">Prev</button>
              <span className="text-xs self-center" style={{ color:'var(--text-muted)' }}>Page {page}/{meta.pages}</span>
              <button disabled={page>=meta.pages} onClick={() => setPage(p=>p+1)} className="btn-outline btn-sm">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB: HISTORY
   ════════════════════════════════════════════════════════════════════════ */
function HistoryTab({ mines, user, onAddReading }) {
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [pagination,setPagination]= useState({});
  const [page,      setPage]      = useState(1);
  const [params,    setParams]    = useState([]);
  const [filters,   setFilters]   = useState({
    mine_id:     user?.mine_id || '',
    category:    '',
    parameter:   '',
    status:      '',
    from_date:   '',
    to_date:     '',
    sensor_type: '',
  });

  const canWrite = ['admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'].includes(user?.role);
  const canDelete= ['admin','government_officer','environment_officer'].includes(user?.role);

  useEffect(() => {
    environmentApi.getParameters().then(r => setParams(r.data||[])).catch(()=>{});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await environmentApi.getReadings({ ...filters, page, limit: 50 });
      setRows(r.data || []);
      setPagination(r.pagination || {});
    } catch { toast.error('Failed to load readings'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm('Delete this reading?')) return;
    try { await environmentApi.deleteReading(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const setF = (k, v) => { setFilters(f => ({ ...f, [k]:v })); setPage(1); };
  const filteredParams = filters.category ? params.filter(p => p.category === filters.category) : params;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card-sm space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="form-group mb-0">
            <label className="label">Mine</label>
            <select value={filters.mine_id} onChange={e => setF('mine_id', e.target.value)} className="select w-44">
              <option value="">All Mines</option>
              {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">Category</label>
            <select value={filters.category} onChange={e => { setF('category', e.target.value); setF('parameter',''); }} className="select w-36">
              <option value="">All</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">Parameter</label>
            <select value={filters.parameter} onChange={e => setF('parameter', e.target.value)} className="select w-36">
              <option value="">All</option>
              {filteredParams.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">Status</label>
            <select value={filters.status} onChange={e => setF('status', e.target.value)} className="select w-32">
              <option value="">All</option>
              <option value="normal">Normal</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">Source</label>
            <select value={filters.sensor_type} onChange={e => setF('sensor_type', e.target.value)} className="select w-32">
              <option value="">All</option>
              <option value="manual">Manual</option>
              <option value="automatic">Sensor</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="form-group mb-0">
            <label className="label">From Date</label>
            <input type="date" value={filters.from_date} onChange={e => setF('from_date', e.target.value)} className="input w-38"/>
          </div>
          <div className="form-group mb-0">
            <label className="label">To Date</label>
            <input type="date" value={filters.to_date} onChange={e => setF('to_date', e.target.value)} className="input w-38"/>
          </div>
          <button onClick={load} className="btn-outline btn-sm self-end"><FiRefreshCw size={12}/> Refresh</button>
          {canWrite && (
            <button onClick={onAddReading} className="btn-primary btn-sm self-end">
              <FiPlus size={13}/> Add Reading
            </button>
          )}
        </div>
      </div>

      {loading ? <PageLoader/> : rows.length === 0 ? (
        <EmptyState icon={FiList} title="No readings found"
          description="Adjust filters or add a new reading"
          action={canWrite && <button onClick={onAddReading} className="btn-primary btn-sm"><FiPlus size={12}/> Add Reading</button>}/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Mine</th><th>Category</th><th>Parameter</th>
                <th>Value</th><th>Threshold</th><th>Status</th>
                <th>Location</th><th>Source</th><th>Recorded</th>
                {canDelete && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const pct = r.threshold_max > 0 ? Math.min(100, Math.round((parseFloat(r.value)/parseFloat(r.threshold_max))*100)) : null;
                return (
                  <tr key={r.id}>
                    <td className="text-sm" style={{ color:'var(--text-primary)' }}>{r.mine_name}</td>
                    <td>
                      <span className="text-xs" style={{ color:'var(--text-muted)' }}>
                        {r.category || r.reading_type}
                      </span>
                    </td>
                    <td>
                      <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{r.parameter}</p>
                      {r.sensor_id && <p className="text-[9px] font-mono" style={{ color:'var(--text-muted)' }}>Sensor:{r.sensor_id.slice(0,8)}</p>}
                    </td>
                    <td>
                      <p className={clsx('font-bold text-sm',
                        r.status==='critical'?'text-red-500':r.status==='warning'?'text-amber-500':'text-green-600')}>
                        {parseFloat(r.value).toFixed(3)} {r.unit}
                      </p>
                      {pct !== null && (
                        <div className="w-16 bg-[var(--border)] rounded-full h-1 mt-1 overflow-hidden">
                          <div className={clsx('h-full rounded-full',
                            r.status==='critical'?'bg-red-500':r.status==='warning'?'bg-amber-500':'bg-green-500')}
                            style={{ width:`${pct}%` }}/>
                        </div>
                      )}
                    </td>
                    <td className="text-xs" style={{ color:'var(--text-muted)' }}>
                      {r.threshold_max > 0 ? `≤ ${r.threshold_max} ${r.unit}` : '—'}
                    </td>
                    <td><Badge color={STATUS_COLOR[r.status]||'gray'}>{STATUS_ICON[r.status]} {r.status}</Badge></td>
                    <td className="text-xs" style={{ color:'var(--text-muted)' }}>{r.location || '—'}</td>
                    <td>
                      {r.sensor_type === 'automatic'
                        ? <Badge color="green"><FiWifi size={9}/> Sensor</Badge>
                        : <Badge color="gray">Manual</Badge>}
                    </td>
                    <td className="text-xs" style={{ color:'var(--text-muted)' }}>
                      <p>{formatDate(r.recorded_at)}</p>
                      <p>{new Date(r.recorded_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</p>
                    </td>
                    {canDelete && (
                      <td>
                        <button onClick={() => del(r.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors">
                          <FiTrash2 size={12}/>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 p-3">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="btn-outline btn-sm">Prev</button>
              <span className="text-xs self-center" style={{ color:'var(--text-muted)' }}>
                Page {page}/{pagination.pages} ({pagination.total} readings)
              </span>
              <button disabled={page>=pagination.pages} onClick={() => setPage(p=>p+1)} className="btn-outline btn-sm">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   READING FORM (manual entry)
   ════════════════════════════════════════════════════════════════════════ */
function ReadingForm({ mines, onSave, onCancel }) {
  const [params,      setParams]      = useState([]);
  const [catFilter,   setCatFilter]   = useState('Air Quality');
  const [selectedParam, setSelectedParam] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    environmentApi.getParameters().then(r => setParams(r.data||[])).catch(()=>{});
  }, []);

  const { register, handleSubmit, watch, setValue, formState:{ isSubmitting, errors } } = useForm({
    defaultValues: { sensor_type:'manual', category:'Air Quality' },
  });

  const paramName = watch('parameter');
  useEffect(() => {
    const pd = params.find(p => p.name === paramName);
    if (pd) {
      setSelectedParam(pd);
      setValue('unit', pd.unit);
      setValue('category', pd.category);
    }
  }, [paramName, params]);

  const filteredParams = catFilter ? params.filter(p => p.category === catFilter) : params;

  const onSubmit = async (data) => {
    try {
      const r = await environmentApi.createReading(data);
      const status = r.data?.status;
      if (status === 'critical') toast.error(`🔴 CRITICAL: ${data.parameter} value exceeds critical threshold! Alert generated.`);
      else if (status === 'warning') toast(`⚠️ Warning: ${data.parameter} above safe limit. Alert generated.`, { icon:'⚠️' });
      else toast.success('Reading recorded');
      onSave(r.data);
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed to save'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Mine */}
        <div className="form-group">
          <label className="label">Mine *</label>
          <select {...register('mine_id', { required:'Mine required' })} className="select">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {errors.mine_id && <p className="text-xs text-red-400 mt-1">{errors.mine_id.message}</p>}
        </div>

        {/* Category filter */}
        <div className="form-group">
          <label className="label">Category</label>
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setValue('parameter',''); setValue('unit',''); }}
            className="select">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Parameter */}
        <div className="form-group">
          <label className="label">Parameter *</label>
          <select {...register('parameter', { required:'Parameter required' })} className="select">
            <option value="">Select parameter</option>
            {filteredParams.map(p => <option key={p.id} value={p.name}>{p.name} ({p.unit})</option>)}
          </select>
          {errors.parameter && <p className="text-xs text-red-400 mt-1">{errors.parameter.message}</p>}
        </div>

        {/* Value */}
        <div className="form-group">
          <label className="label">
            Value *
            {selectedParam && (
              <span className="ml-2 font-normal" style={{ color:'var(--text-muted)' }}>
                (safe ≤ {selectedParam.threshold_max} {selectedParam.unit})
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <input type="number" step="0.001" {...register('value', { required:'Value required' })}
              className="input flex-1"/>
            <input {...register('unit')} className="input w-20 text-center font-mono text-sm"
              placeholder={selectedParam?.unit || 'unit'}/>
          </div>
          {errors.value && <p className="text-xs text-red-400 mt-1">{errors.value.message}</p>}
        </div>

        {/* Location */}
        <div className="form-group">
          <label className="label">Location</label>
          <input {...register('location')} className="input" placeholder="Mine entrance, Shaft-2, Loading area…"/>
        </div>

        {/* Section */}
        <div className="form-group">
          <label className="label">Section / Zone</label>
          <input {...register('section')} className="input" placeholder="Underground, Surface, Pit…"/>
        </div>

        {/* Sensor type */}
        <div className="form-group">
          <label className="label">Source</label>
          <select {...register('sensor_type')} className="select">
            <option value="manual">Manual Entry</option>
            <option value="automatic">Automatic Sensor</option>
            <option value="iot">IoT Device</option>
          </select>
        </div>

        {/* Sensor ID */}
        <div className="form-group">
          <label className="label">Sensor ID (optional)</label>
          <input {...register('sensor_id')} className="input" placeholder="Sensor identifier…"/>
        </div>

        {/* Notes */}
        <div className="form-group col-span-2">
          <label className="label">Notes / Observations</label>
          <textarea {...register('notes')} rows={2} className="input resize-none"
            placeholder="Any additional observations or context…"/>
        </div>
      </div>

      {/* Advanced environmental conditions */}
      <div>
        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
          <FiFilter size={11}/> {showAdvanced ? 'Hide' : 'Show'} Environmental Conditions (optional)
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card-hover)]">
            <div className="form-group mb-0">
              <label className="label">Weather</label>
              <select {...register('weather_condition')} className="select">
                <option value="">—</option>
                {['Sunny','Cloudy','Rainy','Windy','Foggy'].map(w => <option key={w} value={w.toLowerCase()}>{w}</option>)}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="label">Wind Speed (m/s)</label>
              <input type="number" step="0.1" {...register('wind_speed')} className="input"/>
            </div>
            <div className="form-group mb-0">
              <label className="label">Temperature (°C)</label>
              <input type="number" step="0.1" {...register('temperature')} className="input"/>
            </div>
            <div className="form-group mb-0">
              <label className="label">Humidity (%)</label>
              <input type="number" step="1" {...register('humidity')} className="input"/>
            </div>
          </div>
        )}
      </div>

      {selectedParam && (
        <div className="p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs" style={{ color:'var(--text-secondary)' }}>
          <strong style={{ color:'var(--text-primary)' }}>{selectedParam.display_name || selectedParam.name}</strong>
          {selectedParam.description && <span className="ml-1">— {selectedParam.description}</span>}
          {selectedParam.cpcb_standard && <span className="ml-2 text-blue-400">Standard: {selectedParam.cpcb_standard}</span>}
          <div className="mt-1 flex gap-4">
            <span>Safe: <strong className="text-green-500">≤ {selectedParam.threshold_max} {selectedParam.unit}</strong></span>
            {selectedParam.critical_max && <span>Critical: <strong className="text-red-500">&gt; {selectedParam.critical_max} {selectedParam.unit}</strong></span>}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <><LoadingSpinner size="sm" className="mr-2"/> Saving…</> : <><FiPlus size={14}/> Record Reading</>}
        </button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════ */
export default function Environment() {
  const [searchParams]              = useSearchParams();
  const { user }                    = useAuthStore();
  const [mines,     setMines]       = useState([]);
  const [activeTab, setActiveTab]   = useState('dashboard');
  const [showForm,  setShowForm]    = useState(false);
  const [unackCount,setUnackCount]  = useState(0);

  const canWrite = ['admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'].includes(user?.role);

  useEffect(() => {
    minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{});
    // Load unack alert count
    environmentApi.getAlerts({ acknowledged:'false', limit:1 })
      .then(r => setUnackCount(r.pagination?.total || 0))
      .catch(()=>{});
  }, []);

  // Jump to tab from URL param
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.find(tab => tab.key === t)) setActiveTab(t);
  }, [searchParams]);

  const handleSaved = () => {
    setShowForm(false);
    // Refresh unack count
    environmentApi.getAlerts({ acknowledged:'false', limit:1 })
      .then(r => setUnackCount(r.pagination?.total || 0))
      .catch(()=>{});
  };

  return (
    <div className="space-y-5 pb-10">
      <BackButton className="mb-1"/>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiFeather className="text-green-500"/> Environmental Monitoring
          </h1>
          <p className="page-subtitle">
            Real-time air quality, water, noise, waste and land monitoring with automated alerts
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {unackCount > 0 && (
            <button onClick={() => setActiveTab('alerts')}
              className="btn-sm bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 rounded-lg px-3 flex items-center gap-1.5 text-xs font-bold">
              <FiBell size={13}/> {unackCount} unack alert{unackCount!==1?'s':''}
            </button>
          )}
          {canWrite && (
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <FiPlus size={15}/> Add Reading
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-xl p-1 gap-1 flex-wrap w-fit">
        {TABS.map(({ key, label, icon:Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all relative',
              activeTab===key
                ? 'bg-[var(--bg-card)] text-amber-500 shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}>
            <Icon size={14}/> {label}
            {key === 'alerts' && unackCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unackCount > 9 ? '9+' : unackCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'dashboard' && <DashboardTab mines={mines} user={user}/>}
      {activeTab === 'charts'    && <ChartsTab mines={mines}/>}
      {activeTab === 'alerts'    && <AlertsTab mines={mines} user={user}/>}
      {activeTab === 'history'   && <HistoryTab mines={mines} user={user} onAddReading={() => setShowForm(true)}/>}

      {/* Add Reading Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)}
        title="Record Environmental Reading" size="lg">
        <ReadingForm
          mines={mines}
          onSave={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      </Modal>
    </div>
  );
}
