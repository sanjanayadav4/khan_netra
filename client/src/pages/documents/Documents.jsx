import { useState, useEffect, useCallback } from 'react';
import BackButton from '../../components/ui/BackButton';
import { useSearchParams } from 'react-router-dom';
import { FiUpload, FiFileText, FiSearch, FiEye, FiTrash2, FiAlertTriangle, FiCpu, FiDownload } from 'react-icons/fi';
import { useDropzone } from 'react-dropzone';
import { documentsApi, minesApi } from '../../services/api';
import { formatDate } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const STATUS_COLOR = { active: 'green', expired: 'red', expiring_soon: 'yellow', pending: 'gray', revoked: 'red' };
const DOC_TYPES = ['License','Certificate','Permit','Report','Plan','Notice','Agreement','Other'];

export default function Documents() {
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState([]);
  const [mines, setMines] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [analyzing, setAnalyzing] = useState(null);
  const [filters, setFilters] = useState({ status: '', type: '', mine_id: searchParams.get('mine_id') || '' });
  const [search, setSearch] = useState('');

  const fetch = async () => {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([documentsApi.getAll({ ...filters, search }), documentsApi.getExpiryAlerts()]);
      setDocuments(d.data);
      setAlerts(a.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetch(); minesApi.getAll({ limit: 100 }).then(r => setMines(r.data)).catch(() => {}); }, [filters, search]);

  const handleDelete = async () => {
    try { await documentsApi.delete(deleteId); toast.success('Document deleted'); setDeleteId(null); fetch(); } catch {}
  };

  const handleAnalyze = async (doc) => {
    setAnalyzing(doc.id);
    try {
      const res = await documentsApi.analyze(doc.id);
      const analysisData = res.data ?? res;
      setViewDoc({ ...doc, ai_analysis: analysisData.analysis, ai_risk_flags: analysisData.riskFlags });
      toast.success('AI Analysis complete');
    } catch {} finally { setAnalyzing(null); }
  };

  const expiryAlertCount = alerts.filter(a => a.status === 'expired').length;
  const expiringSoonCount = alerts.filter(a => a.status === 'expiring_soon').length;

  return (
    <div className="space-y-6"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Document Management</h1>
          <p className="page-subtitle">Manage licenses, certificates, permits and reports</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn-primary"><FiUpload size={16} /> Upload Document</button>
      </div>

      {/* Expiry Alerts */}
      {(expiryAlertCount > 0 || expiringSoonCount > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {expiryAlertCount > 0 && (
            <div className="card border-l-4 border-red-500 p-4">
              <div className="flex items-center gap-2 mb-2">
                <FiAlertTriangle className="text-red-500" size={18} />
                <span className="font-semibold text-red-700">{expiryAlertCount} Expired Document{expiryAlertCount > 1 ? 's' : ''}</span>
              </div>
              {alerts.filter(a => a.status === 'expired').slice(0, 3).map(d => (
                <div key={d.id} className="text-xs text-red-600 py-1 border-b border-red-100 last:border-0">{d.title} â€” {d.mine_name}</div>
              ))}
            </div>
          )}
          {expiringSoonCount > 0 && (
            <div className="card border-l-4 border-yellow-500 p-4">
              <div className="flex items-center gap-2 mb-2">
                <FiAlertTriangle className="text-yellow-500" size={18} />
                <span className="font-semibold text-yellow-700">{expiringSoonCount} Expiring Soon</span>
              </div>
              {alerts.filter(a => a.status === 'expiring_soon').slice(0, 3).map(d => (
                <div key={d.id} className="text-xs text-yellow-700 py-1 border-b border-yellow-100 last:border-0">{d.title} â€” {d.mine_name} ({Math.abs(d.days_until_expiry)} days)</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-coal-400" size={15} />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search documents..." />
        </div>
        <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} className="select w-40">
          <option value="">All Status</option>
          {['active','expired','expiring_soon','pending','revoked'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))} className="select w-36">
          <option value="">All Types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filters.mine_id} onChange={e => setFilters(p => ({ ...p, mine_id: e.target.value }))} className="select w-48">
          <option value="">All Mines</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {loading ? <PageLoader /> : documents.length === 0 ? (
        <EmptyState icon={FiFileText} title="No documents found" action={<button onClick={() => setShowUpload(true)} className="btn-primary"><FiUpload size={16} /> Upload First Document</button>} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Mine</th>
                <th>Type</th>
                <th>Issued By</th>
                <th>Issue Date</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-coal-100 rounded"><FiFileText size={14} className="text-coal-500" /></div>
                      <div>
                        <p className="font-medium text-sm">{doc.title}</p>
                        <p className="text-[11px] text-coal-400">{doc.document_number}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className="text-sm">{doc.mine_name}</span></td>
                  <td><Badge color={doc.type === 'License' ? 'blue' : doc.type === 'Certificate' ? 'green' : 'gray'}>{doc.type}</Badge></td>
                  <td><span className="text-xs text-coal-500">{doc.issuing_authority || 'â€”'}</span></td>
                  <td><span className="text-xs">{formatDate(doc.issue_date)}</span></td>
                  <td>
                    <span className={clsx('text-xs font-medium', doc.status === 'expired' ? 'text-red-600' : doc.status === 'expiring_soon' ? 'text-yellow-600' : 'text-coal-600')}>
                      {formatDate(doc.expiry_date)}
                    </span>
                  </td>
                  <td><Badge color={STATUS_COLOR[doc.status]} dot>{doc.status.replace('_',' ')}</Badge></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => setViewDoc(doc)} className="p-1.5 rounded hover:bg-coal-100 text-coal-500" title="View"><FiEye size={15} /></button>
                      <button onClick={() => handleAnalyze(doc)} disabled={analyzing === doc.id} className="p-1.5 rounded hover:bg-blue-50 text-blue-400" title="AI Analyze">
                        {analyzing === doc.id ? <span className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin block" /> : <FiCpu size={15} />}
                      </button>
                      <button onClick={() => setDeleteId(doc.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400" title="Delete"><FiTrash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View Doc Modal */}
      <Modal isOpen={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc?.title} size="md">
        {viewDoc && (
          <div className="space-y-4">
            <div className="flex gap-2"><Badge color={STATUS_COLOR[viewDoc.status]}>{viewDoc.status}</Badge><Badge color="gray">{viewDoc.type}</Badge></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-coal-400">Mine</p><p className="font-medium">{viewDoc.mine_name}</p></div>
              <div><p className="text-xs text-coal-400">Document #</p><p className="font-mono text-xs">{viewDoc.document_number}</p></div>
              <div><p className="text-xs text-coal-400">Issuing Authority</p><p>{viewDoc.issuing_authority || 'â€”'}</p></div>
              <div><p className="text-xs text-coal-400">Category</p><p>{viewDoc.category}</p></div>
              <div><p className="text-xs text-coal-400">Issue Date</p><p>{formatDate(viewDoc.issue_date)}</p></div>
              <div><p className="text-xs text-coal-400">Expiry Date</p><p className={viewDoc.status === 'expired' ? 'text-red-600 font-bold' : ''}>{formatDate(viewDoc.expiry_date)}</p></div>
            </div>
            {viewDoc.ai_analysis && (
              <div>
                <div className="flex items-center gap-2 mb-2"><FiCpu size={14} className="text-blue-500" /><p className="text-xs font-bold text-coal-600">AI ANALYSIS</p></div>
                <p className="text-sm bg-blue-50 rounded-lg p-3 leading-relaxed">{viewDoc.ai_analysis}</p>
                {viewDoc.ai_risk_flags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {viewDoc.ai_risk_flags.map(f => <Badge key={f} color="red">{f.replace('_',' ')}</Badge>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload Document" size="lg">
        <UploadForm mines={mines} onSave={() => { setShowUpload(false); fetch(); }} onCancel={() => setShowUpload(false)} />
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Document" message="Are you sure you want to delete this document? This cannot be undone." danger confirmText="Delete" />
    </div>
  );
}

function UploadForm({ mines, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();
  const [file, setFile] = useState(null);
  const onDrop = useCallback(files => setFile(files[0]), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'], 'application/msword': ['.doc', '.docx'] }, maxFiles: 1 });

  const onSubmit = async (data) => {
    if (!file) { toast.error('Please select a file'); return; }
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => v && fd.append(k, v));
    fd.append('file', file);
    try {
      await documentsApi.upload(fd);
      toast.success('Document uploaded & analyzed');
      onSave();
    } catch {}
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div {...getRootProps()} className={clsx('border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors', isDragActive ? 'border-primary-500 bg-primary-50' : 'border-coal-200 hover:border-primary-400 hover:bg-coal-50')}>
        <input {...getInputProps()} />
        <FiUpload size={24} className="mx-auto text-coal-400 mb-2" />
        {file ? <p className="text-sm font-medium text-primary-600">{file.name}</p> : <p className="text-sm text-coal-400">Drop file here or click to browse (PDF, DOCX, JPG)</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Mine *</label>
          <select {...register('mine_id', { required: true })} className="select">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Document Type *</label>
          <select {...register('type', { required: true })} className="select">
            <option value="">Select Type</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group col-span-2">
          <label className="label">Title *</label>
          <input {...register('title', { required: true })} className="input" placeholder="Document title..." />
        </div>
        <div className="form-group">
          <label className="label">Document Number</label>
          <input {...register('document_number')} className="input" placeholder="ML-JH-2024-001" />
        </div>
        <div className="form-group">
          <label className="label">Issuing Authority</label>
          <input {...register('issuing_authority')} className="input" placeholder="MoEFCC, DGMS, State Govt..." />
        </div>
        <div className="form-group">
          <label className="label">Issue Date</label>
          <input type="date" {...register('issue_date')} className="input" />
        </div>
        <div className="form-group">
          <label className="label">Expiry Date</label>
          <input type="date" {...register('expiry_date')} className="input" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Uploading & Analyzing...' : 'Upload Document'}</button>
      </div>
    </form>
  );
}
