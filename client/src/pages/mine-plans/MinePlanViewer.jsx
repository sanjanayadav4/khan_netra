/**
 * KhanNetra -- Mine Plan Interactive Viewer
 * Zoom/pan, layer annotations, offline cache, emergency info tab.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FiArrowLeft, FiLayers, FiAlertOctagon, FiAlertTriangle,
  FiDownload, FiPlus, FiEye, FiEyeOff, FiCheckCircle,
  FiX, FiClock, FiZoomIn, FiZoomOut, FiMaximize2,
  FiWifiOff, FiRefreshCw, FiPhone, FiShield,
  FiLock, FiUserCheck, FiUsers,
} from 'react-icons/fi';
const FiMap = FiLayers;

import { useForm } from 'react-hook-form';
import { minePlansApi } from '../../services/api';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import BackButton from '../../components/ui/BackButton';

const LAYER_TYPES = {
  tunnel:              { label:'Tunnel / Roadway',   color:'#94a3b8', icon:'-',  emergency:false },
  shaft:               { label:'Shaft',              color:'#f59e0b', icon:'^',  emergency:true  },
  entry_exit:          { label:'Entry / Exit',       color:'#22c55e', icon:'<>', emergency:true  },
  working_area:        { label:'Working Area',       color:'#3b82f6', icon:'W',  emergency:false },
  ventilation_intake:  { label:'Ventilation Intake', color:'#06b6d4', icon:'V',  emergency:false },
  ventilation_return:  { label:'Ventilation Return', color:'#8b5cf6', icon:'V',  emergency:false },
  emergency_escape:    { label:'Emergency Escape',   color:'#ef4444', icon:'!',  emergency:true  },
  electrical:          { label:'Electrical',         color:'#fbbf24', icon:'E',  emergency:false },
  water_drainage:      { label:'Water/Drainage',     color:'#0ea5e9', icon:'W',  emergency:false },
  fire_risk:           { label:'Fire Risk Zone',     color:'#dc2626', icon:'F',  emergency:true  },
  hazard_zone:         { label:'Hazard Zone',        color:'#f97316', icon:'!',  emergency:true  },
  inspection_point:    { label:'Inspection Point',   color:'#a3e635', icon:'I',  emergency:false },
  safety_observation:  { label:'Safety Observation', color:'#60a5fa', icon:'S',  emergency:false },
  incident_location:   { label:'Incident Location',  color:'#f43f5e', icon:'!',  emergency:false },
  assembly_point:      { label:'Assembly Point',     color:'#34d399', icon:'A',  emergency:true  },
  other:               { label:'Other',              color:'#94a3b8', icon:'o',  emergency:false },
};

const SEV_COLOR = {
  critical:'#ef4444', fatal:'#ef4444',
  high:'#f59e0b', serious:'#f59e0b',
  medium:'#3b82f6', minor:'#22c55e',
};

/* ---- Offline storage ---- */
const IDB_NAME = 'khannetra_mine_plans';
const IDB_STORE = 'offline_plans';
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE))
        db.createObjectStore(IDB_STORE, { keyPath:'id' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
async function saveOfflinePlan(plan, layers, versions) {
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  return new Promise((res, rej) => {
    const r = store.put({ id:plan.id, plan, layers, versions, saved_at:new Date().toISOString() });
    r.onsuccess = res; r.onerror = rej;
  });
}
async function getOfflinePlan(id) {
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readonly');
  const store = tx.objectStore(IDB_STORE);
  return new Promise((res, rej) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result || null); r.onerror = rej;
  });
}

/* ---- Info Panel ---- */
function InfoPanel({ item, onClose }) {
  if (!item) return null;
  const cfg = LAYER_TYPES[item.layer_type] || LAYER_TYPES.other;
  return (
    <div className="absolute top-3 right-3 w-72 bg-white border border-coal-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-coal-50 border-b border-coal-200">
        <span className="text-sm font-bold text-coal-800">{item.label || cfg.label || item.layer_type}</span>
        <button onClick={onClose} className="p-1 rounded-lg text-coal-400 hover:text-coal-700"><FiX size={14}/></button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        {item.description && <p className="text-coal-600 leading-relaxed">{item.description}</p>}
        {cfg.emergency && (
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-danger-50 border border-danger-200">
            <FiShield size={11} className="text-danger-600 shrink-0"/>
            <span className="text-danger-700 font-semibold">Emergency / Safety Critical</span>
          </div>
        )}
        <p className="text-coal-400">Added: {formatDate(item.created_at)}</p>
      </div>
    </div>
  );
}

