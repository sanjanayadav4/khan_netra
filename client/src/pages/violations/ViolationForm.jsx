import { useForm } from 'react-hook-form';
import { violationsApi } from '../../services/api';
import toast from 'react-hot-toast';

export default function ViolationForm({ violation, mines=[], onSave, onCancel }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: violation || { detected_date: new Date().toISOString().split('T')[0] }
  });

  const onSubmit = async (data) => {
    try {
      if (violation?.id) { await violationsApi.update(violation.id, data); toast.success('Updated'); }
      else               { await violationsApi.create(data);               toast.success('Violation reported'); }
      onSave();
    } catch {}
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Mine *</label>
          <select {...register('mine_id',{required:true})} className="select">
            <option value="">Select Mine</option>
            {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Type *</label>
          <select {...register('type',{required:true})} className="select">
            <option value="">Select Type</option>
            {['Safety','Environmental','Labor','Operational','Documentation','Financial'].map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Severity *</label>
          <select {...register('severity',{required:true})} className="select">
            <option value="">Select Severity</option>
            {['critical','high','medium','low'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Category *</label>
          <input {...register('category',{required:true})} className="input" placeholder="Ventilation, Fire Safety…"/>
        </div>
        <div className="form-group">
          <label className="label">Detected Date *</label>
          <input type="date" {...register('detected_date',{required:true})} className="input"/>
        </div>
        <div className="form-group">
          <label className="label">Fine Amount (₹)</label>
          <input type="number" {...register('fine_amount')} className="input" placeholder="0"/>
        </div>
        <div className="form-group col-span-2">
          <label className="label">Regulation Reference</label>
          <input {...register('regulation_reference')} className="input" placeholder="CMR-2017-R2, EP-ACT-2024-R1…"/>
        </div>
        <div className="form-group col-span-2">
          <label className="label">Description *</label>
          <textarea {...register('description',{required:true})} rows={3} className="input resize-none" placeholder="Detailed description of the violation…"/>
        </div>
        <div className="form-group col-span-2">
          <label className="label">Corrective Action Required</label>
          <textarea {...register('corrective_action')} rows={2} className="input resize-none" placeholder="Required corrective measures…"/>
        </div>
        <div className="form-group">
          <label className="label">Corrective Deadline</label>
          <input type="date" {...register('corrective_deadline')} className="input"/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-coal-700/50">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving…' : violation ? 'Update' : 'Report Violation'}
        </button>
      </div>
    </form>
  );
}
