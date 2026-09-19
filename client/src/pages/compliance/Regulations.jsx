import { useState, useEffect } from 'react';
import BackButton from '../../components/ui/BackButton';
import { FiSearch, FiBookOpen, FiPlus } from 'react-icons/fi';
import { complianceApi } from '../../services/api';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';
import { formatDate } from '../../utils/helpers';

const CAT_COLOR = { Safety: 'red', Environmental: 'green', Labor: 'blue', Health: 'purple', Operational: 'yellow' };

export default function Regulations() {
  const { user } = useAuthStore();
  const [regulations, setRegulations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [viewItem, setViewItem] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await complianceApi.getRegulations({ search, category });
      setRegulations(res.data ?? res);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [search, category]);

  return (
    <div className="space-y-6"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Regulations & Rules</h1>
          <p className="page-subtitle">Coal mining regulations, acts and compliance standards</p>
        </div>
        {['admin', 'government_officer'].includes(user?.role) && (
          <button onClick={() => setShowForm(true)} className="btn-primary"><FiPlus size={16} /> Add Regulation</button>
        )}
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {['', 'Safety', 'Environmental', 'Labor', 'Health', 'Operational'].map(c => (
          <button key={c} onClick={() => setCategory(c)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border', category === c ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-coal-600 border-coal-200 hover:bg-coal-50')}>
            {c || 'All'}
          </button>
        ))}
      </div>

      <div className="card p-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-coal-400" size={15} />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search regulations by title, code, description..." />
        </div>
      </div>

      {loading ? <PageLoader /> : regulations.length === 0 ? (
        <EmptyState icon={FiBookOpen} title="No regulations found" />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {regulations.map(reg => (
            <div key={reg.id} className="card hover:shadow-hover transition-shadow cursor-pointer" onClick={() => setViewItem(reg)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-mono text-xs bg-coal-100 px-2 py-0.5 rounded font-bold text-coal-700">{reg.code}</span>
                    <Badge color={CAT_COLOR[reg.category] || 'gray'}>{reg.category}</Badge>
                  </div>
                  <h3 className="font-semibold text-coal-900 text-sm mb-1">{reg.title}</h3>
                  <p className="text-xs text-coal-500 line-clamp-2">{reg.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-coal-400">Effective: {formatDate(reg.effective_date)}</p>
                  <p className="text-xs font-medium text-coal-600 mt-1">{reg.issuing_authority}</p>
                  {reg.penalty_range && <p className="text-xs text-red-500 mt-1">{reg.penalty_range}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={viewItem?.code} size="md">
        {viewItem && (
          <div className="space-y-4">
            <Badge color={CAT_COLOR[viewItem.category] || 'gray'}>{viewItem.category}</Badge>
            <h3 className="font-semibold text-coal-900">{viewItem.title}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-coal-400">Issuing Authority</p><p>{viewItem.issuing_authority}</p></div>
              <div><p className="text-xs text-coal-400">Effective Date</p><p>{formatDate(viewItem.effective_date)}</p></div>
              {viewItem.penalty_range && <div className="col-span-2"><p className="text-xs text-coal-400">Penalty Range</p><p className="text-red-600 font-medium">{viewItem.penalty_range}</p></div>}
            </div>
            <div><p className="text-xs text-coal-400 mb-1">Description</p><p className="text-sm bg-coal-50 rounded-lg p-3 leading-relaxed">{viewItem.description}</p></div>
            {viewItem.applicable_mine_types?.length > 0 && (
              <div><p className="text-xs text-coal-400 mb-1">Applicable to</p>
                <div className="flex gap-1">{viewItem.applicable_mine_types.map(t => <Badge key={t} color="blue">{t}</Badge>)}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add Regulation Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Add Regulation" size="md">
        <RegulationForm onSave={() => { setShowForm(false); fetch(); }} onCancel={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function RegulationForm({ onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();
  const onSubmit = async (data) => {
    try {
      await complianceApi.createRegulation({ ...data, applicable_mine_types: ['Underground', 'Opencast'] });
      toast.success('Regulation added');
      onSave();
    } catch {}
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group"><label className="label">Code *</label><input {...register('code', { required: true })} className="input" placeholder="CMR-2017-R1" /></div>
        <div className="form-group">
          <label className="label">Category *</label>
          <select {...register('category', { required: true })} className="select">
            <option value="">Select</option>
            {['Safety','Environmental','Labor','Health','Operational'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group col-span-2"><label className="label">Title *</label><input {...register('title', { required: true })} className="input" /></div>
        <div className="form-group col-span-2"><label className="label">Description *</label><textarea {...register('description', { required: true })} rows={4} className="input resize-none" /></div>
        <div className="form-group"><label className="label">Issuing Authority</label><input {...register('issuing_authority')} className="input" /></div>
        <div className="form-group"><label className="label">Effective Date</label><input type="date" {...register('effective_date')} className="input" /></div>
        <div className="form-group col-span-2"><label className="label">Penalty Range</label><input {...register('penalty_range')} className="input" placeholder="₹50,000 - ₹5,00,000" /></div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Saving...' : 'Add Regulation'}</button>
      </div>
    </form>
  );
}