/* ---- Zoom/Pan hook ---- */
function useZoomPan() {
  const [scale, setScale]         = useState(1);
  const [translate, setTranslate] = useState({ x:0, y:0 });
  const dragging = useRef(false);
  const lastPos  = useRef({ x:0, y:0 });

  const zoom = useCallback((delta) => {
    setScale(prev => {
      const next = Math.min(5, Math.max(0.5, prev + delta));
      if (next <= 1) setTranslate({ x:0, y:0 });
      return next;
    });
  }, []);

  const zoomIn  = () => zoom(0.4);
  const zoomOut = () => zoom(-0.4);
  const reset   = () => { setScale(1); setTranslate({ x:0, y:0 }); };

  const onWheel     = useCallback(e => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.25 : -0.25); }, [zoom]);
  const onMouseDown = useCallback(e => { if (e.button !== 0) return; dragging.current=true; lastPos.current={x:e.clientX,y:e.clientY}; }, []);
  const onMouseMove = useCallback(e => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x:e.clientX, y:e.clientY };
    setTranslate(prev => ({
      x: Math.max(-(scale-1)*200, Math.min((scale-1)*200, prev.x+dx)),
      y: Math.max(-(scale-1)*200, Math.min((scale-1)*200, prev.y+dy)),
    }));
  }, [scale]);
  const onMouseUp = useCallback(() => { dragging.current=false; }, []);

  const style = {
    transform: `translate(${translate.x}px,${translate.y}px) scale(${scale})`,
    transformOrigin: 'center center',
    transition: dragging.current ? 'none' : 'transform 0.1s ease',
    cursor: scale > 1 ? 'grab' : 'crosshair',
    userSelect: 'none',
  };

  return { scale, style, zoomIn, zoomOut, reset, onWheel, onMouseDown, onMouseMove, onMouseUp };
}

