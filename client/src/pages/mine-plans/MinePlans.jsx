/**
 * KhanNetra -- Underground Mine Digital Plans
 * List, upload, and manage mine plan versions with approval workflow.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  FiPlus, FiFileText, FiUpload, FiCheckCircle, FiXCircle,
  FiClock, FiEye, FiDownload, FiAlertOctagon, FiInfo,
  FiLayers, FiRefreshCw, FiMap, FiGrid, FiLock, FiShield,
  FiUserCheck, FiUserX, FiSave,
} from 'react-icons/fi';
import { useForm } from 'react-hook-form';
import { minePlansApi, minesApi } from '../../services/api';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import BackButton from '../../components/ui/BackButton';

const PLAN_TYPES = [
  'General Layout','Ventilation','Electrical','Water/Drainage',
  'Emergency Escape','Fire Risk','Working Sections','Other',
];
const APPROVAL_COLOR = {
  pending_review:'yellow', under_review:'blue', approved:'green',
  rejected:'red', superseded:'gray',
};
const OCR_COLOR = {
  pending:'gray', processing:'blue', complete:'green',
  failed:'red', not_applicable:'gray',
};

function StatsBar({ stats }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label:'Total Plans',       value: stats.total_plans,        color:'text-coal-900'    },
        { label:'Approved',          value: stats.approved_plans,     color:'text-success-600' },
        { label:'Pending Review',    value: stats.pending_review,     color:'text-amber-600'   },
        { label:'Current Versions',  value: stats.current_versions,   color:'text-info-600'    },
        { label:'Underground Mines', value: stats.underground_mines,  color:'text-coal-500'    },
      ].map(({ label, value, color }) => (
        <div key={label} className="card-sm text-center border border-coal-200">
          <p className={clsx('text-2xl font-black', color)}>{value ?? '--'}</p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

/* ---- Access Modal ---- */
function AccessModal({ plan, onClose }) {
  const { user }                = useAuthStore();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [data, setData]         = useState(null);
  const [selected, setSelected] = useState([]);
  const [isRestricted, setIsRestricted] = useState(true);
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const canManage = ['admin','government_officer','mine_manager'].includes(user?.role);

  useEffect(() => {
    minePlansApi.getAccess(plan.id)
      .then(r => {
        setData(r.data);
        setSelected(r.data?.allowed_roles || []);
        setIsRestricted(r.data?.is_restricted ?? true);
      })
      .catch(() => toast.error('Could not load access settings'))
      .finally(() => setLoading(false));
  }, [plan.id]);

  const toggle = (role) => {
    if (selected.includes(role)) setConfirmRevoke(role);
    else setSelected(prev => [...prev, role]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await minePlansApi.updateAccess(plan.id, { allowed_roles: selected, is_restricted: isRestricted });
      toast.success('Access settings saved');
      onClose(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save access settings');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-3 rounded-xl border" style={{ background: 'var(--bg-card-hover)', borderColor: 'var(--border)' }}>
        <FiLock size={18} className="text-amber-600 mt-0.5 shrink-0"/>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{plan.plan_title}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{plan.mine_name}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"/>
        </div>
      ) : !data ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Unable to load access settings.</p>
      ) : (
        <>
          {canManage && (
            <div className="flex items-center justify-between p-3 rounded-xl border"
              style={{ background: 'var(--bg-card-hover)', borderColor: 'var(--border)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Restricted Plan</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Only roles listed below can access</p>
              </div>
              <button onClick={() => setIsRestricted(r => !r)}
                className={clsx('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  isRestricted ? 'bg-amber-500' : 'bg-coal-300')}>
                <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  isRestricted ? 'translate-x-6' : 'translate-x-1')}/>
              </button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Role Permissions</p>
            {(data.role_details || []).map(({ role, label, allowed: initAllowed, permissions }) => {
              const isAllowed = selected.includes(role);
              return (
                <div key={role}
                  className={clsx('flex items-center justify-between p-3 rounded-xl border transition-all',
                    isAllowed ? 'bg-success-50 border-success-300' : 'border-coal-200')}
                  style={!isAllowed ? { background: 'var(--bg-card-hover)' } : {}}>
                  <div className="flex items-center gap-3">
                    {isAllowed
                      ? <FiUserCheck size={16} className="text-success-600 shrink-0"/>
                      : <FiUserX    size={16} className="text-coal-400 shrink-0"/>}
                    <div>
                      <p className={clsx('text-sm font-semibold', isAllowed ? 'text-success-700' : '')}
                        style={!isAllowed ? { color: 'var(--text-secondary)' } : {}}>{label}</p>
                      <div className="flex gap-2 mt-0.5">
                        {[['view','View'], ['download','Download'], ['manage_access','Manage']].map(([p, lbl]) => (
                          <span key={p} className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                            permissions?.[p] ? 'bg-success-100 text-success-700' : 'bg-coal-100 text-coal-500')}>
                            {lbl}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <button onClick={() => toggle(role)}
                      className={clsx('text-xs font-bold px-3 py-1.5 rounded-lg transition-all',
                        isAllowed ? 'bg-danger-50 text-danger-600 hover:bg-danger-100' : 'bg-success-50 text-success-600 hover:bg-success-100')}>
                      {isAllowed ? 'Revoke' : 'Grant'}
                    </button>
                  )}
                  {!canManage && (
                    <span className={clsx('text-[10px] font-bold px-2 py-1 rounded-full',
                      isAllowed ? 'bg-success-100 text-success-700' : 'bg-coal-100 text-coal-500')}>
                      {isAllowed ? 'Allowed' : 'No Access'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {canManage && (
            <div className="flex justify-end gap-3 pt-2 border-t border-coal-200">
              <button onClick={() => onClose(false)} className="btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : <><FiSave size={13}/> Save Changes</>}
              </button>
            </div>
          )}

          {confirmRevoke && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <FiAlertOctagon size={22} className="text-danger-600 shrink-0"/>
                  <div>
                    <p className="font-bold text-coal-900">Revoke Access?</p>
                    <p className="text-xs text-coal-600 mt-0.5">
                      Remove <strong>{(data.role_details || []).find(r => r.role === confirmRevoke)?.label}</strong> from this plan?
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
  );
}

/* ---- Upload Form ---- */
function UploadForm({ mines, onSave, onCancel }) {
  const fileRef = useRef();
  const [selectedFile, setSelectedFile] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { plan_type: 'General Layout', version_number: '1.0', is_restricted: true },
  });

  const onSubmit = async (data) => {
    if (!selectedFile) { toast.error('Please select a plan file'); return; }
    const fd = new FormData();
    fd.append('plan_file', selectedFile);
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
    });
    try {
      await minePlansApi.upload(fd);
      toast.success('Mine plan uploaded -- OCR extraction running in the background');
      onSave();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Upload failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
        <strong className="text-amber-600">Official Plan Notice:</strong> This upload does NOT replace or supersede
        the official approved mine plan. The uploaded document will be digitized for visualization only.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-group col-span-full">
          <label className="label">Mine (Underground only) *</label>
          <select {...register('mine_id', { required: 'Mine is required' })} className="select">
            <option value="">Select Underground Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.state})</option>)}
          </select>
          {errors.mine_id && <p className="text-xs text-danger-600 mt-1">{errors.mine_id.message}</p>}
        </div>
        <div className="form-group col-span-full">
          <label className="label">Plan Title *</label>
          <input {...register('plan_title', { required: 'Title is required' })} className="input"
            placeholder="e.g. Jharia Central -- General Layout Plan 2025"/>
          {errors.plan_title && <p className="text-xs text-danger-600 mt-1">{errors.plan_title.message}</p>}
        </div>
        <div className="form-group">
          <label className="label">Plan Type *</label>
          <select {...register('plan_type')} className="select">
            {PLAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Version Number *</label>
          <input {...register('version_number', { required: true })} className="input" placeholder="1.0"/>
        </div>
        <div className="form-group col-span-full">
          <label className="label">Plan File * (PDF, JPG, PNG, TIFF -- max 50 MB)</label>
          <div onClick={() => fileRef.current?.click()}
            className={clsx(
              'flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all',
              selectedFile ? 'border-success-400 bg-success-50' : 'border-coal-300 hover:border-amber-400 hover:bg-amber-50'
            )}>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.webp,.bmp"
              className="hidden" onChange={e => setSelectedFile(e.target.files?.[0] || null)}/>
            {selectedFile ? (
              <>
                <FiFileText size={24} className="text-success-600"/>
                <p className="text-sm font-semibold text-success-700">{selectedFile.name}</p>
                <p className="text-xs text-coal-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </>
            ) : (
              <>
                <FiUpload size={24} className="text-coal-400"/>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Click to select plan file</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>PDF, JPEG, PNG, TIFF -- Max 50 MB</p>
              </>
            )}
          </div>
        </div>
        <div className="form-group col-span-full flex items-center gap-3">
          <input type="checkbox" id="restricted" {...register('is_restricted')}
            className="w-4 h-4 accent-amber-500" defaultChecked/>
          <label htmlFor="restricted" className="text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            Restricted access (only authorized roles can view)
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-coal-200">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting || !selectedFile} className="btn-primary">
          {isSubmitting ? 'Uploading...' : <><FiUpload size={14}/> Upload Plan</>}
        </button>
      </div>
    </form>
  );
}

/* ---- Main Page ---- */
export default function MinePlans() {
  const { user }          = useAuthStore();
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [mines, setMines] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showQR, setShowQR]         = useState(null);
  const [showAccess, setShowAccess] = useState(null);
  const [filters, setFilters] = useState({
    mine_id: searchParams.get('mine_id') || '',
    plan_type: '',
    approval_status: '',
  });
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);

  const canUpload       = ['admin','government_officer','mine_manager','inspector'].includes(user?.role);
  const canApprove      = ['admin','government_officer'].includes(user?.role);
  const canManageAccess = ['admin','government_officer','mine_manager'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        minePlansApi.getAll({ ...filters, page, limit: 20 }),
        minePlansApi.getStats(),
      ]);
      setPlans(p.data || []);
      setPagination(p.pagination || {});
      setStats(s.data);
    } catch (e) {
      toast.error('Failed to load mine plans');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    minesApi.getAll({ limit: 100 }).then(r => setMines(r.data || [])).catch(() => {});
  }, [filters, page]);

  const handleApprove = async (planId, action) => {
    try {
      await minePlansApi.updateApproval(planId, { action });
      toast.success(`Plan ${action} successful`);
      load();
    } catch { toast.error('Action failed'); }
  };

  return (
    <div className="space-y-5">
      <BackButton className="mb-1"/>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiMap className="text-amber-500"/> Underground Mine Plans
          </h1>
          <p className="page-subtitle">Digital mine plan repository -- upload, version control, OCR extraction and safety overlay</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-outline btn-sm"><FiRefreshCw size={13}/> Refresh</button>
          {canUpload && (
            <button onClick={() => setShowUpload(true)} className="btn-primary">
              <FiUpload size={15}/> Upload Plan
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
        <FiInfo size={14} className="text-amber-600 mt-0.5 shrink-0"/>
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong className="text-amber-600">Governance Notice:</strong> This is a digital visualization platform only.
          OCR-extracted data is informational and does NOT constitute officially approved mine plans.
        </p>
      </div>

      <StatsBar stats={stats}/>

      <div className="card-sm flex flex-wrap gap-3">
        <select value={filters.mine_id}
          onChange={e => { setFilters(f => ({...f, mine_id: e.target.value})); setPage(1); }}
          className="select w-52">
          <option value="">All Mines</option>
          {mines.filter(m => m.type?.toLowerCase().includes('underground'))
            .map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filters.plan_type}
          onChange={e => { setFilters(f => ({...f, plan_type: e.target.value})); setPage(1); }}
          className="select w-44">
          <option value="">All Types</option>
          {PLAN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.approval_status}
          onChange={e => { setFilters(f => ({...f, approval_status: e.target.value})); setPage(1); }}
          className="select w-44">
          <option value="">All Statuses</option>
          {['pending_review','under_review','approved','rejected','superseded']
            .map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {loading ? <PageLoader/> : plans.length === 0 ? (
        <EmptyState
          icon={FiLayers}
          title="No mine plans found"
          description="Upload the first mine plan for this mine"
          action={canUpload && (
            <button onClick={() => setShowUpload(true)} className="btn-primary">
              <FiUpload size={14}/> Upload Mine Plan
            </button>
          )}
        />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Plan / Mine</th><th>Type</th><th>Version</th>
                <th>OCR</th><th>Approval</th><th>Current</th><th>Uploaded</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map(plan => (
                <tr key={plan.id}>
                  <td>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{plan.plan_title}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{plan.mine_name}</p>
                    {plan.is_restricted === 1 && (
                      <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide">
                        Restricted -- Authorized Personnel Only
                      </span>
                    )}
                  </td>
                  <td><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{plan.plan_type}</span></td>
                  <td>
                    <span className="font-mono text-xs font-bold" style={{ color: 'var(--text-primary)' }}>v{plan.version_number}</span>
                    {plan.version_label && <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{plan.version_label}</p>}
                  </td>
                  <td>
                    <Badge color={OCR_COLOR[plan.ocr_status] || 'gray'}>{plan.ocr_status?.replace('_',' ')}</Badge>
                    {plan.ocr_confidence > 0 && (
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {Math.round(plan.ocr_confidence * 100)}% conf.
                      </p>
                    )}
                  </td>
                  <td><Badge color={APPROVAL_COLOR[plan.approval_status] || 'gray'}>{plan.approval_status?.replace(/_/g,' ')}</Badge></td>
                  <td>
                    {plan.is_current_version
                      ? <span className="text-success-600 font-bold text-xs">Current</span>
                      : <span className="text-xs" style={{ color: 'var(--text-muted)' }}>--</span>}
                  </td>
                  <td>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(plan.created_at)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{plan.uploaded_by_name}</p>
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => navigate(`/mine-plans/${plan.id}`)}
                        className="p-1.5 rounded-lg text-coal-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="View plan"><FiEye size={14}/></button>
                      <a href={`/api/v1/mine-plans/${plan.id}/file`}
                        className="p-1.5 rounded-lg text-coal-400 hover:text-info-600 hover:bg-info-50 transition-colors"
                        title="Download original file"><FiDownload size={14}/></a>
                      {(canManageAccess || plan.is_restricted) && (
                        <button onClick={() => setShowAccess(plan)}
                          className="p-1.5 rounded-lg text-coal-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title={canManageAccess ? 'Manage access' : 'View access settings'}>
                          <FiShield size={14}/>
                        </button>
                      )}
                      {canApprove && plan.approval_status === 'pending_review' && (
                        <button onClick={() => handleApprove(plan.id, 'approve')}
                          className="p-1.5 rounded-lg text-coal-400 hover:text-success-600 hover:bg-success-50 transition-colors"
                          title="Approve plan"><FiCheckCircle size={14}/></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 p-3">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-outline btn-sm">Prev</button>
              <span className="text-xs self-center" style={{ color: 'var(--text-muted)' }}>
                Page {page} of {pagination.pages}
              </span>
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="btn-outline btn-sm">Next</button>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload Mine Plan" size="lg">
        <UploadForm
          mines={mines.filter(m => m.type?.toLowerCase().includes('underground'))}
          onSave={() => { setShowUpload(false); load(); }}
          onCancel={() => setShowUpload(false)}
        />
      </Modal>

      <Modal isOpen={!!showAccess} onClose={() => setShowAccess(null)} title="Plan Access" size="lg">
        {showAccess && (
          <AccessModal
            plan={showAccess}
            onClose={(reload) => { setShowAccess(null); if (reload) load(); }}
          />
        )}
      </Modal>
    </div>
  );
}
