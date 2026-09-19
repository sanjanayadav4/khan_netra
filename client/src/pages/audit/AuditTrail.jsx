/**
 * KhanNetra — Digital Audit Trail  v2
 * Full read-only timeline with filters, search, timeline view, export.
 */
import { useState, useEffect, useCallback } from 'react';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { analyticsApi, reportsApi, minesApi } from '../../services/api';
import { formatDateTime, downloadBlob, timeAgo } from '../../utils/helpers';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  FiBook, FiDownload, FiSearch, FiRefreshCw, FiClock,
  FiUser, FiFilter, FiList, FiActivity,
} from 'react-icons/fi';

/* ── Action config ──────────────────────────────────────────────── */
const ACTION_CFG = {
  CREATE:            { color:'green',  bg:'bg-green-500/15  text-green-400',  icon:'➕' },
  UPDATE:            { color:'blue',   bg:'bg-blue-500/15   text-blue-400',   icon:'✏️' },
  DELETE:            { color:'red',    bg:'bg-red-500/15    text-red-400',    icon:'🗑' },
  LOGIN:             { color:'gray',   bg:'bg-gray-500/15   text-gray-400',   icon:'🔑' },
  LOGOUT:            { color:'gray',   bg:'bg-gray-500/15   text-gray-400',   icon:'🚪' },
  UPLOAD:            { color:'purple', bg:'bg-purple-500/15 text-purple-400', icon:'📤' },
  APPROVE:           { color:'green',  bg:'bg-green-500/15  text-green-400',  icon:'✅' },
  REJECT:            { color:'red',    bg:'bg-red-500/15    text-red-400',    icon:'❌' },
  ACKNOWLEDGE:       { color:'yellow', bg:'bg-amber-500/15  text-amber-400',  icon:'👁' },
  RESOLVE:           { color:'green',  bg:'bg-green-500/15  text-green-400',  icon:'✓'  },
  REPORT_EXPORT:     { color:'blue',   bg:'bg-blue-500/15   text-blue-400',   icon:'📊' },
  OCR_EXTRACT:       { color:'purple', bg:'bg-purple-500/15 text-purple-400', icon:'🔍' },
  OCR_SAVE:          { color:'purple', bg:'bg-purple-500/15 text-purple-400', icon:'💾' },
  BULK_ATTENDANCE:   { color:'teal',   bg:'bg-teal-500/15   text-teal-400',   icon:'👥' },
  CREATE_MANUAL_ALERT:{ color:'red',   bg:'bg-red-500/15    text-red-400',    icon:'🚨' },
};
const actionCfg = (action) => ACTION_CFG[action] || { color:'gray', bg:'bg-gray-500/15 text-gray-400', icon:'📝' };

const ENTITY_ICONS = {
  mine:'⛏', violation:'⚠️', incident:'🚨', inspection:'📋', document:'📄',
  user:'👤', auth:'🔑', compliance:'✅', worker:'👷', contractor:'🏗',
  report:'📊', ocr_extraction:'🔍', disaster_alert:'🚨', production_record:'📈',
  attendance:'👥', safety_observation:'👁', corrective_action:'🔧',
};

const MODULE_LABELS = [
  'mine','violation','incident','inspection','document','user','auth',
  'compliance','worker','contractor','report','ocr_extraction',
  'disaster_alert','production_record','attendance','safety_observation',
  'corrective_action',
];

const ACTIONS = [
  'CREATE','UPDATE','DELETE','LOGIN','LOGOUT','UPLOAD','APPROVE','REJECT',
  'ACKNOWLEDGE','RESOLVE','REPORT_EXPORT','OCR_EXTRACT','OCR_SAVE',
  'BULK_ATTENDANCE','CREATE_MANUAL_ALERT',
];