/* ---- Add Layer Form ---- */
function AddLayerForm({ planId, point, onSave, onCancel }) {
  const { register, handleSubmit, watch, formState:{ isSubmitting } } = useForm({
    defaultValues: { layer_type:'tunnel', color:'#f59e0b', opacity:0.6 },
  });
  const onSubmit = async (data) => {
    try {
      const geometry = JSON.stringify({ type:'point', coordinates:{ x:point.x, y:point.y } });
      await minePlansApi.saveLayer(planId, { ...data, geometry });
      toast.success('Layer annotation added');
      onSave();
    } catch { toast.error('Failed to add layer'); }
  };
  const selectedType = watch('layer_type');
  const cfg = LAYER_TYPES[selectedType] || LAYER_TYPES.other;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="p-3 rounded-xl bg-coal-50 border border-coal-200 text-xs text-coal-600">
        Annotation point: ({point.x.toFixed(4)}, {point.y.toFixed(4)}) -- normalised 0-1
      </div>
      {cfg.emergency && (
        <div className="p-2.5 rounded-xl bg-danger-50 border border-danger-200 text-[10px] text-danger-700 flex items-center gap-1.5">
          <FiShield size={11}/> Emergency/safety-critical layer -- appears in Emergency Info tab.
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group col-span-full">
          <label className="label">Layer Type *</label>
          <select {...register('layer_type', { required:true })} className="select">
            {Object.entries(LAYER_TYPES).map(([k,v]) => (
              <option key={k} value={k}>{v.label}{v.emergency ? ' (Emergency)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="form-group col-span-full">
          <label className="label">Label</label>
          <input {...register('label')} className="input" placeholder={`e.g. ${cfg.label} -- Gallery C`}/>
        </div>
        <div className="form-group col-span-full">
          <label className="label">Description</label>
          <textarea {...register('description')} rows={2} className="input resize-none" placeholder="Additional details..."/>
        </div>
        <div className="form-group">
          <label className="label">Colour</label>
          <input type="color" {...register('color')} className="input h-10 cursor-pointer" defaultValue={cfg.color}/>
        </div>
        <div className="form-group">
          <label className="label">Opacity (0-1)</label>
          <input type="number" min="0" max="1" step="0.1" {...register('opacity')} className="input"/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-coal-200">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving...' : <><FiPlus size={13}/> Add Annotation</>}
        </button>
      </div>
    </form>
  );
}

/* ---- Manage Access Modal ---- */
function ManageAccessModal({ planId, planTitle, mineName, onClose }) {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [data, setData]         = useState(null);
  const [selected, setSelected] = useState([]);
  const [isRestricted, setIsRestricted] = useState(true);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const ROLE_LABELS = {
    admin:'Administrator (DGMS)', government_officer:'Government Officer',
    mine_manager:'Mine Manager', inspector:'DGMS Inspector',
    safety_officer:'Safety Officer', environment_officer:'Environment Officer',
  };

  useEffect(() => {
    minePlansApi.getAccess(planId)
      .then(r => { setData(r.data); setSelected(r.data?.allowed_roles || []); setIsRestricted(r.data?.is_restricted ?? true); })
      .catch(() => toast.error('Could not load access settings'))
      .finally(() => setLoading(false));
  }, [planId]);

  const toggle = (role) => {
    if (selected.includes(role)) setConfirmRevoke(role);
    else setSelected(prev => [...prev, role]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await minePlansApi.updateAccess(planId, { allowed_roles: selected, is_restricted: isRestricted });
      toast.success('Access settings saved');
      onClose(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-5 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <FiShield size={17} className="text-amber-600"/>
            </div>
            <div>
              <h2 className="text-sm font-black text-coal-900">Manage Access</h2>
              <p className="text-xs text-coal-500">{planTitle}</p>
              <p className="text-[10px] text-coal-400">{mineName}</p>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="p-1.5 text-coal-400 hover:text-coal-700"><FiX size={16}/></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"/>
          </div>
        ) : !data ? (
          <p className="text-sm text-coal-500 text-center py-6">Unable to load access settings.</p>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 rounded-xl bg-coal-50 border border-coal-200">
              <div>
                <p className="text-sm font-semibold text-coal-800">Restricted Plan</p>
                <p className="text-xs text-coal-500">Limit access to roles listed below</p>
              </div>
              <button onClick={() => setIsRestricted(r => !r)}
                className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  isRestricted ? 'bg-amber-500' : 'bg-coal-300')}>
                <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  isRestricted ? 'translate-x-6' : 'translate-x-1')}/>
              </button>
            </div>

            <div className="space-y-2">
              {(data.role_details || []).map(({ role, label, permissions }) => {
                const isAllowed = selected.includes(role);
                return (
                  <div key={role}
                    className={clsx('flex items-center justify-between p-3 rounded-xl border transition-all',
                      isAllowed ? 'bg-success-50 border-success-300' : 'bg-coal-50 border-coal-200')}>
                    <div className="flex items-center gap-2.5">
                      {isAllowed
                        ? <FiUserCheck size={15} className="text-success-600 shrink-0"/>
                        : <FiLock      size={15} className="text-coal-400 shrink-0"/>}
                      <div>
                        <p className={clsx('text-sm font-semibold', isAllowed ? 'text-success-700' : 'text-coal-600')}>
                          {ROLE_LABELS[role] || label}
                        </p>
                        <div className="flex gap-1.5 mt-0.5">
                          {[['view','View'], ['download','Download'], ['manage_access','Manage']].map(([p, lbl]) => (
                            <span key={p} className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                              permissions?.[p] ? 'bg-success-100 text-success-700' : 'bg-coal-100 text-coal-500')}>
                              {lbl}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => toggle(role)}
                      className={clsx('text-xs font-bold px-3 py-1.5 rounded-lg transition-all',
                        isAllowed ? 'bg-danger-50 text-danger-600 hover:bg-danger-100' : 'bg-success-50 text-success-600 hover:bg-success-100')}>
                      {isAllowed ? 'Revoke' : 'Grant'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-coal-200">
              <button onClick={() => onClose(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : <><FiShield size={13}/> Save Changes</>}
              </button>
            </div>

            {confirmRevoke && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <FiAlertOctagon size={22} className="text-danger-600 shrink-0"/>
                    <div>
                      <p className="font-bold text-coal-900">Revoke Access?</p>
                      <p className="text-xs text-coal-600 mt-0.5">
                        Remove <strong>{ROLE_LABELS[confirmRevoke] || confirmRevoke}</strong> from this plan?
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    Users with this role will immediately lose access to this restricted mine plan.
                  </p>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setConfirmRevoke(null)} className="btn-secondary">Cancel</button>
                    <button onClick={() => { setSelected(p => p.filter(r => r !== confirmRevoke)); setConfirmRevoke(null); }}
                      className="btn-danger">Revoke Access</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Main Viewer ---- */
export default function MinePlanViewer() {
  const { id }   = useParams();
  const { user } = useAuthStore();

  const [planData, setPlanData]             = useState(null);
  const [loading, setLoading]               = useState(true);
  const [accessDenied, setAccessDenied]     = useState(false);
  const [showAddLayer, setShowAddLayer]     = useState(false);
  const [pendingPoint, setPendingPoint]     = useState(null);
  const [activeInfo, setActiveInfo]         = useState(null);
  const [visibleLayers, setVisibleLayers]   = useState(
    Object.fromEntries(Object.keys(LAYER_TYPES).map(k => [k, true]))
  );
  const [showSafety, setShowSafety]         = useState(true);
  const [activeTab, setActiveTab]           = useState('layers');
  const [offlineStatus, setOfflineStatus]   = useState('idle');
  const [isOffline, setIsOffline]           = useState(!navigator.onLine);
  const [showAccessModal, setShowAccessModal] = useState(false);

  const containerRef = useRef(null);
  const imgRef       = useRef(null);
  const zp           = useZoomPan();

  const canAddLayer     = ['admin','government_officer','mine_manager','inspector','safety_officer'].includes(user?.role);
  const canDownload     = ['admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'].includes(user?.role);
  const canManageAccess = ['admin','government_officer','mine_manager'].includes(user?.role);

  useEffect(() => {
    const onOnline  = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online',onOnline); window.removeEventListener('offline',onOffline); };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      if (navigator.onLine) {
        const r = await minePlansApi.getById(id);
        setPlanData(r.data);
      } else {
        const cached = await getOfflinePlan(id);
        if (cached) {
          setPlanData({ plan:cached.plan, layers:cached.layers, versions:cached.versions, safety_overlay:{} });
          toast('Loaded from offline cache', { icon:'📡' });
        } else {
          toast.error('No offline version available');
        }
      }
    } catch (err) {
      if (err?.response?.status === 403 || err?.response?.data?.code === 'MINE_PLAN_ACCESS_DENIED') {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      const cached = await getOfflinePlan(id).catch(() => null);
      if (cached) {
        setPlanData({ plan:cached.plan, layers:cached.layers, versions:cached.versions, safety_overlay:{} });
        toast('Loaded from offline cache', { icon:'📡' });
      } else {
        toast.error('Failed to load mine plan');
      }
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleOfflineDownload = async () => {
    if (!planData) return;
    setOfflineStatus('saving');
    try {
      await saveOfflinePlan(planData.plan, planData.layers, planData.versions);
      setOfflineStatus('saved');
      toast.success('Plan saved for offline access');
      setTimeout(() => setOfflineStatus('idle'), 3000);
    } catch {
      setOfflineStatus('error');
      toast.error('Failed to save offline');
      setTimeout(() => setOfflineStatus('idle'), 3000);
    }
  };

  const handleImageClick = useCallback((e) => {
    if (!canAddLayer) return;
    if (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3) return;
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    setPendingPoint({ x: Math.round(x*10000)/10000, y: Math.round(y*10000)/10000 });
    setShowAddLayer(true);
  }, [canAddLayer]);

  const toggleLayer = (type) => setVisibleLayers(prev => ({ ...prev, [type]: !prev[type] }));

  if (loading) return <PageLoader message="Loading mine plan..."/>;

  if (accessDenied) return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="w-20 h-20 rounded-2xl bg-danger-50 border border-danger-200 flex items-center justify-center mx-auto">
          <FiLock size={36} className="text-danger-600"/>
        </div>
        <div>
          <h2 className="text-2xl font-black text-coal-900 mb-2">Access Denied</h2>
          <p className="text-coal-500 text-sm">You are not authorized to view this restricted mine plan.</p>
          <p className="text-coal-400 text-xs mt-2">Contact your administrator if you believe you should have access.</p>
        </div>
        <div className="p-4 rounded-2xl bg-coal-50 border border-coal-200 text-left space-y-2">
          <p className="text-xs font-bold text-coal-500 uppercase tracking-widest">What you can do</p>
          <ul className="space-y-1.5 text-xs text-coal-500">
            <li>Contact your mine manager or DGMS officer to request access</li>
            <li>Verify you are logged in with the correct account</li>
          </ul>
        </div>
        <Link to="/mine-plans" className="btn-outline inline-flex">
          <FiArrowLeft size={13}/> Back to Plans
        </Link>
        <p className="text-[10px] text-coal-400">Error: MINE_PLAN_ACCESS_DENIED -- This attempt has been logged.</p>
      </div>
    </div>
  );

  if (!planData) return (
    <div className="text-center py-20">
      <FiAlertOctagon size={40} className="text-danger-500 mx-auto mb-3"/>
      <p className="text-coal-500">Mine plan not found</p>
      <Link to="/mine-plans" className="btn-outline mt-4 inline-flex">Back to Plans</Link>
    </div>
  );

  const { plan, layers=[], versions=[], safety_overlay={}, _access={} } = planData;
  const fileUrl = `/api/v1/mine-plans/${plan.id}/file`;
  const visLayers = layers.filter(l => visibleLayers[l.layer_type] !== false);
  const emergencyCount = layers.filter(l => LAYER_TYPES[l.layer_type]?.emergency).length;

  let allowedRoles = [];
  try { allowedRoles = plan.allowed_roles ? JSON.parse(plan.allowed_roles) : []; } catch { allowedRoles = []; }
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0)
    allowedRoles = ['admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'];

  const ROLE_LABELS_V = {
    admin:'Administrator (DGMS)', government_officer:'Government Officer',
    mine_manager:'Mine Manager', inspector:'DGMS Inspector',
    safety_officer:'Safety Officer', environment_officer:'Environment Officer',
  };

  return (
    <div className="space-y-4">
      <BackButton className="mb-1"/>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/mine-plans" className="flex items-center gap-1 text-xs text-coal-500 hover:text-amber-600 mb-1">
            <FiArrowLeft size={12}/> Back to Mine Plans
          </Link>
          <h1 className="text-xl font-black text-coal-900 flex items-center gap-2">
            <FiMap className="text-amber-500"/>
            {plan.plan_title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-coal-500">{plan.mine_name}</span>
            <span className="text-coal-300">|</span>
            <span className="text-xs text-coal-500">{plan.plan_type}</span>
            <span className="text-coal-300">|</span>
            <span className="font-mono text-xs text-coal-500">v{plan.version_number}</span>
            <Badge color={plan.approval_status === 'approved' ? 'green' : plan.approval_status === 'pending_review' ? 'yellow' : 'red'}>
              {plan.approval_status?.replace(/_/g,' ')}
            </Badge>
            {plan.is_current_version === 1 && <Badge color="blue">Current</Badge>}
            {isOffline && <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1"><FiWifiOff size={10}/> Offline</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canDownload && (
            <button onClick={handleOfflineDownload} disabled={offlineStatus==='saving'}
              className={clsx('btn-outline btn-sm gap-1.5', offlineStatus==='saved' && 'border-success-400 text-success-600')}>
              {offlineStatus==='saving' ? <><FiRefreshCw size={12} className="animate-spin"/> Saving...</>
               : offlineStatus==='saved' ? <><FiWifiOff size={12}/> Saved Offline</>
               : <><FiWifiOff size={12}/> Save Offline</>}
            </button>
          )}
          <a href={fileUrl} className="btn-outline btn-sm" download>
            <FiDownload size={13}/> Original
          </a>
        </div>
      </div>

      {plan.approval_status !== 'approved' && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <FiAlertOctagon size={12} className="shrink-0"/>
          This plan has not been officially approved -- for visualization and monitoring only.
        </div>
      )}

      {/* Who can see this */}
      {plan.is_restricted === 1 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FiLock size={15} className="text-amber-600 shrink-0"/>
              <div>
                <p className="text-sm font-bold text-amber-700">Restricted Mine Plan</p>
                <p className="text-xs text-coal-500 mt-0.5">Access limited to authorized personnel.</p>
              </div>
            </div>
            {canManageAccess && (
              <button onClick={() => setShowAccessModal(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-all">
                <FiShield size={12}/> Manage Access
              </button>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold text-coal-500 uppercase tracking-widest mb-2">Visible to:</p>
            <div className="flex flex-wrap gap-1.5">
              {allowedRoles.map(role => (
                <span key={role}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-success-100 border border-success-300 text-success-700">
                  <FiUserCheck size={9}/> {ROLE_LABELS_V[role] || role}
                </span>
              ))}
            </div>
          </div>
          {_access?.can_download === false && (
            <p className="text-[10px] text-amber-600">Your role can view but not download this plan.</p>
          )}
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Plan image */}
        <div className="lg:col-span-3">
          <div ref={containerRef}
            className="relative rounded-2xl overflow-hidden border border-coal-200 select-none"
            style={{ minHeight:'480px', background:'#f1f5f9' }}
            onWheel={zp.onWheel}
            onMouseDown={zp.onMouseDown}
            onMouseMove={zp.onMouseMove}
            onMouseUp={zp.onMouseUp}
            onMouseLeave={zp.onMouseUp}>

            <div className="absolute top-3 left-3 z-20 flex flex-col gap-1">
              {[
                {onClick:zp.zoomIn,  icon:FiZoomIn,    title:'Zoom in'},
                {onClick:zp.zoomOut, icon:FiZoomOut,   title:'Zoom out'},
                {onClick:zp.reset,   icon:FiMaximize2, title:'Reset view'},
              ].map(({onClick, icon:Icon, title}) => (
                <button key={title} onClick={onClick} title={title}
                  className="w-7 h-7 rounded-lg bg-white border border-coal-200 text-coal-500 hover:text-amber-600 flex items-center justify-center transition-colors shadow-sm">
                  <Icon size={13}/>
                </button>
              ))}
              {zp.scale !== 1 && (
                <div className="px-1.5 py-0.5 rounded-lg bg-white border border-coal-200 text-[9px] text-coal-500 text-center shadow-sm">
                  {Math.round(zp.scale * 100)}%
                </div>
              )}
            </div>

            <div style={zp.style} className="w-full">
              <img ref={imgRef} src={fileUrl} alt={plan.plan_title}
                className="w-full object-contain" style={{ maxHeight:'640px', display:'block', pointerEvents:'none' }}
                draggable={false}
                onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex'; }}/>
              <div className="hidden flex-col items-center justify-center h-80 text-center p-6">
                <FiDownload size={40} className="text-coal-400 mb-3"/>
                <p className="text-coal-500 font-semibold mb-2">PDF plan -- open original</p>
                <a href={fileUrl} download className="btn-outline btn-sm"><FiDownload size={13}/> Download Plan</a>
              </div>
              <div className="absolute inset-0" style={{ cursor: canAddLayer ? 'crosshair' : 'default' }} onClick={handleImageClick}/>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1 1" preserveAspectRatio="none">
                {visLayers.map(layer => {
                  try {
                    const geom = typeof layer.geometry === 'string' ? JSON.parse(layer.geometry) : layer.geometry;
                    const cfg  = LAYER_TYPES[layer.layer_type] || LAYER_TYPES.other;
                    const color = layer.color || cfg.color;
                    if (geom.type === 'point') {
                      const { x, y } = geom.coordinates;
                      return (
                        <g key={layer.id} className="pointer-events-auto cursor-pointer"
                          onClick={e => { e.stopPropagation(); setActiveInfo(layer); }}>
                          <circle cx={x} cy={y} r="0.015" fill={color} fillOpacity={0.9} stroke="white" strokeWidth="0.004"/>
                        </g>
                      );
                    }
                  } catch { return null; }
                  return null;
                })}
              </svg>
              {activeInfo && <InfoPanel item={activeInfo} onClose={() => setActiveInfo(null)}/>}
            </div>

            <div className="absolute bottom-3 left-3 text-[9px] text-coal-500 bg-white/80 px-2 py-1 rounded-lg pointer-events-none border border-coal-200">
              Scroll to zoom | Drag to pan{canAddLayer ? ' | Click to annotate' : ''}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <div className="flex bg-coal-100 border border-coal-200 rounded-xl p-1 gap-0.5">
            {[
              {key:'layers',    label:'Layers'},
              {key:'emergency', label:`SOS${emergencyCount>0 ? ` (${emergencyCount})` : ''}`},
              {key:'versions',  label:'History'},
            ].map(({key,label}) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={clsx('flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all',
                  activeTab===key ? 'bg-white text-amber-600 shadow-sm' : 'text-coal-500 hover:text-coal-700')}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'layers' && (
            <div className="card space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-coal-500 uppercase tracking-widest">Map Layers</h3>
                {canAddLayer && (
                  <button onClick={() => { setPendingPoint({x:0.5,y:0.5}); setShowAddLayer(true); }}
                    className="text-[10px] flex items-center gap-1 text-amber-600 hover:text-amber-700">
                    <FiPlus size={10}/> Add
                  </button>
                )}
              </div>
              {Object.entries(LAYER_TYPES).map(([type, cfg]) => {
                const count = layers.filter(l => l.layer_type===type).length;
                if (count===0) return null;
                return (
                  <div key={type} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:cfg.color}}/>
                      <span className="text-[11px] text-coal-600">{cfg.label}</span>
                      <span className="text-[9px] text-coal-400">({count})</span>
                    </div>
                    <button onClick={() => toggleLayer(type)} className="p-0.5 text-coal-400 hover:text-coal-600">
                      {visibleLayers[type]!==false ? <FiEye size={12}/> : <FiEyeOff size={12}/>}
                    </button>
                  </div>
                );
              })}
              {layers.length===0 && (
                <p className="text-[11px] text-coal-400 text-center py-4">
                  No layers yet.{canAddLayer ? ' Click on the plan to add annotations.' : ''}
                </p>
              )}
            </div>
          )}

          {activeTab === 'emergency' && (
            <div className="card space-y-3">
              <h3 className="text-xs font-bold text-danger-600 uppercase tracking-widest">Emergency Information</h3>
              <div className="p-2.5 rounded-xl bg-danger-50 border border-danger-200 text-[10px] text-danger-700">
                Always follow official DGMS-approved emergency procedures.
              </div>
              {layers.filter(l => LAYER_TYPES[l.layer_type]?.emergency).length === 0 ? (
                <p className="text-[11px] text-coal-400 text-center py-4">No emergency layers annotated.</p>
              ) : (
                layers.filter(l => LAYER_TYPES[l.layer_type]?.emergency).map(l => {
                  const cfg = LAYER_TYPES[l.layer_type];
                  return (
                    <div key={l.id} className="p-2.5 rounded-xl border text-[10px]"
                      style={{borderColor:`${cfg.color}30`,background:`${cfg.color}08`}}>
                      <p className="font-bold" style={{color:cfg.color}}>{l.label || cfg.label}</p>
                      {l.description && <p className="text-coal-500 mt-0.5">{l.description}</p>}
                    </div>
                  );
                })
              )}
              <div className="p-2.5 rounded-xl bg-coal-50 border border-coal-200 text-[10px] text-coal-500 space-y-1">
                <p className="font-bold text-coal-600">Emergency Contacts</p>
                <p>DGMS Emergency: 1800-345-3456</p>
                <p>National Emergency: 112</p>
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="card space-y-2">
              <h3 className="text-xs font-bold text-coal-500 uppercase tracking-widest mb-2">
                Version History ({versions.length})
              </h3>
              {versions.map(v => (
                <Link key={v.id} to={`/mine-plans/${v.id}`}
                  className={clsx('block p-2.5 rounded-xl border transition-all',
                    v.id===plan.id ? 'bg-amber-50 border-amber-300' : 'bg-coal-50 border-coal-200 hover:border-amber-300')}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-coal-800">v{v.version_number}</span>
                    <Badge color={v.approval_status==='approved' ? 'green' : 'yellow'}>
                      {v.approval_status?.replace(/_/g,' ')}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-coal-400 mt-0.5">{formatDate(v.created_at)}</p>
                  {v.is_current_version===1 && <p className="text-[9px] text-success-600 font-bold mt-0.5">CURRENT</p>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Layer Modal */}
      <Modal isOpen={showAddLayer} onClose={() => { setShowAddLayer(false); setPendingPoint(null); }}
        title="Add Layer Annotation" size="md">
        {pendingPoint && (
          <AddLayerForm
            planId={plan.id}
            point={pendingPoint}
            onSave={() => { setShowAddLayer(false); setPendingPoint(null); load(); }}
            onCancel={() => { setShowAddLayer(false); setPendingPoint(null); }}
          />
        )}
      </Modal>

      {/* Manage Access Modal */}
      {showAccessModal && (
        <ManageAccessModal
          planId={plan.id}
          planTitle={plan.plan_title}
          mineName={plan.mine_name}
          onClose={(reload) => { setShowAccessModal(false); if (reload) load(); }}
        />
      )}
    </div>
  );
}
