/**
 * KhanNetra — Production Monitoring
 * Dashboard · Records · Targets · Machinery · Trends · AI Analysis
 * All data from real backend. No hardcoded values.
 */
import { useState, useEffect, useCallback } from 'react';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader, LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { productionApi, minesApi } from '../../services/api';
import { formatDate, formatNumber } from '../../utils/helpers';
import { useForm } from 'react-hook-form';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  FiTrendingUp, FiTrendingDown, FiTarget, FiBarChart2,
  FiTool, FiPlus, FiRefreshCw, FiCalendar, FiCpu,
  FiCheckCircle, FiAlertTriangle, FiEdit2, FiInfo,
  FiList, FiActivity,
} from 'react-icons/fi';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

/* ── helpers ──────────────────────────────────────────────────────── */
const achColor = (pct) => {
  if (!pct && pct !== 0) return 'text-[var(--text-muted)]';
  if (pct >= 90) return 'text-green-600';
  if (pct >= 75) return 'text-amber-500';
  return 'text-red-500';
};
const achBadge = (pct) => {
  if (!pct && pct !== 0) return 'gray';
  if (pct >= 90) return 'green';
  if (pct >= 75) return 'yellow';
  return 'red';
};
const MACH_COLOR = { operational:'green', maintenance:'yellow', breakdown:'red', idle:'gray', retired:'gray' };
const MACH_ICON  = { operational:'✅', maintenance:'🔧', breakdown:'🔴', idle:'⏸', retired:'🗑' };
const INSIGHT_ICON = { DROP:'📉', RISE:'📈', UNDERPERFORMANCE:'⚠️', MACHINERY_CORRELATION:'🔧', PRODUCTIVITY_DROP:'📉', NORMAL:'✅' };
const INSIGHT_COLOR = { DROP:'red', RISE:'green', UNDERPERFORMANCE:'yellow', MACHINERY_CORRELATION:'yellow', PRODUCTIVITY_DROP:'yellow', NORMAL:'green' };

const TABS = [
  { key:'dashboard',  label:'Dashboard',     icon:FiActivity  },
  { key:'trends',     label:'Trend Charts',  icon:FiBarChart2 },
  { key:'records',    label:'Records',       icon:FiList      },
  { key:'machinery',  label:'Machinery',     icon:FiTool      },
  { key:'analysis',   label:'AI Analysis',   icon:FiCpu       },
];

/* ── Stat chip ─────────────────────────────────────────────────────── */
function Chip({ label, value, sub, color = '', icon: Icon }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color:'var(--text-muted)' }}>{label}</p>
        {Icon && <Icon size={13} style={{ color:'var(--text-muted)' }}/>}
      </div>
      <p className={clsx('text-2xl font-black', color || 'text-[var(--text-primary)]')}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