export default function AuditTrail() {
  const { user } = useAuthStore();
  const [logs,       setLogs]       = useState([]);
  const [mines,      setMines]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [pagination, setPagination] = useState({});
  const [page,       setPage]       = useState(1);
  const [view,       setView]       = useState('table'); // 'table' | 'timeline'
  const [filters,    setFilters]    = useState({
    action:'', entity_type:'', mine_id:'',
    from_date:'', to_date:'', search:'',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await analyticsApi.getAuditLogs({
        ...filters, page, limit: 30,
        ...(filters.mine_id ? { mine_id: filters.mine_id } : {}),
      });
      setLogs(r.data || []);
      setPagination(r.pagination || {});
    } catch { toast.error('Failed to load audit logs'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{});
  }, []);

  const setF = (k, v) => { setFilters(f=>({...f,[k]:v})); setPage(1); };

  const dlExcel = async () => {
    try {
      const r = await reportsApi.downloadExcel({ type:'audit' });
      downloadBlob(r, 'KhanNetra-AuditTrail.xlsx');
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="space-y-5"><BackButton className="mb-1"/>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiBook className="text-amber-500"/> Digital Audit Trail</h1>
          <p className="page-subtitle">Tamper-evident, chronological record of every significant action in KhanNetra</p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-xl p-0.5 gap-0.5">
            {[{v:'table',Icon:FiList},{v:'timeline',Icon:FiActivity}].map(({v,Icon})=>(
              <button key={v} onClick={()=>setView(v)}
                className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  view===v?'bg-[var(--bg-card)] text-amber-500 shadow-sm':'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
                <Icon size={13}/>
              </button>
            ))}
          </div>
          <button onClick={load} className="btn-outline btn-sm"><FiRefreshCw size={13}/></button>
          {['admin','government_officer','inspector'].includes(user?.role) && (
            <button onClick={dlExcel} className="btn-outline btn-sm"><FiDownload size={13}/> Export</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card-sm space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="form-group mb-0 relative flex-1 min-w-44">
            <label className="label">Search</label>
            <div className="relative">
              <FiSearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{color:'var(--text-muted)'}}/>
              <input value={filters.search} onChange={e=>setF('search',e.target.value)}
                placeholder="Description, user, entity…" className="input pl-8 text-sm"/>
            </div>
          </div>
          <div className="form-group mb-0">
            <label className="label">Action</label>
            <select value={filters.action} onChange={e=>setF('action',e.target.value)} className="select w-40">
              <option value="">All Actions</option>
              {ACTIONS.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">Module</label>
            <select value={filters.entity_type} onChange={e=>setF('entity_type',e.target.value)} className="select w-40">
              <option value="">All Modules</option>
              {MODULE_LABELS.map(e=><option key={e} value={e}>{e.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">Mine</label>
            <select value={filters.mine_id} onChange={e=>setF('mine_id',e.target.value)} className="select w-44">
              <option value="">All Mines</option>
              {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="form-group mb-0">
            <label className="label">From Date</label>
            <input type="date" value={filters.from_date} onChange={e=>setF('from_date',e.target.value)} className="input w-40"/>
          </div>
          <div className="form-group mb-0">
            <label className="label">To Date</label>
            <input type="date" value={filters.to_date} onChange={e=>setF('to_date',e.target.value)} className="input w-40"/>
          </div>
          <button onClick={()=>{ setFilters({action:'',entity_type:'',mine_id:'',from_date:'',to_date:'',search:''}); setPage(1); }}
            className="btn-outline btn-sm self-end">Clear</button>
        </div>
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="flex items-center gap-4 text-xs" style={{color:'var(--text-muted)'}}>
          <span>Showing {logs.length} of {pagination.total || 0} records</span>
          <span>Page {page} of {pagination.pages || 1}</span>
        </div>
      )}

      {loading ? <PageLoader/> : logs.length === 0 ? (
        <EmptyState icon={FiBook} title="No audit records found" description="Try adjusting your filters"/>
      ) : view === 'timeline' ? (
        /* ── TIMELINE VIEW ── */
        <div className="relative space-y-0 pl-8">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-[var(--border)]"/>
          {logs.map((log, idx) => {
            const cfg = actionCfg(log.action);
            return (
              <div key={log.id} className="relative pb-4">
                {/* Dot */}
                <div className={clsx('absolute -left-5 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px]',
                  'bg-[var(--bg-card)] border-[var(--border)]')}>
                  {cfg.icon}
                </div>
                <div className="card-sm ml-2 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx('inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold', cfg.bg)}>{log.action}</span>
                      <span className="text-xs font-semibold" style={{color:'var(--text-primary)'}}>{(ENTITY_ICONS[log.entity_type]||'📁')} {log.entity_type?.replace(/_/g,' ')}</span>
                      {log.mine_name && <span className="text-[11px]" style={{color:'var(--text-muted)'}}>⛏ {log.mine_name}</span>}
                    </div>
                    <span className="text-[11px] font-mono" style={{color:'var(--text-muted)'}}>{formatDateTime(log.created_at)}</span>
                  </div>
                  <p className="text-xs mt-1.5" style={{color:'var(--text-secondary)'}}>{log.description || '—'}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{color:'var(--text-muted)'}}>
                    <span className="flex items-center gap-1"><FiUser size={10}/>{log.full_name||'System'}</span>
                    {log.role && <Badge color="gray">{log.role.replace(/_/g,' ')}</Badge>}
                    {log.ip_address && <span className="font-mono">{log.ip_address}</span>}
                    <span className="ml-auto">{timeAgo(log.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── TABLE VIEW ── */
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Module</th><th>Description</th><th>Mine</th><th>IP</th></tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const cfg = actionCfg(log.action);
                return (
                  <tr key={log.id}>
                    <td>
                      <p className="text-[11px] font-mono whitespace-nowrap" style={{color:'var(--text-secondary)'}}>{formatDateTime(log.created_at)}</p>
                      <p className="text-[10px]" style={{color:'var(--text-muted)'}}>{timeAgo(log.created_at)}</p>
                    </td>
                    <td>
                      <p className="text-sm font-semibold" style={{color:'var(--text-primary)'}}>{log.full_name||'System'}</p>
                    </td>
                    <td>{log.role && <Badge color="gray">{log.role.replace(/_/g,' ')}</Badge>}</td>
                    <td>
                      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap', cfg.bg)}>
                        {cfg.icon} {log.action}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs font-semibold capitalize" style={{color:'var(--text-secondary)'}}>
                        {ENTITY_ICONS[log.entity_type]||'📁'} {log.entity_type?.replace(/_/g,' ')||'—'}
                      </span>
                    </td>
                    <td className="max-w-[220px]">
                      <p className="text-xs truncate" style={{color:'var(--text-muted)'}} title={log.description}>{log.description||'—'}</p>
                    </td>
                    <td><span className="text-xs" style={{color:'var(--text-muted)'}}>{log.mine_name||'—'}</span></td>
                    <td><span className="font-mono text-[10px]" style={{color:'var(--text-muted)'}}>{log.ip_address||'—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{color:'var(--text-muted)'}}>Page {page} of {pagination.pages} · {pagination.total} records</p>
          <div className="flex gap-1.5">
            {page>1 && <button onClick={()=>setPage(p=>p-1)} className="btn-outline btn-sm">← Prev</button>}
            {page<pagination.pages && <button onClick={()=>setPage(p=>p+1)} className="btn-primary btn-sm">Next →</button>}
          </div>
        </div>
      )}
    </div>
  );
}
