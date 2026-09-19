/**
 * KhanNetra — Mine Management
 * Table + Map views, autocomplete search, filters, pagination, Add/Edit mine.
 * Uses CSS variables for full light/dark theme compatibility.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import BackButton from '../../components/ui/BackButton';
import { Link } from 'react-router-dom';
import {
  FiPlus, FiSearch, FiMapPin, FiEye, FiEdit2,
  FiMap, FiList, FiX, FiChevronRight,
} from 'react-icons/fi';
import { minesApi } from '../../services/api';
import { formatDate, formatMT, scoreToColor, getStatusColor } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import ScoreBar from '../../components/ui/ScoreBar';
import Modal from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import MineForm from './MineForm';
import MineMap from './MineMap';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

export default function Mines() {
  const { user } = useAuthStore();

  const [mines,      setMines]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState('table');
  const [search,     setSearch]     = useState('');
  const [statusF,    setStatusF]    = useState('');
  const [stateF,     setStateF]     = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [editMine,   setEditMine]   = useState(null);
  const [page,       setPage]       = useState(1);
  const [pagination, setPagination] = useState({});

  /* ── Autocomplete state ─────────────────────────────────────────── */
  const [acQuery,       setAcQuery]       = useState('');
  const [acResults,     setAcResults]     = useState([]);
  const [acOpen,        setAcOpen]        = useState(false);
  const [acLoading,     setAcLoading]     = useState(false);
  const acRef     = useRef(null);
  const acTimerRef = useRef(null);

  const canCreate = ['admin','government_officer'].includes(user?.role);
  const canEdit   = ['admin','government_officer','mine_manager'].includes(user?.role);

  /* ── Load mines list ────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await minesApi.getAll({ search, status: statusF, state: stateF, page, limit: 15 });
      setMines(r.data || []);
      setPagination(r.pagination || {});
    } catch {} finally { setLoading(false); }
  }, [search, statusF, stateF, page]);

  useEffect(() => { load(); }, [load]);

  /* ── Autocomplete fetch (debounced 250ms) ───────────────────────── */
  useEffect(() => {
    clearTimeout(acTimerRef.current);
    if (!acQuery.trim() || acQuery.length < 2) { setAcResults([]); setAcOpen(false); return; }
    setAcLoading(true);
    acTimerRef.current = setTimeout(async () => {
      try {
        const r = await minesApi.search(acQuery);
        setAcResults(r.data || []);
        setAcOpen(true);
      } catch { setAcResults([]); }
      finally { setAcLoading(false); }
    }, 250);
    return () => clearTimeout(acTimerRef.current);
  }, [acQuery]);

  /* ── Close autocomplete on outside click ───────────────────────── */
  useEffect(() => {
    const h = (e) => { if (acRef.current && !acRef.current.contains(e.target)) setAcOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleAcSelect = (mine) => {
    setSearch(mine.name);
    setAcQuery(mine.name);
    setAcOpen(false);
    setPage(1);
  };

  const handleSearchClear = () => {
    setSearch(''); setAcQuery(''); setAcResults([]); setAcOpen(false); setPage(1);
  };

  const handleSave = () => { setShowForm(false); setEditMine(null); load(); };

  /* ── Score colour for risk (inverted — lower = better) ─────────── */
  const riskColor = (v) => {
    const n = parseFloat(v || 0);
    return n >= 70 ? 'text-red-600' : n >= 40 ? 'text-amber-600' : 'text-green-600';
  };
  const riskBarColor = (v) => {
    const n = parseFloat(v || 0);
    return n >= 70 ? 'bg-red-500' : n >= 40 ? 'bg-amber-500' : 'bg-green-500';
  };

  return (
    <div className="space-y-5">
      <BackButton className="mb-1"/>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiMapPin style={{ color:'var(--accent)' }}/> Mine Management
          </h1>
          <p className="page-subtitle">Monitor and manage all registered coal mines across India</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl p-1 gap-0.5"
            style={{ backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
            <button onClick={() => setView('table')}
              className="p-2 rounded-lg transition-all"
              style={{
                backgroundColor: view === 'table' ? 'var(--accent-bg)' : 'transparent',
                color:           view === 'table' ? 'var(--accent)'    : 'var(--text-muted)',
              }}>
              <FiList size={16}/>
            </button>
            <button onClick={() => setView('map')}
              className="p-2 rounded-lg transition-all"
              style={{
                backgroundColor: view === 'map' ? 'var(--accent-bg)' : 'transparent',
                color:           view === 'map' ? 'var(--accent)'    : 'var(--text-muted)',
              }}>
              <FiMap size={16}/>
            </button>
          </div>
          {canCreate && (
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <FiPlus size={15}/> Add Mine
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="card-sm flex flex-wrap gap-3">
        {/* Autocomplete search */}
        <div ref={acRef} className="flex-1 min-w-52 relative">
          <FiSearch size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          <input
            value={acQuery}
            onChange={e => { setAcQuery(e.target.value); if (!e.target.value) handleSearchClear(); }}
            onFocus={() => acResults.length && setAcOpen(true)}
            className="input"
            style={{ paddingLeft:36, paddingRight: acQuery ? 32 : 12 }}
            placeholder="Search mines by name, ID, company… (e.g. Jharia)"
          />
          {acQuery && (
            <button onClick={handleSearchClear}
              style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex' }}>
              <FiX size={13}/>
            </button>
          )}

          {/* Dropdown */}
          {acOpen && (
            <div style={{
              position:'absolute', top:'calc(100% + 6px)', left:0, right:0,
              backgroundColor:'var(--bg-card)', border:'1px solid var(--border)',
              borderRadius:12, boxShadow:'var(--shadow-lg)', zIndex:50, overflow:'hidden',
            }}>
              {acLoading ? (
                <div className="flex items-center justify-center py-4 gap-2">
                  <div className="w-4 h-4 rounded-full border-2 animate-spin"
                    style={{ borderColor:'var(--border)', borderTopColor:'var(--accent)' }}/>
                  <span style={{ fontSize:12, color:'var(--text-muted)' }}>Searching…</span>
                </div>
              ) : acResults.length === 0 ? (
                <div className="py-4 px-4 text-center" style={{ fontSize:12, color:'var(--text-muted)' }}>
                  No mines found for "{acQuery}"
                </div>
              ) : acResults.map(m => (
                <button key={m.id} onClick={() => handleAcSelect(m)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                  style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor='var(--hover-accent-bg)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor=''}>
                  {/* Status dot */}
                  <span style={{
                    width:8, height:8, borderRadius:'50%', flexShrink:0,
                    backgroundColor:
                      m.status === 'suspended'        ? '#ef4444' :
                      m.status === 'under_inspection' ? '#f59e0b' :
                      m.status === 'active'           ? '#22c55e' : '#94a3b8',
                  }}/>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontWeight:600, fontSize:13, color:'var(--text-primary)', margin:0 }}>{m.name}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)', margin:'1px 0 0' }}>
                      {m.mine_id} · {m.type} · {m.district}, {m.state}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ fontSize:11, fontWeight:700, color: parseFloat(m.compliance_score)>=80?'#16a34a':parseFloat(m.compliance_score)>=60?'#d97706':'#dc2626' }}>
                      {parseFloat(m.compliance_score||0).toFixed(0)}%
                    </span>
                    <FiChevronRight size={11} style={{ color:'var(--text-muted)' }}/>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }} className="select w-40">
          <option value="">All Status</option>
          {['active','suspended','under_inspection','inactive','closed'].map(s => (
            <option key={s} value={s}>{s.replace('_',' ')}</option>
          ))}
        </select>
        <select value={stateF} onChange={e => { setStateF(e.target.value); setPage(1); }} className="select w-48">
          <option value="">All States</option>
          {['Jharkhand','Chhattisgarh','Odisha','West Bengal','Madhya Pradesh','Telangana','Maharashtra','Bihar'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* ── Map view ───────────────────────────────────────────────── */}
      {view === 'map' && (
        <div className="card p-0 overflow-hidden" style={{ height:520, border:'1px solid var(--border)' }}>
          <MineMap mines={mines}/>
        </div>
      )}

      {/* ── Table view ─────────────────────────────────────────────── */}
      {view === 'table' && (
        <>
          {loading ? <PageLoader/> : mines.length === 0 ? (
            <EmptyState icon={FiMapPin} title="No mines found"
              message="Try adjusting your search or filters."
              action={canCreate && (
                <button onClick={() => setShowForm(true)} className="btn-primary">Add First Mine</button>
              )}
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mine</th>
                    <th>Type / State</th>
                    <th>Status</th>
                    <th>Compliance</th>
                    <th>Risk</th>
                    <th>License Expiry</th>
                    <th>Workers</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mines.map(mine => {
                    const licExpired = mine.license_expiry && new Date(mine.license_expiry) < new Date();
                    const licSoon    = !licExpired && mine.license_expiry && new Date(mine.license_expiry) < new Date(Date.now() + 90*864e5);
                    return (
                      <tr key={mine.id}>
                        <td>
                          <div>
                            <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{mine.name}</p>
                            <p className="text-[11px] font-mono mt-0.5" style={{ color:'var(--text-muted)' }}>
                              {mine.mine_id} · {mine.owner_company}
                            </p>
                          </div>
                        </td>
                        <td>
                          <Badge color={mine.type === 'Underground' ? 'blue' : 'green'}>{mine.type}</Badge>
                          <p className="text-[11px] mt-1" style={{ color:'var(--text-muted)' }}>{mine.state}</p>
                        </td>
                        <td>
                          <Badge color={getStatusColor(mine.status)} dot>
                            {mine.status.replace(/_/g,' ')}
                          </Badge>
                        </td>
                        <td>
                          <div className="w-24">
                            <span className={clsx('text-xs font-bold', scoreToColor(mine.compliance_score))}>
                              {parseFloat(mine.compliance_score).toFixed(1)}%
                            </span>
                            <ScoreBar score={mine.compliance_score} showLabel={false} height="h-1.5"/>
                          </div>
                        </td>
                        <td>
                          <div className="w-20">
                            <span className={clsx('text-xs font-bold', riskColor(mine.risk_score))}>
                              {parseFloat(mine.risk_score).toFixed(1)}%
                            </span>
                            <div className="score-bar-track mt-1">
                              <div className={clsx('score-bar-fill', riskBarColor(mine.risk_score))}
                                style={{ width:`${mine.risk_score}%` }}/>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={clsx('text-xs font-semibold',
                            licExpired ? 'text-red-600' : licSoon ? 'text-amber-600' : '')}
                            style={!licExpired && !licSoon ? { color:'var(--text-secondary)' } : {}}>
                            {formatDate(mine.license_expiry)}
                            {licExpired && ' ⛔'}
                            {licSoon && !licExpired && ' ⚠️'}
                          </span>
                        </td>
                        <td>
                          <span className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>
                            {mine.workers_count?.toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <Link to={`/mines/${mine.id}`}
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color:'var(--text-muted)' }}
                              onMouseEnter={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.backgroundColor='var(--accent-bg)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.backgroundColor=''; }}
                              title="View Mine Profile">
                              <FiEye size={14}/>
                            </Link>
                            {canEdit && (
                              <button
                                onClick={() => { setEditMine(mine); setShowForm(true); }}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ color:'var(--text-muted)' }}
                                onMouseEnter={e => { e.currentTarget.style.color='var(--blue)'; e.currentTarget.style.backgroundColor='var(--blue-bg)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.backgroundColor=''; }}
                                title="Edit Mine">
                                <FiEdit2 size={14}/>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs" style={{ color:'var(--text-muted)' }}>
                {mines.length} of {pagination.total} mines
              </p>
              <div className="flex gap-1.5">
                {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className="w-8 h-8 rounded-lg text-xs font-bold transition-all"
                    style={{
                      backgroundColor: p === page ? 'var(--accent)' : 'var(--bg-card-hover)',
                      color:           p === page ? '#fff'          : 'var(--text-muted)',
                      border:          p === page ? 'none'          : '1px solid var(--border)',
                    }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditMine(null); }}
        title={editMine ? `Edit — ${editMine.name}` : 'Add New Mine'}
        size="lg">
        <MineForm mine={editMine} onSave={handleSave} onCancel={() => { setShowForm(false); setEditMine(null); }}/>
      </Modal>
    </div>
  );
}
