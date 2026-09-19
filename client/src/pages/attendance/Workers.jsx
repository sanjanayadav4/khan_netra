/**
 * KhanNetra — Workers Registry  v2
 * One-time registration → auto-populates daily attendance.
 * Shows: profile, attendance history, certifications, expiry alerts.
 */
import { useState, useEffect } from 'react';
import {
  FiUsers, FiPlus, FiRefreshCw, FiSearch, FiEdit2, FiEye,
  FiAlertTriangle, FiCheckCircle, FiAward, FiCalendar,
  FiMapPin, FiPhone, FiShield,
} from 'react-icons/fi';
import { workersApi, minesApi, contractorsApi } from '../../services/api';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import BackButton from '../../components/ui/BackButton';
import WorkerForm from './WorkerForm';

const STATUS_CLR  = { active:'green', inactive:'gray', transferred:'yellow', terminated:'red' };
const ATT_CLR     = { present:'green', absent:'red', late:'yellow', half_day:'blue', on_leave:'gray' };
const TRAIN_CLR   = { completed:'green', in_progress:'blue', not_started:'gray', expired:'red' };
const CERT_BADGE  = { valid:'green', expired:'red', revoked:'gray', pending:'yellow' };

/* ── Small stat chip ─────────────────────────────────────────────────── */
function StatChip({ label, value, color = 'text-[var(--text-primary)]' }) {
  return (
    <div className="card-sm text-center border border-[var(--border)] py-2">
      <p className={clsx('text-xl font-black', color)}>{value}</p>
      <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

/* ── Worker Profile Detail Panel ─────────────────────────────────────── */
function WorkerProfile({ workerId, canEdit, onEdit }) {
  const [data,      setData]      = useState(null);
  const [certs,     setCerts]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [histPage,  setHistPage]  = useState(1);
  const [activeTab, setActiveTab] = useState('profile');

  const load = async () => {
    setLoading(true);
    try {
      const [hRes, cRes] = await Promise.all([
        workersApi.getHistory(workerId, { page: histPage, limit: 30 }),
        workersApi.getCertifications(workerId).catch(() => ({ data: [] })),
      ]);
      setData(hRes.data);
      setCerts(cRes.data || []);
    } catch { toast.error('Could not load worker'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [workerId, histPage]);

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"/></div>;
  if (!data)   return <p className="text-center py-8" style={{ color:'var(--text-muted)' }}>Worker not found.</p>;

  const { worker, history, stats, pagination } = data;

  const expiredCerts    = certs.filter(c => c.status === 'expired').length;
  const expiringSoon    = certs.filter(c => {
    if (c.status !== 'valid' || !c.expiry_date) return false;
    const d = Math.ceil((new Date(c.expiry_date) - new Date()) / 86400000);
    return d >= 0 && d <= 30;
  }).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-2xl font-black text-amber-600 shrink-0">
            {worker.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-black" style={{ color:'var(--text-primary)' }}>{worker.full_name}</p>
            <p className="text-xs font-mono text-amber-600">{worker.worker_code}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge color={STATUS_CLR[worker.status] || 'gray'}>{worker.status}</Badge>
              <Badge color={TRAIN_CLR[worker.training_status] || 'gray'}>Training: {worker.training_status?.replace('_',' ')}</Badge>
              {expiredCerts > 0 && <Badge color="red">⚠ {expiredCerts} cert{expiredCerts>1?'s':''} expired</Badge>}
              {expiringSoon > 0 && <Badge color="yellow">⏰ {expiringSoon} expiring soon</Badge>}
            </div>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => onEdit(worker)} className="btn-outline btn-sm shrink-0">
            <FiEdit2 size={12}/> Edit
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] gap-4">
        {[
          { key:'profile',      label:'Profile'      },
          { key:'attendance',   label:'Attendance'   },
          { key:'certs',        label:`Certifications (${certs.length})` },
        ].map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)}
            className={clsx('pb-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
              activeTab === key
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
            {label}
          </button>
        ))}
      </div>

      {/* ── PROFILE TAB ── */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 rounded-xl border text-sm"
            style={{ background:'var(--bg-card-hover)', borderColor:'var(--border)' }}>
            {[
              ['Mine',            worker.mine_name],
              ['Department',      worker.department],
              ['Designation',     worker.designation],
              ['Shift',           worker.shift],
              ['Worker Type',     worker.worker_type],
              ['Contractor',      worker.contractor_name || 'Direct Employee'],
              ['Blood Group',     worker.blood_group || '—'],
              ['Joined',          worker.joining_date ? formatDate(worker.joining_date) : '—'],
              ['Phone',           worker.phone || '—'],
              ['Emergency',       worker.emergency_contact || '—'],
              ['Biometric ID',    worker.biometric_id || '—'],
              ['QR Code',         worker.qr_code ? worker.qr_code.slice(0,12)+'…' : '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
                <p className="font-semibold" style={{ color:'var(--text-primary)' }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Training & Medical */}
          <div className="p-3 rounded-xl border border-[var(--border)] space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'var(--text-muted)' }}>Training &amp; Medical</p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p style={{ color:'var(--text-muted)' }}>Safety Training</p>
                <p className="font-semibold" style={{ color:'var(--text-primary)' }}>
                  {worker.safety_training_date ? formatDate(worker.safety_training_date) : '—'}
                </p>
              </div>
              <div>
                <p style={{ color:'var(--text-muted)' }}>Training Expiry</p>
                <p className={clsx('font-semibold', worker.training_expiry_date && new Date(worker.training_expiry_date) < new Date() ? 'text-red-500' : 'var(--text-primary)')}>
                  {worker.training_expiry_date ? formatDate(worker.training_expiry_date) : '—'}
                </p>
              </div>
              <div>
                <p style={{ color:'var(--text-muted)' }}>Medical Fitness</p>
                <p className="font-semibold" style={{ color:'var(--text-primary)' }}>
                  {worker.medical_fitness_date ? formatDate(worker.medical_fitness_date) : '—'}
                </p>
              </div>
              <div>
                <p style={{ color:'var(--text-muted)' }}>Medical Expiry</p>
                <p className={clsx('font-semibold', worker.medical_expiry_date && new Date(worker.medical_expiry_date) < new Date() ? 'text-red-500' : '')}>
                  {worker.medical_expiry_date ? formatDate(worker.medical_expiry_date) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ATTENDANCE TAB ── */}
      {activeTab === 'attendance' && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <StatChip label="Total Days"  value={stats.total_records} />
            <StatChip label="Present"     value={stats.present}      color="text-green-600"/>
            <StatChip label="Absent"      value={stats.absent}       color="text-red-600"/>
            <StatChip label="Att. %"      value={`${stats.attendance_percent}%`}
              color={stats.attendance_percent >= 75 ? 'text-green-600' : stats.attendance_percent >= 50 ? 'text-amber-600' : 'text-red-600'}/>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color:'var(--text-muted)' }}>No records yet.</p>
          ) : (
            <>
              <div className="table-container max-h-64 overflow-y-auto">
                <table className="table text-xs">
                  <thead><tr><th>Date</th><th>Shift</th><th>Status</th><th>Check In</th><th>GPS</th><th>Remarks</th></tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td className="font-mono">{h.attendance_date}</td>
                        <td className="capitalize">{h.shift}</td>
                        <td><Badge color={ATT_CLR[h.status]||'gray'}>{h.status?.replace('_',' ')}</Badge></td>
                        <td className="font-mono">{h.check_in_time || '—'}</td>
                        <td>{h.latitude ? <FiMapPin size={11} className="text-green-500" title={`${h.latitude},${h.longitude}`}/> : '—'}</td>
                        <td className="max-w-[100px] truncate">{h.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pagination?.pages > 1 && (
                <div className="flex justify-center gap-2">
                  <button disabled={histPage <= 1} onClick={() => setHistPage(p => p-1)} className="btn-outline btn-sm text-xs">Prev</button>
                  <span className="text-xs self-center" style={{ color:'var(--text-muted)' }}>{histPage}/{pagination.pages}</span>
                  <button disabled={histPage >= pagination.pages} onClick={() => setHistPage(p => p+1)} className="btn-outline btn-sm text-xs">Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── CERTS TAB ── */}
      {activeTab === 'certs' && (
        <div className="space-y-2">
          {certs.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color:'var(--text-muted)' }}>No certifications recorded.</p>
          ) : certs.map(cert => {
            const dl = cert.expiry_date ? Math.ceil((new Date(cert.expiry_date) - new Date()) / 86400000) : null;
            const isExpired = dl !== null && dl < 0;
            const isSoon    = dl !== null && dl >= 0 && dl <= 30;
            return (
              <div key={cert.id} className={clsx(
                'p-3 rounded-xl border flex items-start gap-2',
                isExpired ? 'bg-red-500/8 border-red-500/25' :
                isSoon    ? 'bg-amber-500/8 border-amber-500/25' :
                'border-[var(--border)] bg-[var(--bg-card-hover)]'
              )}>
                {isExpired ? <FiAlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0"/> :
                 isSoon    ? <FiAlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0"/> :
                 <FiCheckCircle size={14} className="text-green-500 mt-0.5 shrink-0"/>}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{cert.cert_name}</p>
                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                    {cert.issuing_authority && <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>{cert.issuing_authority}</span>}
                    {cert.expiry_date && (
                      <span className={clsx('text-[10px] font-semibold',
                        isExpired ? 'text-red-400' : isSoon ? 'text-amber-500' : 'text-green-500')}>
                        {isExpired ? `Expired ${Math.abs(dl)}d ago` : isSoon ? `Expires in ${dl}d` : `Valid until ${cert.expiry_date}`}
                      </span>
                    )}
                    <Badge color={CERT_BADGE[cert.status]||'gray'}>{cert.status}</Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function Workers() {
  const { user }                          = useAuthStore();
  const [workers, setWorkers]             = useState([]);
  const [mines, setMines]                 = useState([]);
  const [contractors, setContractors]     = useState([]);
  const [stats, setStats]                 = useState(null);
  const [expiringAlerts, setExpiringAlerts] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [pagination, setPagination]       = useState({});
  const [page, setPage]                   = useState(1);

  const [search,        setSearch]        = useState('');
  const [mineFilter,    setMineFilter]    = useState(user?.mine_id || '');
  const [deptFilter,    setDeptFilter]    = useState('');
  const [statusFilter,  setStatusFilter]  = useState('active');
  const [trainFilter,   setTrainFilter]   = useState('');
  const [contractorF,   setContractorF]   = useState('');

  const [showForm,     setShowForm]       = useState(false);
  const [editWorker,   setEditWorker]     = useState(null);
  const [viewWorker,   setViewWorker]     = useState(null);
  const [showAlerts,   setShowAlerts]     = useState(false);

  const canWrite = ['admin','government_officer','mine_manager','inspector','safety_officer'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit:50 };
      if (mineFilter)   params.mine_id          = mineFilter;
      if (deptFilter)   params.department        = deptFilter;
      if (statusFilter) params.status            = statusFilter;
      if (trainFilter)  params.training_status   = trainFilter;
      if (contractorF)  params.contractor_id     = contractorF;
      if (search)       params.search            = search;

      const [wRes, sRes] = await Promise.all([
        workersApi.getAll(params),
        workersApi.getStats(mineFilter ? { mine_id: mineFilter } : {}),
      ]);
      setWorkers(wRes.data || []);
      setPagination(wRes.pagination || {});
      setStats(sRes.data);
    } catch { toast.error('Failed to load workers'); }
    finally { setLoading(false); }
  };

  const loadAlerts = async () => {
    try {
      const r = await workersApi.getExpiringCerts({ days:30, mine_id: mineFilter || undefined });
      setExpiringAlerts(r.data || []);
    } catch {}
  };

  useEffect(() => {
    load();
    loadAlerts();
    minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{});
    contractorsApi.getAll({ limit:100 }).then(r => setContractors(r.data||[])).catch(()=>{});
  }, [page, mineFilter, deptFilter, statusFilter, trainFilter, contractorF, search]);

  const departments = [...new Set(workers.map(w => w.department).filter(Boolean))].sort();

  const handleSave = () => { setShowForm(false); setEditWorker(null); load(); loadAlerts(); };

  return (
    <div className="space-y-5">
      <BackButton className="mb-1"/>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiUsers className="text-amber-500"/> Workers Registry</h1>
          <p className="page-subtitle">Register workers once — they appear on every daily attendance screen automatically</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {expiringAlerts.length > 0 && (
            <button onClick={() => setShowAlerts(true)}
              className="btn-sm bg-amber-500/10 border border-amber-500/30 text-amber-500 hover:bg-amber-500/20 rounded-lg px-3 flex items-center gap-1.5 text-xs font-bold">
              <FiAlertTriangle size={13}/> {expiringAlerts.length} cert alerts
            </button>
          )}
          <button onClick={load} className="btn-outline btn-sm"><FiRefreshCw size={13}/> Refresh</button>
          {canWrite && <button onClick={() => { setEditWorker(null); setShowForm(true); }} className="btn-primary"><FiPlus size={15}/> Add Worker</button>}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatChip label="Total Workers" value={stats.total}/>
          {(stats.by_status||[]).map(s => (
            <StatChip key={s.status} label={s.status} value={s.count}
              color={s.status==='active'?'text-green-600':s.status==='terminated'?'text-red-600':'text-amber-600'}/>
          ))}
          {stats.expiring_certs_30d > 0 && (
            <StatChip label="Certs expiring (30d)" value={stats.expiring_certs_30d} color="text-amber-500"/>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <div className="form-group mb-0 relative">
          <label className="label">Search</label>
          <div className="relative">
            <FiSearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Name / ID / Phone" className="input pl-7 w-52"/>
          </div>
        </div>
        <div className="form-group mb-0">
          <label className="label">Mine</label>
          <select value={mineFilter} onChange={e => { setMineFilter(e.target.value); setPage(1); }} className="select w-44">
            <option value="">All Mines</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Department</label>
          <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }} className="select w-36">
            <option value="">All</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Contractor</label>
          <select value={contractorF} onChange={e => { setContractorF(e.target.value); setPage(1); }} className="select w-40">
            <option value="">All</option>
            {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Training</label>
          <select value={trainFilter} onChange={e => { setTrainFilter(e.target.value); setPage(1); }} className="select w-36">
            <option value="">All</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Status</label>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="select w-32">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="transferred">Transferred</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? <PageLoader/> : workers.length === 0 ? (
        <EmptyState icon={FiUsers} title="No workers registered"
          description={search ? `No workers match "${search}"` : 'Register workers to begin marking daily attendance'}
          action={canWrite && <button onClick={() => { setEditWorker(null); setShowForm(true); }} className="btn-primary"><FiPlus size={14}/> Register First Worker</button>}/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Worker ID</th><th>Name</th><th>Mine / Contractor</th>
                <th>Department</th><th>Shift</th>
                <th>Training</th><th>Certs</th>
                <th>Att. 30d</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map(w => {
                const att30 = parseInt(w.present_days_30||0);
                const total30 = 30;
                const pct = Math.round((att30/total30)*100);
                return (
                  <tr key={w.id}>
                    <td><span className="font-mono text-xs font-bold text-amber-600">{w.worker_code}</span></td>
                    <td>
                      <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{w.full_name}</p>
                      <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{w.designation}</p>
                      {w.contractor_name && <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{w.contractor_name}</p>}
                    </td>
                    <td>
                      <p className="text-xs" style={{ color:'var(--text-secondary)' }}>{w.mine_name}</p>
                    </td>
                    <td><span className="text-xs" style={{ color:'var(--text-secondary)' }}>{w.department}</span></td>
                    <td><span className="text-xs capitalize" style={{ color:'var(--text-muted)' }}>{w.shift}</span></td>
                    <td>
                      <Badge color={TRAIN_CLR[w.training_status]||'gray'}>
                        {(w.training_status||'—').replace('_',' ')}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {parseInt(w.expired_certs||0) > 0
                          ? <span className="text-xs font-bold text-red-500 flex items-center gap-0.5"><FiAlertTriangle size={10}/>{w.expired_certs} exp.</span>
                          : <span className="text-xs text-green-500 flex items-center gap-0.5"><FiAward size={10}/>{w.cert_count||0}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={clsx('text-xs font-bold',
                        pct>=80?'text-green-600':pct>=50?'text-amber-600':'text-red-600')}>
                        {att30}d ({pct}%)
                      </span>
                    </td>
                    <td><Badge color={STATUS_CLR[w.status]||'gray'}>{w.status}</Badge></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setViewWorker(w.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-600 hover:bg-amber-50 transition-colors" title="View profile">
                          <FiEye size={14}/>
                        </button>
                        {canWrite && (
                          <button onClick={() => { setEditWorker(w); setShowForm(true); }}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                            <FiEdit2 size={14}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 p-3">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="btn-outline btn-sm">Prev</button>
              <span className="text-xs self-center" style={{ color:'var(--text-muted)' }}>Page {page} of {pagination.pages} ({pagination.total} workers)</span>
              <button disabled={page>=pagination.pages} onClick={() => setPage(p=>p+1)} className="btn-outline btn-sm">Next</button>
            </div>
          )}
        </div>
      )}

      {/* Register / Edit modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditWorker(null); }}
        title={editWorker ? 'Edit Worker Profile' : 'Register New Worker'} size="lg">
        <WorkerForm mines={mines} contractors={contractors} worker={editWorker} onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditWorker(null); }}/>
      </Modal>

      {/* Profile view modal */}
      <Modal isOpen={!!viewWorker} onClose={() => setViewWorker(null)} title="Worker Profile" size="lg">
        {viewWorker && (
          <WorkerProfile workerId={viewWorker} canEdit={canWrite}
            onEdit={w => { setViewWorker(null); setEditWorker(w); setShowForm(true); }}/>
        )}
      </Modal>

      {/* Expiring certs alert modal */}
      <Modal isOpen={showAlerts} onClose={() => setShowAlerts(false)} title="Expiring Certifications (30 days)" size="lg">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {expiringAlerts.map((a, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-amber-500/8 border border-amber-500/25">
              <div>
                <p className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{a.full_name} <span className="text-xs font-mono text-amber-600">{a.worker_code}</span></p>
                <p className="text-xs" style={{ color:'var(--text-muted)' }}>{a.cert_name} · {a.mine_name} · {a.department}</p>
              </div>
              <Badge color={a.days_left<=7?'red':'yellow'}>{a.days_left}d left</Badge>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
