/**
 * KhanNetra — Contractor Management  v2
 * Dashboard cards with validity / workers / violations / compliance.
 * Detail modal shows workers list, expiry alerts, score recalculation.
 */
import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import {
  FiPlus, FiUsers, FiSearch, FiEye, FiEdit2, FiTrash2,
  FiAlertTriangle, FiRefreshCw, FiCalendar, FiCheckCircle,
  FiTool, FiBarChart2, FiAlertOctagon, FiClock,
} from 'react-icons/fi';
import { contractorsApi, minesApi } from '../../services/api';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader, LoadingSpinner } from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ScoreBar from '../../components/ui/ScoreBar';
import { useForm } from 'react-hook-form';
import useAuthStore from '../../store/authStore';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_COLOR = { active:'green', suspended:'red', expired:'yellow', terminated:'gray' };

/* ── Validity pill ───────────────────────────────────────────────────── */
function ValidityPill({ daysLeft }) {
  if (daysLeft === null || daysLeft === undefined) return <span className="text-xs" style={{ color:'var(--text-muted)' }}>—</span>;
  if (daysLeft < 0)   return <Badge color="red">⚠ EXPIRED</Badge>;
  if (daysLeft <= 7)  return <Badge color="red">🔴 {daysLeft}d left</Badge>;
  if (daysLeft <= 30) return <Badge color="yellow">⚠ {daysLeft}d left</Badge>;
  if (daysLeft <= 60) return <Badge color="yellow">{daysLeft}d left</Badge>;
  return <span className="text-xs text-green-500">{daysLeft}d left</span>;
}

