import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import { FiClock, FiPlus, FiAlertTriangle, FiCheckCircle, FiEdit2 } from 'react-icons/fi';
import { deadlinesApi, minesApi } from '../../services/api';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useForm } from 'react-hook-form';
import useAuthStore from '../../store/authStore';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_COLOR = { pending:'yellow', in_progress:'blue', completed:'green', overdue:'red', cancelled:'gray' };
const ESC_LABEL = ['None','Level 1','Level 2','Level 3 â€” Critical'];

export default function Deadlines() {
  const { user } = useAuthStore();
  const [deadlines,  setDeadlines]  = useState([]);
  const [overdue,    setOverdue]    = useState([]);
  const [upcoming,   setUpcoming]   = useState([]);
  const [mines,      setMines]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [statusF,    setStatusF]    = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [editItem,   setEditItem]   = useState(null);
  const [page,       setPage]       = useState(1);
  const [pagination, setPagination] = useState({});

  const canCreate = ['admin','government_officer','inspector','safety_officer'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const [all, ov, up] = await Promise.all([
        deadlinesApi.getAll({ status: statusF, page, limit: 20 }),
        deadlinesApi.getOverdue(),
        deadlinesApi.getUpcoming({ days: 30 }),
      ]);
      setDeadlines(all.data || []);
      setPagination(all.pagination || {});
      setOverdue(ov.data || []);
      setUpcoming(up.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusF, page]);
  useEffect(() => { minesApi.getAll({ limit:100 }).then(r=>setMines(r.data||[])).catch(()=>{}); }, []);

  const markComplete = async (id) => {
    try { await deadlinesApi.update(id, { status:'completed' }); toast.success('Marked complete'); load(); } catch {}
  };

  return (
    <div className="space-y-5"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiClock className="text-amber-400"/> Compliance Deadlines</h1>
          <p className="page-subtitle">Track deadlines, escalations and reminders for compliance actions</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary"><FiPlus size={15}/> Add Deadline</button>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-danger p-4">
          <p className="text-[11px] text-danger-500 uppercase tracking-widest mb-1">Overdue</p>
          <p className="text-3xl font-black text-danger-400">{overdue.length}</p>
          <p className="text-xs text-coal-600 mt-1">Require immediate escalation</p>
        </div>
        <div className="card p-4 border-amber-500/25">
          <p className="text-[11px] text-amber-500 uppercase tracking-widest mb-1">Due in 30 Days</p>
          <p className="text-3xl font-black text-amber-400">{upcoming.length}</p>
          <p className="text-xs text-coal-600 mt-1">Action required soon</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] text-coal-500 uppercase tracking-widest mb-1">All Active</p>
          <p className="text-3xl font-black text-coal-200">{pagination.total || deadlines.length}</p>
          <p className="text-xs text-coal-600 mt-1">Total tracked</p>
        </div>
      </div>

      {/* Overdue alert strip */}
      {overdue.length > 0 && (
        <div className="p-4 rounded-xl bg-danger-600/10 border border-danger-500/25 space-y-2">
          <p className="text-sm font-bold text-danger-300 flex items-center gap-2"><FiAlertTriangle size={14}/> {overdue.length} Overdue Deadline{overdue.length>1?'s':''}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {overdue.map(d => (
              <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-danger-600/10 border border-danger-500/20">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-danger-300 truncate">{d.title}</p>
                  <p className="text-[11px] text-danger-500">{d.mine_name} Â· {d.days_overdue}d overdue Â· Esc: {ESC_LABEL[Math.min(d.escalation_level,3)]}</p>
                </div>
                <button onClick={() => markComplete(d.id)} className="btn-success btn-xs shrink-0 ml-2">Complete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming strip */}
      {upcoming.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/20 space-y-2">
          <p className="text-sm font-bold text-amber-300 flex items-center gap-2"><FiClock size={14}/> {upcoming.length} Coming up within 30 days</p>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(d => (
              <div key={d.id} className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                <span className="font-semibold text-amber-300">{d.days_remaining}d</span>
                <span className="text-coal-500 mx-1">Â·</span>
                <span className="text-coal-300">{d.title}</span>
                <span className="text-coal-600 ml-1">({d.mine_name})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="tab-bar">
        {[{v:'',l:'All'},{v:'pending',l:'Pending'},{v:'in_progress',l:'In Progress'},{v:'overdue',l:'Overdue'},{v:'completed',l:'Completed'}].map(f => (
          <button key={f.v} onClick={() => setStatusF(f.v)} className={clsx('tab-item', statusF===f.v && 'active')}>{f.l}</button>
        ))}
      </div>

      {loading ? <PageLoader/> : deadlines.length===0 ? (
        <EmptyState icon={FiClock} title="No deadlines found"
          action={canCreate && <button onClick={() => setShowForm(true)} className="btn-primary">Add Deadline</button>}/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Title</th><th>Mine</th><th>Deadline</th><th>Days Left</th><th>Responsible</th><th>Escalation</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {deadlines.map(d => {
                const days = d.days_remaining;
                const daysColor = days === null ? 'text-coal-500' : days < 0 ? 'text-danger-400 font-black' : days <= 7 ? 'text-danger-400 font-bold' : days <= 30 ? 'text-amber-400 font-semibold' : 'text-coal-400';
                return (
                  <tr key={d.id}>
                    <td>
                      <p className="font-semibold text-coal-200 text-sm">{d.title}</p>
                      {d.description && <p className="text-[11px] text-coal-600 truncate max-w-[200px]">{d.description}</p>}
                    </td>
                    <td><span className="text-sm text-coal-300">{d.mine_name}</span></td>
                    <td><span className="text-xs text-coal-400">{formatDate(d.deadline_date)}</span></td>
                    <td>
                      <span className={clsx('text-sm tabular-nums', daysColor)}>
                        {days === null ? 'â€”' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                      </span>
                    </td>
                    <td><span className="text-xs text-coal-400">{d.responsible_person||'â€”'}</span></td>
                    <td>
                      {d.escalation_level > 0 ? (
                        <Badge color={d.escalation_level>=2?'red':'yellow'}>{ESC_LABEL[Math.min(d.escalation_level,3)]}</Badge>
                      ) : <span className="text-xs text-coal-700">None</span>}
                    </td>
                    <td><Badge color={STATUS_COLOR[d.status]||'gray'} dot>{d.status}</Badge></td>
                    <td>
                      <div className="flex gap-1">
                        {d.status !== 'completed' && d.status !== 'cancelled' && (
                          <button onClick={() => markComplete(d.id)} className="p-1.5 rounded-lg text-coal-600 hover:text-success-400 hover:bg-success-600/10 transition-colors" title="Mark Complete"><FiCheckCircle size={14}/></button>
                        )}
                        {canCreate && (
                          <button onClick={() => { setEditItem(d); setShowForm(true); }} className="p-1.5 rounded-lg text-coal-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><FiEdit2 size={14}/></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} title={editItem?'Edit Deadline':'Add Compliance Deadline'} size="md">
        <DeadlineForm mines={mines} deadline={editItem} onSave={() => { setShowForm(false); setEditItem(null); load(); }} onCancel={() => { setShowForm(false); setEditItem(null); }}/>
      </Modal>
    </div>
  );
}

function DeadlineForm({ mines, deadline, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: deadline || {} });
  const onSubmit = async (data) => {
    try {
      if (deadline?.id) { await deadlinesApi.update(deadline.id, data); toast.success('Updated'); }
      else              { await deadlinesApi.create(data);               toast.success('Deadline added'); }
      onSave();
    } catch {}
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group"><label className="label">Mine *</label><select {...register('mine_id',{required:true})} className="select"><option value="">Select Mine</option>{mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="form-group"><label className="label">Deadline Date *</label><input type="date" {...register('deadline_date',{required:true})} className="input"/></div>
        <div className="form-group col-span-2"><label className="label">Title *</label><input {...register('title',{required:true})} className="input" placeholder="License Renewal, ETP Installationâ€¦"/></div>
        <div className="form-group col-span-2"><label className="label">Description</label><textarea {...register('description')} rows={2} className="input resize-none"/></div>
        <div className="form-group"><label className="label">Responsible Person</label><input {...register('responsible_person')} className="input" placeholder="Name or designation"/></div>
        {deadline && (
          <div className="form-group"><label className="label">Status</label><select {...register('status')} className="select">{['pending','in_progress','completed','cancelled'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-coal-700/50">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting?'Savingâ€¦':deadline?'Update':'Add Deadline'}</button>
      </div>
    </form>
  );
}
