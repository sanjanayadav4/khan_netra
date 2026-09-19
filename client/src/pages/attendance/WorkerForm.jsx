/**
 * KhanNetra — Worker Registration / Edit Form  v2
 * Includes: basic profile, training/medical dates, address, certifications tab.
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { workersApi } from '../../services/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { FiPlus, FiTrash2, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';

const DEPARTMENTS = [
  'Mining','Electrical','Safety','Mechanical','Civil',
  'Ventilation','Survey','Medical','Administration','General',
];
const WORKER_TYPES = [
  { value:'regular',  label:'Regular / Permanent' },
  { value:'contract', label:'Contract'             },
  { value:'casual',   label:'Casual'               },
  { value:'trainee',  label:'Trainee / Apprentice' },
];
const SHIFTS = [
  { value:'day',     label:'Day Shift'   },
  { value:'night',   label:'Night Shift' },
  { value:'general', label:'General'     },
  { value:'A',       label:'A Shift'     },
  { value:'B',       label:'B Shift'     },
  { value:'C',       label:'C Shift'     },
];
const TRAINING_STATUSES = [
  { value:'not_started', label:'Not Started' },
  { value:'in_progress', label:'In Progress' },
  { value:'completed',   label:'Completed'   },
  { value:'expired',     label:'Expired'     },
];
const BLOOD_GROUPS = ['A+','A−','B+','B−','AB+','AB−','O+','O−'];

const TABS = ['Profile','Training & Medical','Address','Certifications'];

/* ── Certification sub-form ──────────────────────────────────────────── */
function CertificationsTab({ workerId, readOnly }) {
  const [certs,     setCerts]     = useState([]);
  const [certTypes, setCertTypes] = useState([]);
  const [adding,    setAdding]    = useState(false);
  const [form,      setForm]      = useState({ cert_name:'', cert_category:'safety', issuing_authority:'', certificate_number:'', issue_date:'', expiry_date:'' });
  const [saving,    setSaving]    = useState(false);

  const load = async () => {
    try {
      const [c, t] = await Promise.all([
        workersApi.getCertifications(workerId),
        workersApi.getCertTypes(),
      ]);
      setCerts(c.data || []);
      setCertTypes(t.data || []);
    } catch {}
  };

  useEffect(() => { if (workerId) load(); }, [workerId]);

  const handleAdd = async () => {
    if (!form.cert_name) { toast.error('Certification name is required'); return; }
    setSaving(true);
    try {
      await workersApi.addCertification(workerId, form);
      toast.success('Certification added');
      setAdding(false);
      setForm({ cert_name:'', cert_category:'safety', issuing_authority:'', certificate_number:'', issue_date:'', expiry_date:'' });
      load();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed to add'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (certId) => {
    try {
      await workersApi.deleteCertification(workerId, certId);
      toast.success('Removed');
      load();
    } catch { toast.error('Failed to remove'); }
  };

  const daysLeft = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  if (!workerId) return (
    <p className="text-sm text-center py-8" style={{ color:'var(--text-muted)' }}>
      Save the worker profile first to manage certifications.
    </p>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color:'var(--text-muted)' }}>
          Safety &amp; Technical Certifications ({certs.length})
        </p>
        {!readOnly && (
          <button onClick={() => setAdding(v => !v)} className="btn-primary btn-sm">
            <FiPlus size={12}/> Add Certificate
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
          <p className="text-xs font-bold text-amber-500 uppercase tracking-wide">New Certificate</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group mb-0 col-span-2">
              <label className="label">Certificate Name *</label>
              <select
                value={form.cert_name}
                onChange={e => setForm(f => ({ ...f, cert_name: e.target.value, cert_category: certTypes.find(t => t.name === e.target.value)?.category || f.cert_category }))}
                className="select"
              >
                <option value="">Select or type below…</option>
                {certTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
              <input
                className="input mt-1 text-xs"
                placeholder="Or type custom certificate name…"
                value={form.cert_name}
                onChange={e => setForm(f => ({ ...f, cert_name: e.target.value }))}
              />
            </div>
            <div className="form-group mb-0">
              <label className="label">Category</label>
              <select value={form.cert_category} onChange={e => setForm(f => ({ ...f, cert_category: e.target.value }))} className="select">
                {['safety','technical','medical','regulatory'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="label">Issuing Authority</label>
              <input className="input" value={form.issuing_authority} onChange={e => setForm(f => ({ ...f, issuing_authority: e.target.value }))} placeholder="DGMS, CIMFR…"/>
            </div>
            <div className="form-group mb-0">
              <label className="label">Certificate No.</label>
              <input className="input" value={form.certificate_number} onChange={e => setForm(f => ({ ...f, certificate_number: e.target.value }))}/>
            </div>
            <div className="form-group mb-0">
              <label className="label">Issue Date</label>
              <input type="date" className="input" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))}/>
            </div>
            <div className="form-group mb-0 col-span-2">
              <label className="label">Expiry Date</label>
              <input type="date" className="input" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}/>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="btn-primary btn-sm">
              {saving ? 'Saving…' : 'Save Certificate'}
            </button>
          </div>
        </div>
      )}

      {/* Certificate list */}
      {certs.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color:'var(--text-muted)' }}>
          No certifications recorded yet.
        </p>
      ) : (
        <div className="space-y-2">
          {certs.map(cert => {
            const dl   = daysLeft(cert.expiry_date);
            const expired    = dl !== null && dl < 0;
            const expiringSoon = dl !== null && dl >= 0 && dl <= 30;
            return (
              <div key={cert.id}
                className={clsx(
                  'flex items-start justify-between gap-3 p-3 rounded-xl border',
                  expired      ? 'bg-red-500/8 border-red-500/25'
                  : expiringSoon ? 'bg-amber-500/8 border-amber-500/25'
                  : 'border-[var(--border)] bg-[var(--bg-card-hover)]'
                )}
              >
                <div className="flex items-start gap-2">
                  {expired      ? <FiAlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5"/>
                  : expiringSoon ? <FiAlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5"/>
                  : <FiCheckCircle size={14} className="text-green-500 shrink-0 mt-0.5"/>}
                  <div>
                    <p className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{cert.cert_name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                      {cert.issuing_authority  && <span className="text-[11px]" style={{ color:'var(--text-muted)' }}>{cert.issuing_authority}</span>}
                      {cert.certificate_number && <span className="text-[11px] font-mono" style={{ color:'var(--text-muted)' }}>#{cert.certificate_number}</span>}
                      {cert.issue_date         && <span className="text-[11px]" style={{ color:'var(--text-muted)' }}>Issued: {cert.issue_date}</span>}
                      {cert.expiry_date && (
                        <span className={clsx('text-[11px] font-semibold',
                          expired ? 'text-red-400' : expiringSoon ? 'text-amber-500' : 'text-green-500')}>
                          {expired      ? `Expired ${Math.abs(dl)} days ago`
                          : expiringSoon ? `Expires in ${dl} days`
                          : `Valid until ${cert.expiry_date}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!readOnly && (
                  <button onClick={() => handleDelete(cert.id)}
                    className="p-1 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0">
                    <FiTrash2 size={13}/>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Form ───────────────────────────────────────────────────────── */
export default function WorkerForm({ mines, contractors, worker, onSave, onCancel }) {
  const isEdit = !!worker;
  const [tab, setTab] = useState('Profile');

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { shift:'day', worker_type:'regular', status:'active', training_status:'not_started' },
  });

  useEffect(() => {
    if (worker) {
      reset({
        full_name:             worker.full_name            || '',
        mine_id:               worker.mine_id              || '',
        department:            worker.department           || '',
        designation:           worker.designation          || '',
        shift:                 worker.shift                || 'day',
        contractor_id:         worker.contractor_id        || '',
        worker_type:           worker.worker_type          || 'regular',
        phone:                 worker.phone                || '',
        emergency_contact:     worker.emergency_contact    || '',
        aadhaar_last4:         worker.aadhaar_last4        || '',
        joining_date:          worker.joining_date         || '',
        status:                worker.status               || 'active',
        notes:                 worker.notes                || '',
        blood_group:           worker.blood_group          || '',
        training_status:       worker.training_status      || 'not_started',
        safety_training_date:  worker.safety_training_date || '',
        training_expiry_date:  worker.training_expiry_date || '',
        medical_fitness_date:  worker.medical_fitness_date || '',
        medical_expiry_date:   worker.medical_expiry_date  || '',
        biometric_id:          worker.biometric_id         || '',
        address:               worker.address              || '',
        district:              worker.district             || '',
        state:                 worker.state                || '',
      });
    }
  }, [worker, reset]);

  const onSubmit = async (data) => {
    const payload = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
    );
    try {
      if (isEdit) {
        await workersApi.update(worker.id, payload);
        toast.success('Worker profile updated');
      } else {
        await workersApi.create(payload);
        toast.success('Worker registered successfully');
      }
      onSave();
    } catch (err) {
      toast.error(err?.response?.data?.message || `Failed to ${isEdit ? 'update' : 'register'} worker`);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Notice */}
      <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs" style={{ color:'var(--text-secondary)' }}>
        <strong className="text-amber-500">{isEdit ? '✏️ Editing Worker Profile' : '📋 One-time Registration'}</strong>
        {!isEdit && <span className="ml-1">Enter details once — this worker will appear on every daily attendance screen automatically.</span>}
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-[var(--border)] gap-4">
        {TABS.map(t => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={clsx('pb-2 text-xs font-semibold transition-colors border-b-2 -mb-px',
              tab === t ? 'border-amber-500 text-amber-500' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
            {t}
          </button>
        ))}
      </div>

      {/* ── PROFILE TAB ── */}
      {tab === 'Profile' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group col-span-full">
            <label className="label">Full Name *</label>
            <input {...register('full_name', { required:'Full name is required' })} className="input" placeholder="e.g. Rahul Kumar"/>
            {errors.full_name && <p className="text-xs text-red-400 mt-1">{errors.full_name.message}</p>}
          </div>
          <div className="form-group">
            <label className="label">Mine *</label>
            <select {...register('mine_id', { required:'Mine is required' })} className="select" disabled={isEdit}>
              <option value="">Select Mine</option>
              {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {errors.mine_id && <p className="text-xs text-red-400 mt-1">{errors.mine_id.message}</p>}
            {isEdit && <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>Mine cannot change after registration.</p>}
          </div>
          <div className="form-group">
            <label className="label">Department *</label>
            <select {...register('department', { required:'Department is required' })} className="select">
              <option value="">Select</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {errors.department && <p className="text-xs text-red-400 mt-1">{errors.department.message}</p>}
          </div>
          <div className="form-group">
            <label className="label">Designation *</label>
            <input {...register('designation', { required:'Designation is required' })} className="input" placeholder="Mining Sardar, Electrician, Overman…"/>
            {errors.designation && <p className="text-xs text-red-400 mt-1">{errors.designation.message}</p>}
          </div>
          <div className="form-group">
            <label className="label">Default Shift</label>
            <select {...register('shift')} className="select">
              {SHIFTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Worker Type</label>
            <select {...register('worker_type')} className="select">
              {WORKER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Contractor / Company</label>
            <select {...register('contractor_id')} className="select">
              <option value="">Direct / Mine Employee</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Joining Date</label>
            <input type="date" {...register('joining_date')} className="input"/>
          </div>
          <div className="form-group">
            <label className="label">Blood Group</label>
            <select {...register('blood_group')} className="select">
              <option value="">Not specified</option>
              {BLOOD_GROUPS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Contact Number</label>
            <input {...register('phone')} className="input" placeholder="+91-XXXXXXXXXX"/>
          </div>
          <div className="form-group">
            <label className="label">Emergency Contact</label>
            <input {...register('emergency_contact')} className="input" placeholder="Name & phone"/>
          </div>
          <div className="form-group">
            <label className="label">Aadhaar (last 4 digits only)</label>
            <input {...register('aadhaar_last4', { maxLength:4, pattern:{ value:/^\d{0,4}$/, message:'Digits only' } })}
              className="input" placeholder="XXXX" maxLength={4}/>
            <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>Only last 4 digits stored.</p>
          </div>
          <div className="form-group">
            <label className="label">Biometric ID</label>
            <input {...register('biometric_id')} className="input" placeholder="Fingerprint / card ID"/>
          </div>
          {isEdit && (
            <div className="form-group">
              <label className="label">Status</label>
              <select {...register('status')} className="select">
                {['active','inactive','transferred','terminated'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="form-group col-span-full">
            <label className="label">Notes</label>
            <textarea {...register('notes')} rows={2} className="input resize-none"/>
          </div>
        </div>
      )}

      {/* ── TRAINING & MEDICAL TAB ── */}
      {tab === 'Training & Medical' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="col-span-full p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs" style={{ color:'var(--text-secondary)' }}>
            Record safety training and medical fitness dates. Workers with expired training or medical fitness will be flagged automatically.
          </div>
          <div className="form-group">
            <label className="label">Safety Training Status</label>
            <select {...register('training_status')} className="select">
              {TRAINING_STATUSES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Safety Training Date</label>
            <input type="date" {...register('safety_training_date')} className="input"/>
          </div>
          <div className="form-group">
            <label className="label">Training Expiry Date</label>
            <input type="date" {...register('training_expiry_date')} className="input"/>
            <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>Alert will show 30 days before expiry.</p>
          </div>
          <div className="form-group">
            <label className="label">Medical Fitness Date</label>
            <input type="date" {...register('medical_fitness_date')} className="input"/>
          </div>
          <div className="form-group">
            <label className="label">Medical Certificate Expiry</label>
            <input type="date" {...register('medical_expiry_date')} className="input"/>
            <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>Mandatory annual renewal for underground workers.</p>
          </div>
        </div>
      )}

      {/* ── ADDRESS TAB ── */}
      {tab === 'Address' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group col-span-full">
            <label className="label">Address</label>
            <textarea {...register('address')} rows={3} className="input resize-none" placeholder="House/Village/Street…"/>
          </div>
          <div className="form-group">
            <label className="label">District</label>
            <input {...register('district')} className="input" placeholder="Dhanbad, Korba…"/>
          </div>
          <div className="form-group">
            <label className="label">State</label>
            <input {...register('state')} className="input" placeholder="Jharkhand, Chhattisgarh…"/>
          </div>
        </div>
      )}

      {/* ── CERTIFICATIONS TAB ── */}
      {tab === 'Certifications' && (
        <CertificationsTab workerId={isEdit ? worker.id : null} readOnly={false}/>
      )}

      {/* Buttons — only show when not on certs tab (which has its own save) */}
      {tab !== 'Certifications' && (
        <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            {isSubmitting ? 'Saving…' : isEdit ? '✏️ Update Worker' : '➕ Register Worker'}
          </button>
        </div>
      )}
    </form>
  );
}