/* ── Achievement bar ─────────────────────────────────────────────── */
function AchBar({ pct }) {
  const w = Math.min(100, Math.max(0, pct || 0));
  const c = w >= 90 ? 'bg-green-500' : w >= 75 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="w-full bg-[var(--border)] rounded-full h-1.5 overflow-hidden mt-1">
      <div className={clsx('h-full rounded-full transition-all', c)} style={{ width:`${w}%` }}/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
   ════════════════════════════════════════════════════════════════════ */
function DashboardTab({ mines, user }) {
  const [dash,     setDash]     = useState(null);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [mineF,    setMineF]    = useState(user?.mine_id || '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = mineF ? { mine_id: mineF } : {};
      const [d, s] = await Promise.all([
        productionApi.getDashboard(p),
        productionApi.getStats(p),
      ]);
      setDash(d.data);
      setStats(s.data);
    } catch { toast.error('Failed to load production dashboard'); }
    finally { setLoading(false); }
  }, [mineF]);

  useEffect(() => { load(); }, [load]);

  const machineryMap = {};
  for (const m of (dash?.machinery_summary || [])) machineryMap[m.status] = parseInt(m.count);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={mineF} onChange={e => setMineF(e.target.value)} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button onClick={load} className="btn-outline btn-sm"><FiRefreshCw size={12}/> Refresh</button>
      </div>

      {loading ? <PageLoader/> : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Chip label="Total 30d (T)"       value={parseInt(stats?.overall?.total_tonnes || 0).toLocaleString('en-IN')} color="text-amber-500" icon={FiTrendingUp}/>
            <Chip label="Avg Achievement"     value={`${stats?.overall?.avg_achievement || 0}%`} color={achColor(stats?.overall?.avg_achievement)} icon={FiTarget}/>
            <Chip label="Avg Productivity"    value={`${stats?.overall?.avg_tph || 0} T/hr`} icon={FiActivity}/>
            <Chip label="Days on Target"      value={`${stats?.overall?.days_on_target || 0}/${stats?.overall?.record_count || 0}`} color="text-green-600" icon={FiCheckCircle}/>
            <Chip label="Machines Breakdown"  value={machineryMap.breakdown || 0} color={(machineryMap.breakdown || 0) > 0 ? 'text-red-500' : 'text-green-600'} icon={FiTool}/>
          </div>

          {/* Per-mine cards */}
          {(dash?.mine_aggregates || []).length === 0 ? (
            <EmptyState icon={FiBarChart2} title="No production data yet"
              description="Start entering daily production records to see mine-wise summaries"/>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {(dash.mine_aggregates || []).map(m => (
                <div key={m.mine_id} className="card space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{m.mine_name}</p>
                      <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{m.record_count} records in 30 days</p>
                    </div>
                    <Badge color={achBadge(m.avg_achievement)}>{m.avg_achievement}%</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label:'30d Total', value:parseInt(m.total_30d||0).toLocaleString('en-IN')+' T' },
                      { label:'Daily Avg', value:parseInt(m.avg_daily||0).toLocaleString('en-IN')+' T' },
                      { label:'T/hr',      value:m.avg_tph || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg border border-[var(--border)] py-2" style={{ background:'var(--bg-card-hover)' }}>
                        <p className="text-sm font-black" style={{ color:'var(--text-primary)' }}>{value}</p>
                        <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>{label}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span style={{ color:'var(--text-muted)' }}>Avg Achievement</span>
                      <span className={achColor(m.avg_achievement)}>{m.avg_achievement}%</span>
                    </div>
                    <AchBar pct={m.avg_achievement}/>
                  </div>
                  <div className="flex items-center justify-between text-[10px]" style={{ color:'var(--text-muted)' }}>
                    <span>Peak: {parseInt(m.max_daily||0).toLocaleString('en-IN')} T</span>
                    <span>Low: {parseInt(m.min_daily||0).toLocaleString('en-IN')} T</span>
                    <span>🏆 {m.days_on_target} days on target</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Today's targets */}
          {(dash?.today_targets || []).length > 0 && (
            <div className="card">
              <h3 className="section-title mb-3">Today's Targets</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {dash.today_targets.map(t => {
                  const today = dash.today_snapshot?.find(r => r.mine_id === t.mine_id);
                  const achPct = today && t.target_tonnes > 0 ? Math.round((parseFloat(today.actual_tonnes)/t.target_tonnes)*100) : null;
                  return (
                    <div key={t.id} className="rounded-xl border border-[var(--border)] p-3" style={{ background:'var(--bg-card-hover)' }}>
                      <p className="text-xs font-bold mb-1" style={{ color:'var(--text-primary)' }}>{t.mine_name}</p>
                      <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Target: <strong>{parseInt(t.target_tonnes).toLocaleString('en-IN')} T</strong></p>
                      {today ? (
                        <>
                          <p className={clsx('text-sm font-black mt-1', achColor(achPct))}>{parseInt(today.actual_tonnes).toLocaleString('en-IN')} T ({achPct}%)</p>
                          <AchBar pct={achPct}/>
                        </>
                      ) : (
                        <p className="text-[10px] text-amber-500 mt-1">Not yet recorded</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Machinery summary */}
          {Object.keys(machineryMap).length > 0 && (
            <div className="card">
              <h3 className="section-title mb-3">Machinery Status Summary</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(machineryMap).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)]" style={{ background:'var(--bg-card-hover)' }}>
                    <span>{MACH_ICON[status] || '⚙️'}</span>
                    <span className="text-sm font-bold" style={{ color:'var(--text-primary)' }}>{count}</span>
                    <span className="text-xs capitalize" style={{ color:'var(--text-muted)' }}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TRENDS TAB
   ════════════════════════════════════════════════════════════════════ */
function TrendsTab({ mines, user }) {
  const [mineF,  setMineF]  = useState(user?.mine_id || '');
  const [period, setPeriod] = useState('daily');
  const [days,   setDays]   = useState(30);
  const [data,   setData]   = useState([]);
  const [mineName, setMineName] = useState('');
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    if (!mineF) return;
    setLoading(true);
    try {
      const r = await productionApi.getTrends({ mine_id: mineF, period, days });
      setData(r.data || []);
      setMineName(r.mine_name || '');
    } catch { toast.error('Failed to load trends'); }
    finally { setLoading(false); }
  }, [mineF, period, days]);

  useEffect(() => { load(); }, [load]);

  const xKey = period === 'daily' ? 'date' : period === 'weekly' ? 'week' : 'month';

  const avgAch = data.length ? Math.round(data.reduce((s,d)=>s+parseFloat(d.achievement_pct||0),0)/data.length) : null;
  const totalA = data.reduce((s,d)=>s+parseFloat(d.actual||0),0);
  const totalT = data.reduce((s,d)=>s+parseFloat(d.target||0),0);

  return (
    <div className="space-y-4">
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <div className="form-group mb-0">
          <label className="label">Mine *</label>
          <select value={mineF} onChange={e => setMineF(e.target.value)} className="select w-48">
            <option value="">Select mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Period</label>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="select w-28">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Range</label>
          <select value={days} onChange={e => setDays(e.target.value)} className="select w-28">
            {[7,14,30,60,90,180,365].map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        <button onClick={load} disabled={!mineF} className="btn-primary btn-sm self-end">
          <FiBarChart2 size={12}/> Load
        </button>
      </div>

      {!mineF ? (
        <div className="flex flex-col items-center justify-center py-16 text-center" style={{ color:'var(--text-muted)' }}>
          <FiBarChart2 size={32} className="mb-3 opacity-40"/>
          <p className="font-semibold">Select a mine to view production trends</p>
        </div>
      ) : loading ? <PageLoader/> : data.length === 0 ? (
        <EmptyState icon={FiBarChart2} title="No production data" description="No records found for the selected period"/>
      ) : (
        <div className="space-y-4">
          {/* Summary chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Chip label="Total Actual"   value={`${Math.round(totalA/1000).toLocaleString('en-IN')} KT`} color="text-amber-500"/>
            <Chip label="Total Target"   value={`${Math.round(totalT/1000).toLocaleString('en-IN')} KT`}/>
            <Chip label="Avg Achievement" value={`${avgAch}%`} color={achColor(avgAch)}/>
            <Chip label="Data Points"    value={data.length}/>
          </div>

          {/* Production chart */}
          <div className="card">
            <h3 className="section-title mb-4">{mineName} — Production vs Target ({period})</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data} margin={{ top:10, right:10, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey={xKey} tick={{ fontSize:10 }} interval="preserveStartEnd"/>
                <YAxis tick={{ fontSize:10 }} tickFormatter={v => `${Math.round(v/1000)}K`}/>
                <Tooltip
                  contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'12px', fontSize:'11px' }}
                  formatter={(v, name) => [`${parseInt(v).toLocaleString('en-IN')} T`, name]}
                />
                <Legend wrapperStyle={{ fontSize:'11px' }}/>
                <Area type="monotone" dataKey="actual" stroke="#f59e0b" fill="url(#actGrad)" strokeWidth={2} name="Actual (T)" dot={false}/>
                <Area type="monotone" dataKey="target" stroke="#6366f1" fill="url(#tgtGrad)" strokeWidth={1.5} name="Target (T)" dot={false} strokeDasharray="4 2"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Achievement % chart */}
          <div className="card">
            <h3 className="section-title mb-4">Achievement % ({period})</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data} margin={{ top:5, right:10, left:0, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey={xKey} tick={{ fontSize:10 }} interval="preserveStartEnd"/>
                <YAxis tick={{ fontSize:10 }} domain={[0, 130]} tickFormatter={v=>`${v}%`}/>
                <Tooltip
                  contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'12px', fontSize:'11px' }}
                  formatter={v => [`${v}%`, 'Achievement']}
                />
                <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="4 3" label={{ value:'Target 100%', position:'right', fontSize:10, fill:'#22c55e' }}/>
                <ReferenceLine y={75}  stroke="#f59e0b" strokeDasharray="4 3" label={{ value:'75%', position:'right', fontSize:10, fill:'#f59e0b' }}/>
                <Bar dataKey="achievement_pct" name="Achievement %" radius={[4,4,0,0]}
                  fill="#f59e0b"
                  label={{ position:'top', fontSize:9, fill:'var(--text-muted)', formatter: v => v ? `${v}%` : '' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RECORDS TAB
   ════════════════════════════════════════════════════════════════════ */
function RecordsTab({ mines, user, onAdd }) {
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [pagination, setPagination] = useState({});
  const [page,       setPage]       = useState(1);
  const [filters,    setFilters]    = useState({
    mine_id: user?.mine_id || '', from_date: '', to_date: '', status: '',
  });

  const canWrite = ['admin','government_officer','mine_manager','inspector','safety_officer','mining_engineer','corporate_management'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await productionApi.getRecords({ ...filters, page, limit: 50 });
      setRows(r.data || []);
      setPagination(r.pagination || {});
    } catch { toast.error('Failed to load records'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  const setF = (k, v) => { setFilters(f => ({ ...f, [k]:v })); setPage(1); };

  return (
    <div className="space-y-4">
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <div className="form-group mb-0">
          <label className="label">Mine</label>
          <select value={filters.mine_id} onChange={e => setF('mine_id', e.target.value)} className="select w-44">
            <option value="">All Mines</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">From Date</label>
          <input type="date" value={filters.from_date} onChange={e => setF('from_date', e.target.value)} className="input w-40"/>
        </div>
        <div className="form-group mb-0">
          <label className="label">To Date</label>
          <input type="date" value={filters.to_date} onChange={e => setF('to_date', e.target.value)} className="input w-40"/>
        </div>
        <div className="form-group mb-0">
          <label className="label">Status</label>
          <select value={filters.status} onChange={e => setF('status', e.target.value)} className="select w-32">
            <option value="">All</option>
            <option value="recorded">Recorded</option>
            <option value="verified">Verified</option>
            <option value="disputed">Disputed</option>
          </select>
        </div>
        <button onClick={load} className="btn-outline btn-sm self-end"><FiRefreshCw size={12}/> Refresh</button>
        {canWrite && <button onClick={onAdd} className="btn-primary btn-sm self-end"><FiPlus size={13}/> Add Record</button>}
      </div>

      {loading ? <PageLoader/> : rows.length === 0 ? (
        <EmptyState icon={FiList} title="No production records" description="Add daily production records to track mine output"
          action={canWrite && <button onClick={onAdd} className="btn-primary btn-sm"><FiPlus size={12}/> Add Record</button>}/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Mine</th><th>Actual (T)</th><th>Target (T)</th><th>Achievement</th><th>T/hr</th><th>Machines</th><th>Workers</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-sm" style={{ color:'var(--text-primary)' }}>{r.record_date}</td>
                  <td className="text-sm" style={{ color:'var(--text-secondary)' }}>{r.mine_name}</td>
                  <td className="font-bold text-amber-500">{parseInt(r.actual_tonnes||0).toLocaleString('en-IN')}</td>
                  <td style={{ color:'var(--text-muted)' }}>{r.target_tonnes ? parseInt(r.target_tonnes).toLocaleString('en-IN') : '—'}</td>
                  <td>
                    {r.achievement_pct != null ? (
                      <>
                        <span className={clsx('text-sm font-bold', achColor(r.achievement_pct))}>{r.achievement_pct}%</span>
                        <AchBar pct={r.achievement_pct}/>
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ color:'var(--text-muted)' }}>{r.productivity_tph || '—'}</td>
                  <td style={{ color:'var(--text-muted)' }}>{r.active_machines || '—'}</td>
                  <td style={{ color:'var(--text-muted)' }}>{r.workers_deployed || '—'}</td>
                  <td><Badge color={r.status==='verified'?'green':r.status==='disputed'?'red':'gray'}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 p-3">
              <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="btn-outline btn-sm">Prev</button>
              <span className="text-xs self-center" style={{ color:'var(--text-muted)' }}>Page {page}/{pagination.pages}</span>
              <button disabled={page>=pagination.pages} onClick={()=>setPage(p=>p+1)} className="btn-outline btn-sm">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MACHINERY TAB
   ════════════════════════════════════════════════════════════════════ */
function MachineryTab({ mines, user }) {
  const [machines,  setMachines]  = useState([]);
  const [summary,   setSummary]   = useState({});
  const [loading,   setLoading]   = useState(true);
  const [mineF,     setMineF]     = useState(user?.mine_id || '');
  const [statusF,   setStatusF]   = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [editItem,  setEditItem]  = useState(null);

  const canWrite = ['admin','government_officer','mine_manager','inspector','mining_engineer'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await productionApi.getMachinery({ mine_id: mineF || undefined, status: statusF || undefined });
      setMachines(r.data || []);
      setSummary(r.summary || {});
    } catch { toast.error('Failed to load machinery'); }
    finally { setLoading(false); }
  }, [mineF, statusF]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, newStatus, reason) => {
    try {
      await productionApi.updateMachine(id, { status: newStatus, downtime_reason: reason || null });
      toast.success(`Status updated to ${newStatus}`);
      load();
    } catch { toast.error('Update failed'); }
  };

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        {Object.entries({ operational:'green', maintenance:'yellow', breakdown:'red', idle:'gray' }).map(([status, color]) => (
          <div key={status}
            onClick={() => setStatusF(s => s === status ? '' : status)}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-xl border cursor-pointer transition-all',
              statusF === status ? 'border-amber-500 bg-amber-500/8' : 'border-[var(--border)] hover:border-amber-500/40')}>
            <span>{MACH_ICON[status]}</span>
            <span className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{summary[status] || 0}</span>
            <span className="text-xs capitalize" style={{ color:'var(--text-muted)' }}>{status}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <select value={mineF} onChange={e => setMineF(e.target.value)} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button onClick={load} className="btn-outline btn-sm"><FiRefreshCw size={12}/> Refresh</button>
        {canWrite && <button onClick={() => { setEditItem(null); setShowForm(true); }} className="btn-primary btn-sm"><FiPlus size={13}/> Add Machine</button>}
      </div>

      {loading ? <PageLoader/> : machines.length === 0 ? (
        <EmptyState icon={FiTool} title="No machinery registered"
          description="Register mining machinery to track operational status"
          action={canWrite && <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">Add Machine</button>}/>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {machines.map(m => (
            <div key={m.id} className={clsx('card border-2',
              m.status === 'breakdown' ? 'border-red-500/30 bg-red-500/3'
              : m.status === 'maintenance' ? 'border-amber-500/30'
              : 'border-[var(--border)]')}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{m.machine_name}</p>
                  <p className="text-[10px] font-mono" style={{ color:'var(--text-muted)' }}>{m.machine_code || '—'} · {m.machine_type}</p>
                </div>
                <Badge color={MACH_COLOR[m.status]||'gray'}>{MACH_ICON[m.status]} {m.status}</Badge>
              </div>
              <div className="text-[11px] space-y-0.5" style={{ color:'var(--text-muted)' }}>
                {m.mine_name       && <p>⛏ {m.mine_name}</p>}
                {m.location_in_mine&& <p>📍 {m.location_in_mine}</p>}
                {m.capacity_tph    && <p>⚡ Capacity: {m.capacity_tph} T/hr</p>}
                {m.operator_name   && <p>👷 {m.operator_name}</p>}
                {m.downtime_reason && <p className="text-red-400">⚠ {m.downtime_reason}</p>}
                {m.downtime_hours > 0 && <p className="text-amber-500">⏱ Downtime: {m.downtime_hours}h</p>}
              </div>
              {canWrite && m.status !== 'operational' && (
                <button
                  onClick={() => updateStatus(m.id, 'operational', null)}
                  className="mt-3 w-full btn-sm bg-green-500/10 text-green-600 border border-green-500/25 hover:bg-green-500/20 rounded-lg text-xs font-bold">
                  ✓ Mark Operational
                </button>
              )}
              {canWrite && m.status === 'operational' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => updateStatus(m.id, 'maintenance', 'Scheduled maintenance')}
                    className="flex-1 btn-sm bg-amber-500/10 text-amber-600 border border-amber-500/25 hover:bg-amber-500/20 rounded-lg text-xs font-bold">
                    🔧 Maintenance
                  </button>
                  <button onClick={() => updateStatus(m.id, 'breakdown', 'Equipment breakdown')}
                    className="flex-1 btn-sm bg-red-500/10 text-red-500 border border-red-500/25 hover:bg-red-500/20 rounded-lg text-xs font-bold">
                    🔴 Breakdown
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Machine Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Register Machine" size="md">
        <AddMachineForm mines={mines} onSave={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)}/>
      </Modal>
    </div>
  );
}

function AddMachineForm({ mines, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();
  const onSubmit = async (data) => {
    try {
      await productionApi.addMachine(data);
      toast.success('Machine registered');
      onSave();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed to add machine'); }
  };
  const TYPES = ['Excavator','Dumper','Drill','Conveyor','Crusher','Pump','Ventilation','SDL','LHD','Blaster','Other'];
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group col-span-2"><label className="label">Mine *</label>
          <select {...register('mine_id',{required:true})} className="select">
            <option value="">Select Mine</option>
            {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
        <div className="form-group"><label className="label">Machine Name *</label>
          <input {...register('machine_name',{required:true})} className="input" placeholder="Excavator E-01"/></div>
        <div className="form-group"><label className="label">Machine Code</label>
          <input {...register('machine_code')} className="input" placeholder="EXC-01"/></div>
        <div className="form-group"><label className="label">Type *</label>
          <select {...register('machine_type',{required:true})} className="select">
            <option value="">Select</option>
            {TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select></div>
        <div className="form-group"><label className="label">Capacity (T/hr)</label>
          <input type="number" {...register('capacity_tph')} className="input" placeholder="450"/></div>
        <div className="form-group"><label className="label">Location in Mine</label>
          <input {...register('location_in_mine')} className="input" placeholder="Surface Pit"/></div>
        <div className="form-group"><label className="label">Operator</label>
          <input {...register('operator_name')} className="input" placeholder="Ravi Kumar"/></div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving…' : 'Register Machine'}
        </button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AI ANALYSIS TAB
   ════════════════════════════════════════════════════════════════════ */
function AnalysisTab({ mines, user }) {
  const [mineF,    setMineF]    = useState(user?.mine_id || '');
  const [analysis, setAnalysis] = useState(null);
  const [loading,  setLoading]  = useState(false);

  const load = async () => {
    if (!mineF) { toast.error('Select a mine first'); return; }
    setLoading(true);
    try {
      const r = await productionApi.getAnalysis({ mine_id: mineF });
      setAnalysis(r.data);
    } catch { toast.error('Analysis failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (mineF) load(); }, [mineF]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="form-group mb-0">
          <label className="label">Mine</label>
          <select value={mineF} onChange={e => setMineF(e.target.value)} className="select w-48">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <button onClick={load} disabled={!mineF || loading} className="btn-primary btn-sm self-end">
          {loading ? <><LoadingSpinner size="sm" className="mr-1"/> Analysing…</> : <><FiCpu size={12}/> Run Analysis</>}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-2">
        <FiInfo size={14} className="text-blue-500 mt-0.5 shrink-0"/>
        <p className="text-xs" style={{ color:'var(--text-secondary)' }}>
          <strong className="text-blue-500">AI Analysis Disclaimer:</strong> All insights below are based on statistical analysis of production records. They highlight patterns and correlations — <strong>not confirmed root causes</strong>. Always verify findings with ground-level observations before taking action.
        </p>
      </div>

      {loading ? <div className="flex justify-center py-16"><LoadingSpinner size="lg"/></div>
      : !analysis ? (
        <div className="flex flex-col items-center justify-center py-16 text-center" style={{ color:'var(--text-muted)' }}>
          <FiCpu size={32} className="mb-3 opacity-40"/>
          <p className="font-semibold">Select a mine and click Run Analysis</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1.5">Summary</p>
            <p className="text-sm" style={{ color:'var(--text-secondary)' }}>{analysis.summary}</p>
            <p className="text-[10px] mt-2" style={{ color:'var(--text-muted)' }}>Based on {analysis.data_points} data points</p>
          </div>

          {/* Insights */}
          <div className="space-y-3">
            {(analysis.insights || []).map((ins, i) => (
              <div key={i} className={clsx('card border-2',
                ins.severity === 'HIGH' ? 'border-red-500/30' :
                ins.severity === 'MEDIUM' ? 'border-amber-500/30' : 'border-green-500/30')}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{INSIGHT_ICON[ins.type] || '📊'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge color={INSIGHT_COLOR[ins.type]||'gray'}>{ins.type.replace('_',' ')}</Badge>
                      <Badge color={ins.severity==='HIGH'?'red':ins.severity==='MEDIUM'?'yellow':'green'}>{ins.severity}</Badge>
                    </div>
                    <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{ins.title}</p>
                    <p className="text-xs mt-1" style={{ color:'var(--text-secondary)' }}>{ins.detail}</p>
                    <p className="text-[10px] mt-1.5 italic" style={{ color:'var(--text-muted)' }}>🤖 {ins.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] italic text-center" style={{ color:'var(--text-muted)' }}>{analysis.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ADD PRODUCTION RECORD FORM
   ════════════════════════════════════════════════════════════════════ */
function AddRecordForm({ mines, onSave, onCancel }) {
  const [targets, setTargets] = useState({});
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: { record_date: new Date().toISOString().slice(0,10), shift:'all', mineral_type:'Coal' },
  });

  const mineId    = watch('mine_id');
  const recordDate= watch('record_date');
  const actual    = watch('actual_tonnes');
  const targetVal = targets[`${mineId}_${recordDate}`] || null;
  const achPct    = targetVal && actual ? Math.round((parseFloat(actual)/targetVal)*100) : null;

  useEffect(() => {
    if (!mineId || !recordDate) return;
    productionApi.getTargets({ mine_id: mineId, from_date: recordDate, to_date: recordDate })
      .then(r => {
        const t = r.data?.[0];
        if (t) setTargets(prev => ({ ...prev, [`${mineId}_${recordDate}`]: t.target_tonnes }));
      }).catch(() => {});
  }, [mineId, recordDate]);

  const onSubmit = async (data) => {
    try {
      await productionApi.createRecord(data);
      toast.success('Production record saved');
      onSave();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed to save'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group"><label className="label">Mine *</label>
          <select {...register('mine_id',{required:true})} className="select">
            <option value="">Select Mine</option>
            {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
        <div className="form-group"><label className="label">Date *</label>
          <input type="date" {...register('record_date',{required:true})} className="input"/></div>
        <div className="form-group"><label className="label">Actual Production (Tonnes) *</label>
          <input type="number" step="0.1" {...register('actual_tonnes',{required:true,min:0})} className="input" placeholder="8200"/>
          {targetVal && <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>Target: {parseInt(targetVal).toLocaleString('en-IN')} T</p>}
          {achPct != null && <p className={clsx('text-xs font-bold mt-0.5', achColor(achPct))}>Achievement: {achPct}%</p>}
        </div>
        <div className="form-group"><label className="label">Working Hours</label>
          <input type="number" step="0.5" {...register('working_hours')} className="input" placeholder="18"/></div>
        <div className="form-group"><label className="label">Active Machines</label>
          <input type="number" {...register('active_machines')} className="input" placeholder="12"/></div>
        <div className="form-group"><label className="label">Workers Deployed</label>
          <input type="number" {...register('workers_deployed')} className="input" placeholder="200"/></div>
        <div className="form-group"><label className="label">Shift</label>
          <select {...register('shift')} className="select">
            {['all','day','night','A','B','C'].map(s=><option key={s} value={s}>{s}</option>)}
          </select></div>
        <div className="form-group"><label className="label">Section / Seam</label>
          <input {...register('section')} className="input" placeholder="Main Seam A"/></div>
        <div className="form-group col-span-2"><label className="label">Notes</label>
          <textarea {...register('notes')} rows={2} className="input resize-none" placeholder="Any issues, observations…"/></div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving…' : '➕ Save Production Record'}
        </button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
export default function ProductionMonitoring() {
  const { user }                  = useAuthStore();
  const [mines,     setMines]     = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showForm,  setShowForm]  = useState(false);

  const canWrite = ['admin','government_officer','mine_manager','inspector','safety_officer','mining_engineer','corporate_management'].includes(user?.role);

  useEffect(() => {
    minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{});
  }, []);

  return (
    <div className="space-y-5 pb-10">
      <BackButton className="mb-1"/>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiTrendingUp className="text-amber-500"/> Production Monitoring
          </h1>
          <p className="page-subtitle">Track daily/weekly/monthly production, machinery status and AI-powered anomaly insights</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <FiPlus size={15}/> Add Production Record
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-xl p-1 gap-1 flex-wrap w-fit">
        {TABS.map(({ key, label, icon:Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              activeTab===key ? 'bg-[var(--bg-card)] text-amber-500 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
            <Icon size={14}/> {label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <DashboardTab mines={mines} user={user}/>}
      {activeTab === 'trends'    && <TrendsTab    mines={mines} user={user}/>}
      {activeTab === 'records'   && <RecordsTab   mines={mines} user={user} onAdd={() => setShowForm(true)}/>}
      {activeTab === 'machinery' && <MachineryTab mines={mines} user={user}/>}
      {activeTab === 'analysis'  && <AnalysisTab  mines={mines} user={user}/>}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Add Daily Production Record" size="lg">
        <AddRecordForm mines={mines} onSave={() => { setShowForm(false); }} onCancel={() => setShowForm(false)}/>
      </Modal>
    </div>
  );
}
