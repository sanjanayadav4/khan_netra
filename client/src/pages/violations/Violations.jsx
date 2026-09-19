import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import { Link, useSearchParams } from 'react-router-dom';
import { FiPlus, FiSearch, FiAlertOctagon, FiEye, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { violationsApi, minesApi } from '../../services/api';
import { formatDate, formatCurrency } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import ViolationForm from './ViolationForm';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const SEV  = { critical:'red', high:'yellow', medium:'blue', low:'green' };
const STAT = { open:'red', under_review:'yellow', action_taken:'blue', closed:'green', appealed:'purple' };

const STATUS_FILTERS = [
  { label:'All',          value:'' },
  { label:'Open',         value:'open' },
  { label:'Under Review', value:'under_review' },
  { label:'Action Taken', value:'action_taken' },
  { label:'Closed',       value:'closed' },
];

export default function Violations() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [violations, setViolations] = useState([]);
  const [mines,      setMines]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [filters,    setFilters]    = useState({ status:'', severity:'', mine_id: searchParams.get('mine_id')||'' });
  const [showForm,   setShowForm]   = useState(false);
  const [editItem,   setEditItem]   = useState(null);
  const [viewItem,   setViewItem]   = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);
  const [pagination, setPagination] = useState({});
  const [page,       setPage]       = useState(1);

  const canCreate = ['admin','government_officer','inspector','safety_officer'].includes(user?.role);
  const canDelete = user?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const r = await violationsApi.getAll({ search, ...filters, page, limit: 15 });
      setViolations(r.data); setPagination(r.pagination);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search, filters, page]);
  useEffect(() => { minesApi.getAll({ limit:100 }).then(r => setMines(r.data)).catch(()=>{}); }, []);

  const handleDelete = async () => {
    try { await violationsApi.delete(deleteId); toast.success('Deleted'); setDeleteId(null); load(); } catch {}
  };
  const updateStatus = async (id, status) => {
    try { await violationsApi.update(id, { status }); toast.success('Status updated'); setViewItem(null); load(); } catch {}
  };

  return (
    <div className="space-y-5"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiAlertOctagon className="text-amber-400"/> Violations</h1>
          <p className="page-subtitle">Track regulatory violations and corrective actions</p>
        </div>
        {canCreate && <button onClick={() => setShowForm(true)} className="btn-primary"><FiPlus size={15}/> Report Violation</button>}
      </div>

      {/* Status tabs */}
      <div className="tab-bar">
        {STATUS_FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilters(p => ({...p, status:f.value}))}
            className={clsx('tab-item', filters.status===f.value && 'active')}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card-sm flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal-600"/>
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search violationsâ€¦"/>
        </div>
        <select value={filters.severity} onChange={e => setFilters(p=>({...p, severity:e.target.value}))} className="select w-36">
          <option value="">All Severity</option>
          {['critical','high','medium','low'].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.mine_id} onChange={e => setFilters(p=>({...p, mine_id:e.target.value}))} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {loading ? <PageLoader/> : violations.length===0 ? (
        <EmptyState icon={FiAlertOctagon} title="No violations found" message="No violations match your current filters."/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Violation #</th><th>Mine</th><th>Type / Category</th><th>Severity</th><th>Status</th><th>Fine</th><th>Detected</th><th>Actions</th></tr></thead>
            <tbody>
              {violations.map(v => (
                <tr key={v.id}>
                  <td><span className="font-mono text-xs font-bold text-amber-400">{v.violation_number}</span></td>
                  <td>
                    <p className="font-semibold text-coal-200 text-sm">{v.mine_name}</p>
                    <p className="text-[11px] text-coal-600">{v.mine_state}</p>
                  </td>
                  <td>
                    <p className="text-sm font-medium text-coal-300">{v.type}</p>
                    <p className="text-[11px] text-coal-600">{v.category}</p>
                  </td>
                  <td><Badge color={SEV[v.severity]}>{v.severity}</Badge></td>
                  <td><Badge color={STAT[v.status]} dot>{v.status.replace('_',' ')}</Badge></td>
                  <td><span className="text-sm font-bold text-coal-300">{formatCurrency(v.fine_amount)}</span></td>
                  <td><span className="text-xs text-coal-600">{formatDate(v.detected_date)}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setViewItem(v)} className="p-1.5 rounded-lg text-coal-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><FiEye size={14}/></button>
                      {canCreate && v.status!=='closed' && <button onClick={() => { setEditItem(v); setShowForm(true); }} className="p-1.5 rounded-lg text-coal-600 hover:text-info-400 hover:bg-info-500/10 transition-colors"><FiEdit2 size={14}/></button>}
                      {canDelete && <button onClick={() => setDeleteId(v.id)} className="p-1.5 rounded-lg text-coal-600 hover:text-danger-400 hover:bg-danger-600/10 transition-colors"><FiTrash2 size={14}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-coal-600">{pagination.total} total violations</p>
          <div className="flex gap-1.5">
            {Array.from({ length: pagination.pages }, (_,i)=>i+1).map(p=>(
              <button key={p} onClick={() => setPage(p)}
                className={clsx('w-8 h-8 rounded-lg text-xs font-bold', p===page?'bg-amber-500 text-coal-950':'bg-coal-800 border border-coal-700 text-coal-500 hover:text-coal-200')}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Violation ${viewItem?.violation_number}`} size="md">
        {viewItem && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Badge color={SEV[viewItem.severity]}>{viewItem.severity}</Badge>
              <Badge color={STAT[viewItem.status]}>{viewItem.status.replace('_',' ')}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[['Mine',viewItem.mine_name],['Category',viewItem.category],['Type',viewItem.type],['Fine',formatCurrency(viewItem.fine_amount)],['Detected',formatDate(viewItem.detected_date)],['Regulation',viewItem.regulation_reference||'â€”']].map(([k,v])=>(
                <div key={k}>
                  <p className="text-[10px] text-coal-600 uppercase tracking-widest mb-0.5">{k}</p>
                  <p className="font-semibold text-coal-200">{v}</p>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-coal-800/60 border border-coal-700/40">
              <p className="text-[10px] text-coal-600 uppercase tracking-widest mb-1">Description</p>
              <p className="text-sm text-coal-300 leading-relaxed">{viewItem.description}</p>
            </div>
            {viewItem.corrective_action && (
              <div className="p-3 rounded-xl bg-success-600/10 border border-success-500/20">
                <p className="text-[10px] text-success-500 uppercase tracking-widest mb-1">Corrective Action</p>
                <p className="text-sm text-success-300">{viewItem.corrective_action}</p>
              </div>
            )}
            {viewItem.status !== 'closed' && canCreate && (
              <div className="flex gap-2 pt-2 border-t border-coal-700/50">
                {viewItem.status==='open' && <button onClick={() => updateStatus(viewItem.id,'under_review')} className="btn-outline btn-sm">Mark Under Review</button>}
                {viewItem.status==='under_review' && <button onClick={() => updateStatus(viewItem.id,'action_taken')} className="btn-primary btn-sm">Mark Action Taken</button>}
                {viewItem.status==='action_taken' && <button onClick={() => updateStatus(viewItem.id,'closed')} className="btn-success btn-sm">Close Violation</button>}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} title={editItem?'Edit Violation':'Report New Violation'} size="lg">
        <ViolationForm violation={editItem} mines={mines} onSave={() => { setShowForm(false); setEditItem(null); load(); }} onCancel={() => { setShowForm(false); setEditItem(null); }}/>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Delete Violation" message="Are you sure? This cannot be undone." confirmText="Delete" danger/>
    </div>
  );
}
