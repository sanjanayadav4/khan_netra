import { useState, useEffect, useCallback } from 'react';
import BackButton from '../../components/ui/BackButton';
import { FiPlus, FiMapPin, FiSearch, FiEye, FiEdit2, FiMap, FiList, FiAlertTriangle } from 'react-icons/fi';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { fieldReportsApi, minesApi } from '../../services/api';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useForm } from 'react-hook-form';
import useAuthStore from '../../store/authStore';
import { formatDate, formatDateTime } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const mkIcon = (severity) => {
  const color = severity==='critical'?'#ef4444':severity==='high'?'#f59e0b':severity==='warning'?'#f97316':'#22c55e';
  return L.divIcon({ className:'', html:`<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px ${color}80"></div>`, iconSize:[14,14], iconAnchor:[7,7] });
};

const SEV_COLOR = { critical:'red', high:'yellow', warning:'orange', medium:'blue', low:'green', info:'gray' };
const TYPE_LIST = ['Safety Hazard','Environmental','Equipment','Compliance','Incident Near-Miss','Infrastructure','Other'];

export default function FieldReports() {
  const { user } = useAuthStore();
  const [reports,    setReports]    = useState([]);
  const [mapData,    setMapData]    = useState([]);
  const [mines,      setMines]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState('table');
  const [filters,    setFilters]    = useState({ severity:'', status:'', mine_id:'' });
  const [showForm,   setShowForm]   = useState(false);
  const [viewItem,   setViewItem]   = useState(null);
  const [pagination, setPagination] = useState({});
  const [page,       setPage]       = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([
        fieldReportsApi.getAll({ ...filters, page, limit: 15 }),
        fieldReportsApi.getMap(),
      ]);
      setReports(r.data || []);
      setMapData(m.data || []);
      setPagination(r.pagination || {});
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filters, page]);
  useEffect(() => { minesApi.getAll({ limit:100 }).then(r=>setMines(r.data||[])).catch(()=>{}); }, []);

  const updateStatus = async (id, status) => {
    try { await fieldReportsApi.update(id, { status }); toast.success('Status updated'); setViewItem(null); load(); } catch {}
  };

  return (
    <div className="space-y-5"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiMapPin className="text-amber-400"/> Field Reports</h1>
          <p className="page-subtitle">Geo-tagged, time-stamped field observations and safety reports</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-coal-800 border border-coal-700/60 rounded-xl p-1 gap-0.5">
            <button onClick={() => setView('table')} className={clsx('p-2 rounded-lg transition-all', view==='table'?'bg-amber-500/20 text-amber-400':'text-coal-600 hover:text-coal-300')}><FiList size={16}/></button>
            <button onClick={() => setView('map')}   className={clsx('p-2 rounded-lg transition-all', view==='map'  ?'bg-amber-500/20 text-amber-400':'text-coal-600 hover:text-coal-300')}><FiMap size={16}/></button>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary"><FiPlus size={15}/> Submit Report</button>
        </div>
      </div>

      {/* Severity tabs */}
      <div className="tab-bar">
        {['','critical','high','warning','medium','low'].map(s => (
          <button key={s} onClick={() => setFilters(p=>({...p, severity:s}))}
            className={clsx('tab-item capitalize', filters.severity===s && 'active')}>
            {s||'All'}
          </button>
        ))}
      </div>

      <div className="card-sm flex flex-wrap gap-3">
        <select value={filters.mine_id} onChange={e => setFilters(p=>({...p,mine_id:e.target.value}))} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(p=>({...p,status:e.target.value}))} className="select w-40">
          <option value="">All Status</option>
          {['open','in_progress','resolved'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
      </div>

      {/* Map view */}
      {view==='map' && (
        <div className="card p-0 overflow-hidden border border-coal-700/60" style={{height:'480px'}}>
          <MapContainer center={[22.5,82.5]} zoom={5} style={{height:'100%',width:'100%'}}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='Â© OpenStreetMap'/>
            {mapData.filter(r=>r.latitude&&r.longitude).map(r => (
              <Marker key={r.id} position={[r.latitude,r.longitude]} icon={mkIcon(r.severity)}>
                <Popup maxWidth={240}>
                  <div style={{fontFamily:'Inter,sans-serif',fontSize:'12px'}}>
                    <p style={{fontWeight:800,color:'#f59e0b',marginBottom:4}}>{r.report_number}</p>
                    <p style={{fontWeight:600,marginBottom:2}}>{r.title}</p>
                    <p style={{color:'#6c757d',marginBottom:4}}>{r.mine_name} Â· {r.location_name}</p>
                    <span style={{padding:'2px 8px',borderRadius:999,fontSize:'10px',fontWeight:700,
                      background:r.severity==='critical'?'rgba(239,68,68,.2)':r.severity==='high'?'rgba(245,158,11,.2)':'rgba(34,197,94,.2)',
                      color:r.severity==='critical'?'#ef4444':r.severity==='high'?'#f59e0b':'#22c55e'}}>
                      {r.severity?.toUpperCase()}
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* Table view */}
      {view==='table' && (
        loading ? <PageLoader/> : reports.length===0 ? (
          <EmptyState icon={FiMapPin} title="No field reports" action={<button onClick={() => setShowForm(true)} className="btn-primary">Submit First Report</button>}/>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Report #</th><th>Mine / Location</th><th>Type</th><th>Severity</th><th>Status</th><th>Reporter</th><th>Date</th><th>GPS</th><th></th></tr></thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td><span className="font-mono text-xs font-bold text-amber-400">{r.report_number}</span></td>
                    <td>
                      <p className="font-semibold text-coal-200 text-sm">{r.mine_name}</p>
                      <p className="text-[11px] text-coal-600">{r.location_name||'â€”'}</p>
                    </td>
                    <td><span className="text-sm text-coal-300">{r.report_type}</span></td>
                    <td><Badge color={SEV_COLOR[r.severity]||'gray'}>{r.severity}</Badge></td>
                    <td><Badge color={r.status==='resolved'?'green':r.status==='in_progress'?'yellow':'red'} dot>{r.status?.replace('_',' ')}</Badge></td>
                    <td><span className="text-xs text-coal-400">{r.reporter_name||'â€”'}</span></td>
                    <td><span className="text-xs text-coal-600">{formatDate(r.created_at)}</span></td>
                    <td>
                      {r.latitude ? (
                        <span className="text-[10px] text-success-400 font-mono">ðŸ“ {parseFloat(r.latitude).toFixed(4)}</span>
                      ) : <span className="text-[10px] text-coal-700">No GPS</span>}
                    </td>
                    <td>
                      <button onClick={() => setViewItem(r)} className="p-1.5 rounded-lg text-coal-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><FiEye size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* View modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Report ${viewItem?.report_number}`} size="md">
        {viewItem && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Badge color={SEV_COLOR[viewItem.severity]||'gray'}>{viewItem.severity}</Badge>
              <Badge color={viewItem.status==='resolved'?'green':viewItem.status==='in_progress'?'yellow':'red'} dot>{viewItem.status?.replace('_',' ')}</Badge>
            </div>
            <h3 className="font-bold text-coal-100 text-base">{viewItem.title}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Mine',viewItem.mine_name],['Type',viewItem.report_type],['Location',viewItem.location_name||'â€”'],
                ['Reporter',viewItem.reporter_name||'â€”'],['Date',formatDateTime(viewItem.created_at)],
                ['GPS', viewItem.latitude ? `${parseFloat(viewItem.latitude).toFixed(5)}, ${parseFloat(viewItem.longitude).toFixed(5)}` : 'Not recorded']
              ].map(([k,v]) => (
                <div key={k}><p className="text-[10px] text-coal-600 uppercase tracking-widest mb-0.5">{k}</p><p className="font-semibold text-coal-200 text-sm">{v}</p></div>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-coal-800/60 border border-coal-700/40">
              <p className="text-xs text-coal-500 mb-1">Description</p>
              <p className="text-sm text-coal-300 leading-relaxed">{viewItem.description}</p>
            </div>
            {viewItem.status !== 'resolved' && (
              <div className="flex gap-2 pt-2 border-t border-coal-700/50">
                {viewItem.status==='open' && <button onClick={() => updateStatus(viewItem.id,'in_progress')} className="btn-outline btn-sm">Mark In Progress</button>}
                <button onClick={() => updateStatus(viewItem.id,'resolved')} className="btn-success btn-sm">Mark Resolved</button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Submit form modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Submit Field Report" size="lg">
        <FieldReportForm mines={mines} onSave={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)}/>
      </Modal>
    </div>
  );
}

function FieldReportForm({ mines, onSave, onCancel }) {
  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm({
    defaultValues: { severity: 'info' }
  });

  const getGPS = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not available');
    navigator.geolocation.getCurrentPosition(
      pos => { setValue('latitude', pos.coords.latitude.toFixed(6)); setValue('longitude', pos.coords.longitude.toFixed(6)); toast.success('GPS location captured'); },
      () => toast.error('Could not get location')
    );
  };

  const onSubmit = async (data) => {
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k,v]) => v !== undefined && v !== '' && fd.append(k, v));
      await fieldReportsApi.create(fd);
      toast.success('Field report submitted');
      onSave();
    } catch {}
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group"><label className="label">Mine *</label><select {...register('mine_id',{required:true})} className="select"><option value="">Select Mine</option>{mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="form-group"><label className="label">Report Type *</label><select {...register('report_type',{required:true})} className="select"><option value="">Select Type</option>{TYPE_LIST.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div className="form-group col-span-2"><label className="label">Title *</label><input {...register('title',{required:true})} className="input" placeholder="Brief description of the observation"/></div>
        <div className="form-group"><label className="label">Severity *</label><select {...register('severity',{required:true})} className="select">{['critical','high','warning','medium','low','info'].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        <div className="form-group"><label className="label">Location Name</label><input {...register('location_name')} className="input" placeholder="Level 3, Gallery Câ€¦"/></div>
        <div className="form-group col-span-2"><label className="label">Description *</label><textarea {...register('description',{required:true})} rows={3} className="input resize-none" placeholder="Detailed description of what was observedâ€¦"/></div>
        <div className="form-group"><label className="label">Latitude</label><input type="number" step="0.000001" {...register('latitude')} className="input" placeholder="Auto-filled"/></div>
        <div className="form-group"><label className="label">Longitude <button type="button" onClick={getGPS} className="ml-2 text-[10px] text-amber-400 hover:underline">ðŸ“ Use My Location</button></label><input type="number" step="0.000001" {...register('longitude')} className="input" placeholder="Auto-filled"/></div>
        <div className="form-group col-span-2 flex items-center gap-3">
          <input type="checkbox" id="follow_up" {...register('follow_up_required')} className="w-4 h-4 accent-amber-500"/>
          <label htmlFor="follow_up" className="text-sm text-coal-300">Follow-up required</label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-coal-700/50">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting?'Submittingâ€¦':'Submit Report'}</button>
      </div>
    </form>
  );
}
