import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import { useSearchParams } from 'react-router-dom';
import { FiPlus, FiAlertTriangle, FiEye, FiEdit2 } from 'react-icons/fi';
import { incidentsApi, minesApi } from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import IncidentForm from './IncidentForm';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

const SEV = { fatal:'red', serious:'yellow', minor:'blue', near_miss:'gray' };
const SEV_TABS = ['','fatal','serious','minor','near_miss'];

export default function Incidents() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [incidents,  setIncidents]  = useState([]);
  const [mines,      setMines]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filters,    setFilters]    = useState({ severity:'', status:'', mine_id: searchParams.get('mine_id')||'' });
  const [showForm,   setShowForm]   = useState(false);
  const [viewItem,   setViewItem]   = useState(null);
  const [editItem,   setEditItem]   = useState(null);
  const [pagination, setPagination] = useState({});
  const [page,       setPage]       = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const r = await incidentsApi.getAll({ ...filters, page, limit: 15 });
      setIncidents(r.data); setPagination(r.pagination);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filters, page]);
  useEffect(() => { minesApi.getAll({ limit:100 }).then(r=>setMines(r.data)).catch(()=>{}); }, []);

  return (
    <div className="space-y-5"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiAlertTriangle className="text-amber-400"/> Incidents & Safety</h1>
          <p className="page-subtitle">Monitor accidents, near-misses and safety events</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><FiPlus size={15}/> Report Incident</button>
      </div>

      {/* Severity tabs */}
      <div className="tab-bar">
        {SEV_TABS.map(s => (
          <button key={s} onClick={() => setFilters(p=>({...p, severity:s}))}
            className={clsx('tab-item capitalize', filters.severity===s && 'active')}>
            {s==='' ? 'All' : s.replace('_',' ')}
          </button>
        ))}
      </div>

      <div className="card-sm flex flex-wrap gap-3">
        <select value={filters.mine_id} onChange={e => setFilters(p=>({...p, mine_id:e.target.value}))} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(p=>({...p, status:e.target.value}))} className="select w-48">
          <option value="">All Status</option>
          {['open','under_investigation','closed','reported_to_dgms'].map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {loading ? <PageLoader/> : incidents.length===0 ? (
        <EmptyState icon={FiAlertTriangle} title="No incidents found"/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Incident #</th><th>Mine</th><th>Type</th><th>Severity</th><th>Casualties</th><th>DGMS</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {incidents.map(i => (
                <tr key={i.id}>
                  <td><span className="font-mono text-xs font-bold text-amber-400">{i.incident_number}</span></td>
                  <td><p className="font-semibold text-coal-200 text-sm">{i.mine_name}</p><p className="text-[11px] text-coal-600">{i.state}</p></td>
                  <td><span className="text-sm text-coal-300">{i.type}</span></td>
                  <td><Badge color={SEV[i.severity]}>{i.severity.replace('_',' ')}</Badge></td>
                  <td>
                    <span className={clsx('text-sm font-bold', parseInt(i.fatalities_count)>0?'text-danger-400':'text-coal-300')}>
                      {i.injuries_count} inj Â· {i.fatalities_count} fatal
                    </span>
                  </td>
                  <td><Badge color={i.dgms_notified?'green':'gray'}>{i.dgms_notified?'Yes':'No'}</Badge></td>
                  <td><Badge color={i.status==='closed'?'green':i.status==='open'?'red':'yellow'} dot>{i.status.replace(/_/g,' ')}</Badge></td>
                  <td><span className="text-xs text-coal-600">{formatDate(i.incident_date)}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setViewItem(i)} className="p-1.5 rounded-lg text-coal-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><FiEye size={14}/></button>
                      {i.status!=='closed' && <button onClick={() => { setEditItem(i); setShowForm(true); }} className="p-1.5 rounded-lg text-coal-600 hover:text-info-400 hover:bg-info-500/10 transition-colors"><FiEdit2 size={14}/></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Incident ${viewItem?.incident_number}`} size="md">
        {viewItem && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Badge color={SEV[viewItem.severity]}>{viewItem.severity}</Badge>
              <Badge color={viewItem.status==='closed'?'green':'red'} dot>{viewItem.status.replace(/_/g,' ')}</Badge>
              {viewItem.dgms_notified && <Badge color="blue">DGMS Notified</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[['Mine',viewItem.mine_name],['Type',viewItem.type],['Category',viewItem.category],
                ['Date & Time',formatDateTime(viewItem.incident_date)],
                ['Location',viewItem.location_in_mine||'â€”'],
                ['Casualties', `${viewItem.injuries_count} Injured Â· ${viewItem.fatalities_count} Fatal`]
              ].map(([k,v])=>(
                <div key={k}>
                  <p className="text-[10px] text-coal-600 uppercase tracking-widest mb-0.5">{k}</p>
                  <p className={clsx('font-semibold', k==='Casualties' && parseInt(viewItem.fatalities_count)>0 ? 'text-danger-400' : 'text-coal-200')}>{v}</p>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-coal-800/60 border border-coal-700/40">
              <p className="text-[10px] text-coal-600 uppercase tracking-widest mb-1">Description</p>
              <p className="text-sm text-coal-300 leading-relaxed">{viewItem.description}</p>
            </div>
            {viewItem.root_cause && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20"><p className="text-[10px] text-amber-500 uppercase tracking-widest mb-1">Root Cause</p><p className="text-sm text-amber-300">{viewItem.root_cause}</p></div>}
            {viewItem.corrective_measures && <div className="p-3 rounded-xl bg-success-600/10 border border-success-500/20"><p className="text-[10px] text-success-500 uppercase tracking-widest mb-1">Corrective Measures</p><p className="text-sm text-success-300">{viewItem.corrective_measures}</p></div>}
          </div>
        )}
      </Modal>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} title={editItem?'Update Incident':'Report Incident'} size="lg">
        <IncidentForm incident={editItem} mines={mines} onSave={() => { setShowForm(false); setEditItem(null); load(); }} onCancel={() => { setShowForm(false); setEditItem(null); }}/>
      </Modal>
    </div>
  );
}
