import { useForm } from 'react-hook-form';
import { minesApi } from '../../services/api';
import toast from 'react-hot-toast';
import { MINE_STATES } from '../../utils/helpers';

export default function MineForm({ mine, onSave, onCancel }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ defaultValues: mine || {} });

  const onSubmit = async (data) => {
    try {
      if (mine?.id) { await minesApi.update(mine.id, data); toast.success('Mine updated'); }
      else          { await minesApi.create(data);          toast.success('Mine created'); }
      onSave();
    } catch {}
  };

  const F = ({ name, label, req, type='text', options, ...rest }) => (
    <div className="form-group">
      <label className="label">{label}{req&&' *'}</label>
      {options ? (
        <select {...register(name, req?{required:`${label} required`}:{})} className="select" {...rest}>
          <option value="">Select {label}</option>
          {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
        </select>
      ) : (
        <input type={type} {...register(name, req?{required:`${label} required`}:{})} className="input" {...rest}/>
      )}
      {errors[name] && <p className="text-xs text-danger-400 mt-1">{errors[name].message}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <F name="mine_id"    label="Mine ID"      req placeholder="MN-JH-001"/>
        <F name="name"       label="Mine Name"    req placeholder="Jharia Central Coal Mine"/>
        <F name="type"       label="Mine Type"    req options={[{value:'Underground',label:'Underground'},{value:'Opencast',label:'Opencast'},{value:'Mixed',label:'Mixed'}]}/>
        <F name="status"     label="Status"           options={[{value:'active',label:'Active'},{value:'inactive',label:'Inactive'},{value:'suspended',label:'Suspended'},{value:'under_inspection',label:'Under Inspection'}]}/>
        <F name="owner_name"    label="Owner Name"    req/>
        <F name="owner_company" label="Company Name"  req/>
        <F name="state"      label="State"        req options={MINE_STATES}/>
        <F name="district"   label="District"     req/>
        <F name="location_name" label="Location / Coalfield" req/>
        <F name="contact_email" label="Email"     type="email"/>
        <F name="contact_phone" label="Phone"/>
        <F name="workers_count" label="Workers"   type="number"/>
        <F name="area_hectares" label="Area (ha)" type="number" step="0.01"/>
        <F name="depth_meters"  label="Depth (m)" type="number"/>
        <F name="production_capacity_mt" label="Capacity (MT)" type="number"/>
        <F name="established_year" label="Est. Year" type="number"/>
        <F name="mining_method" label="Mining Method" placeholder="Bord and Pillar / Shovel-Dumper"/>
        <F name="license_number" label="License #"/>
        <F name="license_expiry" label="License Expiry" type="date"/>
        <F name="latitude"   label="Latitude"  type="number" step="0.000001"/>
        <F name="longitude"  label="Longitude" type="number" step="0.000001"/>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-coal-700/50">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving…' : mine ? 'Update Mine' : 'Create Mine'}
        </button>
      </div>
    </form>
  );
}