/* ── Contractor Dashboard Card ───────────────────────────────────────── */
function ContractorCard({ c, onView, onEdit, onDelete, canWrite, isAdmin }) {
  const daysLeft = c.validity_days_left;
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiring = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;

  return (
    <div className={clsx(
      'card flex flex-col gap-3 hover:shadow-md transition-shadow border-2',
      isExpired  ? 'border-red-500/30'    :
      isExpiring ? 'border-amber-500/30'  : 'border-[var(--border)]'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color:'var(--text-primary)' }}>{c.name}</p>
          <p className="text-[10px] font-mono mt-0.5" style={{ color:'var(--text-muted)' }}>{c.registration_number || '—'}</p>
          <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{c.work_type} · {c.mine_name}</p>
        </div>
        <Badge color={STATUS_COLOR[c.status]||'gray'} dot>{c.status}</Badge>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded-lg border border-[var(--border)] py-1.5" style={{ background:'var(--bg-card-hover)' }}>
          <p className="text-sm font-black" style={{ color:'var(--text-primary)' }}>{c.active_workers || c.workers_count || 0}</p>
          <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>Workers</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] py-1.5" style={{ background:'var(--bg-card-hover)' }}>
          <p className={clsx('text-sm font-black', parseInt(c.total_violations||0)>0 ? 'text-red-500' : 'text-green-500')}>
            {c.total_violations || 0}
          </p>
          <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>Violations</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] py-1.5" style={{ background:'var(--bg-card-hover)' }}>
          <p className={clsx('text-sm font-black',
            parseFloat(c.compliance_score||0)>=80 ? 'text-green-600' :
            parseFloat(c.compliance_score||0)>=60 ? 'text-amber-600' : 'text-red-500')}>
            {parseFloat(c.compliance_score||0).toFixed(0)}%
          </p>
          <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>Compliance</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] py-1.5" style={{ background:'var(--bg-card-hover)' }}>
          <p className={clsx('text-sm font-black',
            parseFloat(c.safety_score||0)>=80 ? 'text-green-600' :
            parseFloat(c.safety_score||0)>=60 ? 'text-amber-600' : 'text-red-500')}>
            {parseFloat(c.safety_score||0).toFixed(0)}%
          </p>
          <p className="text-[9px]" style={{ color:'var(--text-muted)' }}>Safety</p>
        </div>
      </div>

      {/* Contract validity */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs" style={{ color:'var(--text-muted)' }}>
          <FiCalendar size={11}/>
          {c.contract_end ? `Ends ${formatDate(c.contract_end)}` : 'No end date'}
        </div>
        <ValidityPill daysLeft={daysLeft}/>
      </div>

      {/* Actions */}
      <div className="flex gap-1 pt-1 border-t border-[var(--border)]">
        <button onClick={() => onView(c)}
          className="flex-1 btn-outline btn-sm text-xs justify-center">
          <FiEye size={12}/> Details
        </button>
        {canWrite && (
          <button onClick={() => onEdit(c)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-600 hover:bg-blue-500/10 transition-colors">
            <FiEdit2 size={14}/>
          </button>
        )}
        {isAdmin && (
          <button onClick={() => onDelete(c.id)}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors">
            <FiTrash2 size={14}/>
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Contractor Detail Modal ─────────────────────────────────────────── */
function ContractorDetail({ contractor, canWrite, onSaved }) {
  const [tab,      setTab]      = useState('overview');
  const [workers,  setWorkers]  = useState([]);
  const [wLoading, setWLoading] = useState(false);
  const [recalcing,setRecalcing]= useState(false);
  const [c,        setC]        = useState(contractor);

  const loadWorkers = async () => {
    setWLoading(true);
    try {
      const r = await contractorsApi.getWorkers(c.id, { limit:100 });
      setWorkers(r.data || []);
    } catch { toast.error('Failed to load workers'); }
    finally { setWLoading(false); }
  };

  useEffect(() => {
    if (tab === 'workers') loadWorkers();
  }, [tab]);

  const recalculate = async () => {
    setRecalcing(true);
    try {
      const r = await contractorsApi.recalculate(c.id);
      setC(r.data);
      toast.success('Scores recalculated from real data');
      onSaved && onSaved();
    } catch { toast.error('Recalculation failed'); }
    finally { setRecalcing(false); }
  };

  const daysLeft = c.validity_days_left;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge color={STATUS_COLOR[c.status]||'gray'} dot>{c.status}</Badge>
            <ValidityPill daysLeft={daysLeft}/>
          </div>
          <p className="text-sm" style={{ color:'var(--text-muted)' }}>{c.work_type} · {c.mine_name}</p>
          {c.registration_number && <p className="text-xs font-mono mt-0.5" style={{ color:'var(--text-muted)' }}>Reg: {c.registration_number}</p>}
        </div>
        {canWrite && (
          <button onClick={recalculate} disabled={recalcing}
            className="btn-outline btn-sm flex items-center gap-1.5">
            {recalcing ? <><LoadingSpinner size="sm"/> Recalculating…</> : <><FiRefreshCw size={12}/> Recalculate Scores</>}
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label:'Workers',    value:c.active_workers || c.workers_count||0,         color:'' },
          { label:'Violations', value:c.total_violations||0,                          color:parseInt(c.total_violations||0)>0?'text-red-500':'text-green-500' },
          { label:'Compliance', value:`${parseFloat(c.compliance_score||0).toFixed(0)}%`,
            color:parseFloat(c.compliance_score||0)>=80?'text-green-600':parseFloat(c.compliance_score||0)>=60?'text-amber-600':'text-red-500' },
          { label:'Safety',     value:`${parseFloat(c.safety_score||0).toFixed(0)}%`,
            color:parseFloat(c.safety_score||0)>=80?'text-green-600':parseFloat(c.safety_score||0)>=60?'text-amber-600':'text-red-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-[var(--border)] py-3" style={{ background:'var(--bg-card-hover)' }}>
            <p className={clsx('text-xl font-black', color || 'text-[var(--text-primary)]')}>{value}</p>
            <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] gap-4">
        {['overview','workers','scores'].map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={clsx('pb-2 text-xs font-semibold border-b-2 -mb-px capitalize transition-colors',
              tab===t ? 'border-amber-500 text-amber-500' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
            {t === 'scores' ? 'Compliance & Safety' : t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {[
            ['Contact Name',   c.contact_name   || '—'],
            ['Contact Phone',  c.contact_phone  || '—'],
            ['Contact Email',  c.contact_email  || '—'],
            ['Contract Start', formatDate(c.contract_start)],
            ['Contract End',   formatDate(c.contract_end)],
            ['Contract Value', c.contract_value ? `₹${parseFloat(c.contract_value).toLocaleString('en-IN')}` : '—'],
            ['Last Inspection',formatDate(c.last_inspection_date)],
            ['Performance',    c.performance_rating ? `${parseFloat(c.performance_rating).toFixed(1)}/5` : '—'],
            ['Total Incidents',c.total_incidents || 0],
            ['Penalty Amount', c.penalty_amount ? `₹${parseFloat(c.penalty_amount).toLocaleString('en-IN')}` : '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
              <p className="font-semibold" style={{ color:'var(--text-primary)' }}>{val}</p>
            </div>
          ))}
          {c.notes && (
            <div className="col-span-2">
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color:'var(--text-muted)' }}>Notes</p>
              <p className="text-xs" style={{ color:'var(--text-secondary)' }}>{c.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Workers list */}
      {tab === 'workers' && (
        <div className="space-y-2">
          {wLoading ? <PageLoader/> : workers.length === 0 ? (
            <EmptyState icon={FiUsers} title="No workers registered" description="No active workers linked to this contractor"/>
          ) : (
            <>
              <p className="text-xs" style={{ color:'var(--text-muted)' }}>{workers.length} active worker{workers.length!==1?'s':''}</p>
              <div className="table-container max-h-72 overflow-y-auto">
                <table className="table text-xs">
                  <thead>
                    <tr><th>ID</th><th>Name</th><th>Mine</th><th>Dept</th><th>Shift</th><th>Att 30d</th><th>Certs</th></tr>
                  </thead>
                  <tbody>
                    {workers.map(w => {
                      const pct = parseInt(w.total_30d||0) > 0
                        ? Math.round((parseInt(w.present_30d||0)/parseInt(w.total_30d||0))*100)
                        : null;
                      return (
                        <tr key={w.id}>
                          <td className="font-mono text-amber-600">{w.worker_code}</td>
                          <td>
                            <p className="font-semibold" style={{ color:'var(--text-primary)' }}>{w.full_name}</p>
                            <p style={{ color:'var(--text-muted)' }}>{w.designation}</p>
                          </td>
                          <td style={{ color:'var(--text-secondary)' }}>{w.mine_name}</td>
                          <td style={{ color:'var(--text-secondary)' }}>{w.department}</td>
                          <td className="capitalize" style={{ color:'var(--text-muted)' }}>{w.shift}</td>
                          <td>
                            {pct !== null
                              ? <span className={clsx('font-bold', pct>=75?'text-green-500':pct>=50?'text-amber-500':'text-red-500')}>{pct}%</span>
                              : <span style={{ color:'var(--text-muted)' }}>—</span>}
                          </td>
                          <td>
                            {parseInt(w.expired_certs||0) > 0
                              ? <span className="text-red-500 font-bold">{w.expired_certs} exp</span>
                              : <span className="text-green-500">{w.valid_certs||0} ✓</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Scores */}
      {tab === 'scores' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label mb-2 flex items-center gap-1.5"><FiShield size={12}/> Safety Score</p>
              <ScoreBar score={c.safety_score}/>
              <p className="text-[10px] mt-1" style={{ color:'var(--text-muted)' }}>Based on violations and incidents (last 180 days)</p>
            </div>
            <div>
              <p className="label mb-2 flex items-center gap-1.5"><FiCheckCircle size={12}/> Compliance Score</p>
              <ScoreBar score={c.compliance_score}/>
              <p className="text-[10px] mt-1" style={{ color:'var(--text-muted)' }}>Based on attendance rate, certifications and safety</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border)] text-xs space-y-1" style={{ color:'var(--text-secondary)' }}>
            <p className="font-semibold" style={{ color:'var(--text-primary)' }}>How scores are calculated:</p>
            <p>• Safety = 100 − (violations × 5) − (incidents × 10), capped 0–100</p>
            <p>• Compliance = (attendance rate × 40%) + (cert validity × 40%) + (safety × 20%)</p>
            <p>Click "Recalculate Scores" to refresh from latest data.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Contractor Form ─────────────────────────────────────────────────── */
function ContractorForm({ mines, contractor, onSave, onCancel }) {
  const { register, handleSubmit, formState:{ isSubmitting } } = useForm({
    defaultValues: contractor || { status:'active', safety_score:75, compliance_score:75, expiry_alert_days:30 },
  });
  const onSubmit = async (data) => {
    try {
      if (contractor?.id) { await contractorsApi.update(contractor.id, data); toast.success('Updated'); }
      else                { await contractorsApi.create(data);                toast.success('Contractor added'); }
      onSave();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed to save'); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group col-span-2"><label className="label">Contractor Name *</label>
          <input {...register('name',{required:true})} className="input" placeholder="Bharat Mining Services Pvt Ltd"/></div>
        <div className="form-group"><label className="label">Registration #</label>
          <input {...register('registration_number')} className="input" placeholder="REG-2024-001"/></div>
        <div className="form-group"><label className="label">Mine *</label>
          <select {...register('mine_id',{required:true})} className="select">
            <option value="">Select Mine</option>
            {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
        <div className="form-group"><label className="label">Work Type *</label>
          <input {...register('work_type',{required:true})} className="input" placeholder="Drilling & Blasting"/></div>
        <div className="form-group"><label className="label">Workers Count</label>
          <input type="number" {...register('workers_count')} className="input"/></div>
        <div className="form-group"><label className="label">Contract Start</label>
          <input type="date" {...register('contract_start')} className="input"/></div>
        <div className="form-group"><label className="label">Contract End</label>
          <input type="date" {...register('contract_end')} className="input"/></div>
        <div className="form-group"><label className="label">Contract Value (₹)</label>
          <input type="number" {...register('contract_value')} className="input"/></div>
        <div className="form-group"><label className="label">Safety Score (0–100)</label>
          <input type="number" min="0" max="100" {...register('safety_score')} className="input"/></div>
        <div className="form-group"><label className="label">Compliance Score (0–100)</label>
          <input type="number" min="0" max="100" {...register('compliance_score')} className="input"/></div>
        <div className="form-group"><label className="label">Performance Rating (0–5)</label>
          <input type="number" min="0" max="5" step="0.1" {...register('performance_rating')} className="input"/></div>
        <div className="form-group"><label className="label">Expiry Alert (days before)</label>
          <input type="number" {...register('expiry_alert_days')} className="input" defaultValue={30}/></div>
        <div className="form-group"><label className="label">Status</label>
          <select {...register('status')} className="select">
            {['active','suspended','expired','terminated'].map(s=><option key={s} value={s}>{s}</option>)}
          </select></div>
        <div className="form-group"><label className="label">Contact Name</label>
          <input {...register('contact_name')} className="input"/></div>
        <div className="form-group"><label className="label">Contact Phone</label>
          <input {...register('contact_phone')} className="input"/></div>
        <div className="form-group col-span-2"><label className="label">Notes</label>
          <textarea {...register('notes')} rows={2} className="input resize-none"/></div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving…' : contractor ? 'Update' : 'Add Contractor'}
        </button>
      </div>
    </form>
  );
}

/* ── FiShield import shim ────────────────────────────────────────────── */
import { FiShield } from 'react-icons/fi';

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function Contractors() {
  const { user }                              = useAuthStore();
  const [contractors, setContractors]         = useState([]);
  const [mines,       setMines]               = useState([]);
  const [stats,       setStats]               = useState(null);
  const [expiryAlerts,setExpiryAlerts]        = useState([]);
  const [loading,     setLoading]             = useState(true);
  const [search,      setSearch]              = useState('');
  const [statusF,     setStatusF]             = useState('');
  const [mineF,       setMineF]               = useState(user?.mine_id || '');
  const [expiringOnly,setExpiringOnly]        = useState(false);
  const [showForm,    setShowForm]            = useState(false);
  const [editItem,    setEditItem]            = useState(null);
  const [viewItem,    setViewItem]            = useState(null);
  const [deleteId,    setDeleteId]            = useState(null);
  const [page,        setPage]                = useState(1);
  const [pagination,  setPagination]          = useState({});
  const [showExpAlerts,setShowExpAlerts]      = useState(false);
  const [viewMode,    setViewMode]            = useState('cards'); // 'cards' | 'table'

  const canWrite = ['admin','government_officer','mine_manager','inspector'].includes(user?.role);
  const isAdmin  = ['admin','government_officer'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s, ea] = await Promise.all([
        contractorsApi.getAll({ status:statusF, page, limit:12, search, expiring:expiringOnly||undefined, mine_id:mineF||undefined }),
        contractorsApi.getStats({ mine_id:mineF||undefined }),
        contractorsApi.getExpiryAlerts({ days:60, mine_id:mineF||undefined }),
      ]);
      setContractors(r.data || []);
      setPagination(r.pagination || {});
      setStats(s.data);
      setExpiryAlerts(ea.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusF, page, search, expiringOnly, mineF]);
  useEffect(() => { minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{}); }, []);

  const handleDelete = async () => {
    try { await contractorsApi.delete(deleteId); toast.success('Deleted'); setDeleteId(null); load(); } catch {}
  };

  return (
    <div className="space-y-5">
      <BackButton className="mb-1"/>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiUsers className="text-amber-500"/> Contractor Management</h1>
          <p className="page-subtitle">Track contractor compliance, safety records, workers, and contract validity</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {expiryAlerts.length > 0 && (
            <button onClick={() => setShowExpAlerts(true)}
              className="btn-sm bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20 rounded-lg px-3 flex items-center gap-1.5 text-xs font-bold">
              <FiAlertTriangle size={13}/> {expiryAlerts.length} expiring contracts
            </button>
          )}
          {canWrite && <button onClick={() => { setEditItem(null); setShowForm(true); }} className="btn-primary"><FiPlus size={15}/> Add Contractor</button>}
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:'Total Contractors', value:stats.totals?.total||0,                                          color:'text-[var(--text-primary)]' },
            { label:'Total Workers',     value:parseInt(stats.totals?.total_workers||0).toLocaleString('en-IN'),color:'text-blue-500' },
            { label:'Avg Compliance',    value:`${parseFloat(stats.totals?.avg_compliance||0).toFixed(0)}%`,    color:parseFloat(stats.totals?.avg_compliance||0)>=75?'text-green-500':'text-amber-500' },
            { label:'Low Compliance',    value:stats.lowCompliance?.length||0,                                  color:'text-red-500' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color:'var(--text-muted)' }}>{s.label}</p>
              <p className={clsx('text-2xl font-black', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Low-compliance alert */}
      {stats?.lowCompliance?.length > 0 && (
        <div className="card p-3 border border-red-500/25 bg-red-500/5">
          <div className="flex items-center gap-2 mb-2">
            <FiAlertOctagon className="text-red-400" size={15}/>
            <span className="font-bold text-red-400 text-sm">Low Compliance Contractors (&lt;60%)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.lowCompliance.map(c => (
              <button key={c.id} onClick={() => setViewItem(c)}
                className="px-2.5 py-1 rounded-lg text-xs bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors">
                {c.name} — {parseFloat(c.compliance_score).toFixed(0)}% · {c.total_violations||0} violations
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-44 relative">
          <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9" placeholder="Search contractors…"/>
        </div>
        <select value={mineF} onChange={e => { setMineF(e.target.value); setPage(1); }} className="select w-44">
          <option value="">All Mines</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }} className="select w-36">
          <option value="">All Status</option>
          {['active','suspended','expired','terminated'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap" style={{ color:'var(--text-secondary)' }}>
          <input type="checkbox" checked={expiringOnly} onChange={e => { setExpiringOnly(e.target.checked); setPage(1); }} className="w-3.5 h-3.5"/>
          Expiring (60d)
        </label>
        <div className="flex gap-1 border border-[var(--border)] rounded-lg p-0.5">
          {['cards','table'].map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              className={clsx('px-2.5 py-1 rounded-md text-xs font-semibold transition-all capitalize',
                viewMode===v ? 'bg-amber-500 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? <PageLoader/> : contractors.length === 0 ? (
        <EmptyState icon={FiUsers} title="No contractors found"
          action={canWrite && <button onClick={() => { setEditItem(null); setShowForm(true); }} className="btn-primary">Add Contractor</button>}/>
      ) : viewMode === 'cards' ? (
        /* ── Cards view ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {contractors.map(c => (
            <ContractorCard key={c.id} c={c}
              onView={setViewItem}
              onEdit={item => { setEditItem(item); setShowForm(true); }}
              onDelete={setDeleteId}
              canWrite={canWrite} isAdmin={isAdmin}/>
          ))}
        </div>
      ) : (
        /* ── Table view ── */
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Contractor</th><th>Mine</th><th>Work Type</th><th>Workers</th>
                  <th>Safety</th><th>Compliance</th><th>Violations</th>
                  <th>Contract End</th><th>Validity</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {contractors.map(c => (
                <tr key={c.id}>
                  <td>
                    <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{c.name}</p>
                    <p className="text-[10px] font-mono" style={{ color:'var(--text-muted)' }}>{c.registration_number||'—'}</p>
                  </td>
                  <td style={{ color:'var(--text-secondary)' }}>{c.mine_name}</td>
                  <td style={{ color:'var(--text-muted)' }}>{c.work_type}</td>
                  <td className="font-bold" style={{ color:'var(--text-primary)' }}>{c.active_workers||c.workers_count||0}</td>
                  <td>
                    <span className={clsx('text-xs font-bold',
                      parseFloat(c.safety_score||0)>=80?'text-green-500':parseFloat(c.safety_score||0)>=60?'text-amber-500':'text-red-500')}>
                      {parseFloat(c.safety_score||0).toFixed(0)}%
                    </span>
                  </td>
                  <td>
                    <span className={clsx('text-xs font-bold',
                      parseFloat(c.compliance_score||0)>=80?'text-green-500':parseFloat(c.compliance_score||0)>=60?'text-amber-500':'text-red-500')}>
                      {parseFloat(c.compliance_score||0).toFixed(0)}%
                    </span>
                  </td>
                  <td>
                    <span className={clsx('text-xs font-bold', parseInt(c.total_violations||0)>0?'text-red-500':'text-green-500')}>
                      {c.total_violations||0}
                    </span>
                  </td>
                  <td className="text-xs" style={{ color:'var(--text-muted)' }}>{formatDate(c.contract_end)}</td>
                  <td><ValidityPill daysLeft={c.validity_days_left}/></td>
                  <td><Badge color={STATUS_COLOR[c.status]||'gray'} dot>{c.status}</Badge></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setViewItem(c)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-500 hover:bg-amber-500/10 transition-colors"><FiEye size={13}/></button>
                      {canWrite && <button onClick={() => { setEditItem(c); setShowForm(true); }} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-500 hover:bg-blue-500/10 transition-colors"><FiEdit2 size={13}/></button>}
                      {isAdmin && <button onClick={() => setDeleteId(c.id)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"><FiTrash2 size={13}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="btn-outline btn-sm">Prev</button>
          <span className="text-xs self-center" style={{ color:'var(--text-muted)' }}>Page {page} / {pagination.pages}</span>
          <button disabled={page>=pagination.pages} onClick={() => setPage(p=>p+1)} className="btn-outline btn-sm">Next</button>
        </div>
      )}

      {/* Detail modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={viewItem?.name} size="lg">
        {viewItem && <ContractorDetail contractor={viewItem} canWrite={canWrite} onSaved={load}/>}
      </Modal>

      {/* Add / Edit modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditItem(null); }}
        title={editItem ? 'Edit Contractor' : 'Add Contractor'} size="lg">
        <ContractorForm mines={mines} contractor={editItem}
          onSave={() => { setShowForm(false); setEditItem(null); load(); }}
          onCancel={() => { setShowForm(false); setEditItem(null); }}/>
      </Modal>

      {/* Expiry alerts modal */}
      <Modal isOpen={showExpAlerts} onClose={() => setShowExpAlerts(false)} title="Expiring Contracts (next 60 days)" size="md">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {expiryAlerts.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)]"
              style={{ background:'var(--bg-card-hover)' }}>
              <div>
                <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{c.name}</p>
                <p className="text-xs" style={{ color:'var(--text-muted)' }}>{c.mine_name} · {c.active_workers||0} workers</p>
                <p className="text-xs" style={{ color:'var(--text-muted)' }}>Ends: {formatDate(c.contract_end)}</p>
              </div>
              <ValidityPill daysLeft={c.days_left}/>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Delete Contractor" message="Delete this contractor? This action cannot be undone." danger confirmText="Delete"/>
    </div>
  );
}
