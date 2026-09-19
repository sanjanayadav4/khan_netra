/**
 * KhanNetra DGMS — Inspection Management
 * Full SIH workflow:
 *   Schedule → In Progress → Digital Checklist (Pass/Fail/N/A + geo-tag + photo)
 *   → Results (score, risk level) → Corrective Actions → History
 *
 * Tabs: Dashboard | Schedule | Conduct | History
 * All data from real backend. No fake data.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FiPlus, FiClipboard, FiEye, FiEdit2, FiCalendar, FiCheck, FiX,
  FiAlertTriangle, FiMapPin, FiCamera, FiUpload, FiSearch,
  FiRefreshCw, FiChevronRight, FiShield, FiTool, FiFeather,
  FiUsers, FiBarChart2, FiClock, FiCheckSquare, FiAlertOctagon,
} from 'react-icons/fi';
import { inspectionsApi, minesApi, aiApi } from '../../services/api';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import ScoreBar from '../../components/ui/ScoreBar';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import useAuthStore from '../../store/authStore';
import { formatDate, formatDateTime, timeAgo } from '../../utils/helpers';

/* ══════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════ */
const STATUS_COLOR = {
  scheduled: 'blue', in_progress: 'yellow', completed: 'green',
  cancelled: 'gray', rescheduled: 'orange',
};

const RISK_COLOR = { Low:'green', Medium:'yellow', High:'orange', Critical:'red' };

const INSPECTION_TYPES = [
  'Routine Safety', 'Environmental Compliance', 'Labour Inspection',
  'Machinery & Equipment', 'Special Investigation', 'Emergency Inspection',
  'Quarterly Review', 'Annual Audit',
];

/* Digital checklist — 4 SIH categories */
const CHECKLIST_TEMPLATE = [
  /* Safety / PPE */
  { category:'Safety/PPE', item_description:'Helmet (Hard Hat) worn by all workers', result:'na', observation:'', evidence_photo:null },
  { category:'Safety/PPE', item_description:'Safety Shoes / Gumboots in use', result:'na', observation:'', evidence_photo:null },
  { category:'Safety/PPE', item_description:'Gloves and Hand Protection available', result:'na', observation:'', evidence_photo:null },
  { category:'Safety/PPE', item_description:'Reflective Jacket / Hi-Vis Vest worn', result:'na', observation:'', evidence_photo:null },
  { category:'Safety/PPE', item_description:'Emergency Exits clearly marked and accessible', result:'na', observation:'', evidence_photo:null },
  { category:'Safety/PPE', item_description:'Fire extinguishers present, charged and accessible', result:'na', observation:'', evidence_photo:null },
  { category:'Safety/PPE', item_description:'First Aid kits stocked and accessible', result:'na', observation:'', evidence_photo:null },
  { category:'Safety/PPE', item_description:'Safety Signage and Warnings visible', result:'na', observation:'', evidence_photo:null },
  /* Machinery */
  { category:'Machinery', item_description:'Machine Maintenance logs up to date', result:'na', observation:'', evidence_photo:null },
  { category:'Machinery', item_description:'Safety Guards on all moving parts', result:'na', observation:'', evidence_photo:null },
  { category:'Machinery', item_description:'Emergency Stop Switches functional', result:'na', observation:'', evidence_photo:null },
  { category:'Machinery', item_description:'Equipment Condition satisfactory (no visible damage)', result:'na', observation:'', evidence_photo:null },
  { category:'Machinery', item_description:'Electrical systems earthed and safe', result:'na', observation:'', evidence_photo:null },
  /* Environment */
  { category:'Environment', item_description:'Dust Suppression systems operational', result:'na', observation:'', evidence_photo:null },
  { category:'Environment', item_description:'Air Quality within permissible limits (CH4 < 0.5%)', result:'na', observation:'', evidence_photo:null },
  { category:'Environment', item_description:'Water Monitoring at discharge point', result:'na', observation:'', evidence_photo:null },
  { category:'Environment', item_description:'Noise levels within permissible limits', result:'na', observation:'', evidence_photo:null },
  { category:'Environment', item_description:'Waste disposal in designated areas only', result:'na', observation:'', evidence_photo:null },
  /* Labour */
  { category:'Labour', item_description:'Attendance Register maintained', result:'na', observation:'', evidence_photo:null },
  { category:'Labour', item_description:'Working Hours compliant (8 hr shift max)', result:'na', observation:'', evidence_photo:null },
  { category:'Labour', item_description:'Safety Training Records available', result:'na', observation:'', evidence_photo:null },
  { category:'Labour', item_description:'Contractor Worker Registration complete', result:'na', observation:'', evidence_photo:null },
  { category:'Labour', item_description:'Medical Fitness Certificates current', result:'na', observation:'', evidence_photo:null },
];

/* Score / risk helpers */
const scoreColor = (v) => parseFloat(v) >= 80 ? '#16a34a' : parseFloat(v) >= 60 ? '#d97706' : '#dc2626';

function calcResults(items) {
  const counted = items.filter(i => i.result !== 'na');
  const passed  = items.filter(i => i.result === 'pass').length;
  const failed  = items.filter(i => i.result === 'fail').length;
  const na      = items.filter(i => i.result === 'na').length;
  const score   = counted.length ? Math.round((passed / counted.length) * 100) : 0;
  const failRate= counted.length ? failed / counted.length : 0;
  const risk    = score >= 80 && failRate < 0.1 ? 'Low'
    : score >= 60 && failRate < 0.3 ? 'Medium'
    : score >= 40 ? 'High' : 'Critical';
  return { score, risk, passed, failed, na, total: items.length, counted: counted.length };
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function Inspections() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();

  const [tab,          setTab]          = useState('dashboard');
  const [inspections,  setInspections]  = useState([]);
  const [stats,        setStats]        = useState(null);
  const [mines,        setMines]        = useState([]);
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filters,      setFilters]      = useState({
    status: '', type: '', mine_id: searchParams.get('mine_id') || '',
  });
  const [search,       setSearch]       = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [viewItem,     setViewItem]     = useState(null);
  const [conductItem,  setConductItem]  = useState(null);   // inspection being conducted
  const [checklist,    setChecklist]    = useState(CHECKLIST_TEMPLATE);
  const [geoData,      setGeoData]      = useState(null);
  const [geoLoading,   setGeoLoading]   = useState(false);

  const canCreate  = ['admin','government_officer','inspector'].includes(user?.role);
  const canConduct = ['admin','government_officer','inspector','safety_officer','mine_manager'].includes(user?.role);

  /* ── Load ──────────────────────────────────────────────────────── */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [ins, st] = await Promise.allSettled([
        inspectionsApi.getAll(filters),
        inspectionsApi.getStats({ mine_id: filters.mine_id || undefined }),
      ]);
      setInspections(ins.status === 'fulfilled' ? (ins.value?.data || []) : []);
      setStats(st.status === 'fulfilled' ? st.value?.data : null);
    } catch {}
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    minesApi.getAll({ limit: 100 }).then(r => setMines(r.data || [])).catch(() => {});
    // Load inspectors for assignment
    aiApi.getUsers && aiApi.getUsers().then(r =>
      setUsers((r.data || []).filter(u => ['admin','government_officer','inspector','safety_officer'].includes(u.role)))
    ).catch(() => {});
  }, []);

  /* ── Geo-tag ───────────────────────────────────────────────────── */
  const captureGeo = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoData({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          captured_at: new Date().toISOString(),
        });
        toast.success(`Location captured (±${Math.round(pos.coords.accuracy)}m)`);
        setGeoLoading(false);
      },
      (err) => {
        const msg = err.code === 1 ? 'Location permission denied'
          : err.code === 2 ? 'Location unavailable'
          : 'Location request timed out';
        toast.error(msg + ' — inspection will proceed without geo-tag');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  /* ── Open full detail ──────────────────────────────────────────── */
  const openDetail = async (id) => {
    try {
      const r = await inspectionsApi.getById(id);
      setViewItem(r.data || r);
    } catch { toast.error('Failed to load inspection details'); }
  };

  /* ── Start conducting an inspection ───────────────────────────── */
  const startConduct = async (ins) => {
    setConductItem(ins);
    setGeoData(null);
    // Pre-fill checklist from existing if any
    try {
      const r = await inspectionsApi.getById(ins.id);
      const existing = (r.data || r)?.checklist;
      if (existing && existing.length > 0) {
        setChecklist(existing.map(item => ({
          ...item,
          result: item.result || (item.is_compliant === 1 ? 'pass' : item.is_compliant === 0 ? 'fail' : 'na'),
          observation: item.observation || '',
          evidence_photo: item.evidence_photo || null,
        })));
      } else {
        setChecklist(CHECKLIST_TEMPLATE.map(t => ({ ...t })));
      }
    } catch {
      setChecklist(CHECKLIST_TEMPLATE.map(t => ({ ...t })));
    }
    // Mark as in_progress
    await inspectionsApi.update(ins.id, { status: 'in_progress' }).catch(() => {});
    load(true);
  };

  /* ── Save checklist ────────────────────────────────────────────── */
  const saveChecklist = async (complete = false) => {
    try {
      const r = await inspectionsApi.saveChecklist({ inspection_id: conductItem.id, items: checklist });
      const results = r.data || {};

      // Save geo + notes if captured
      const updatePayload = {};
      if (geoData) {
        updatePayload.gps_lat        = geoData.lat;
        updatePayload.gps_lon        = geoData.lon;
        updatePayload.gps_captured_at= geoData.captured_at;
      }
      if (complete) {
        updatePayload.status         = 'completed';
        updatePayload.risk_level     = results.risk_level;
      }
      if (Object.keys(updatePayload).length) {
        await inspectionsApi.update(conductItem.id, updatePayload);
      }

      toast.success(complete ? 'Inspection completed!' : 'Checklist saved');
      if (complete) setConductItem(null);
      load(true);
    } catch { toast.error('Failed to save checklist'); }
  };

  /* ── Update checklist item ─────────────────────────────────────── */
  const updateItem = (idx, field, value) => {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  /* ── Upload photo for a checklist item ─────────────────────────── */
  const uploadItemPhoto = async (idx, file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const r = await inspectionsApi.uploadPhoto(conductItem.id, fd);
      const path = r.data?.file_path || r.file_path;
      updateItem(idx, 'evidence_photo', path);
      toast.success('Photo uploaded');
    } catch { toast.error('Photo upload failed'); }
  };

  /* ── Filtered list ─────────────────────────────────────────────── */
  const filtered = inspections.filter(ins => {
    const q = search.toLowerCase();
    return !q || ins.inspection_number?.toLowerCase().includes(q)
      || ins.mine_name?.toLowerCase().includes(q)
      || ins.type?.toLowerCase().includes(q)
      || ins.inspector_name?.toLowerCase().includes(q);
  });

  const results = calcResults(checklist);

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      <BackButton/>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiClipboard style={{ color:'var(--accent)' }}/> Inspection Management
          </h1>
          <p className="page-subtitle">
            Schedule, conduct and manage mine inspections with digital checklists and geo-tagging
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filters.mine_id} onChange={e => setFilters(f => ({ ...f, mine_id: e.target.value }))} className="select w-44">
            <option value="">All Mines</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={() => load(true)} className="btn-outline btn-sm">
            <FiRefreshCw size={13}/> Refresh
          </button>
          {canCreate && (
            <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
              <FiPlus size={13}/> Schedule Inspection
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id:'dashboard', label:'Dashboard'                              },
          { id:'list',      label:`All Inspections (${filtered.length})`  },
          { id:'schedule',  label:'Upcoming'                              },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('tab-item', tab === t.id && 'active')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <PageLoader message="Loading inspections…"/> : (
        <>
          {/* ══ DASHBOARD TAB ══ */}
          {tab === 'dashboard' && <DashboardTab stats={stats}/>}

          {/* ══ LIST TAB ══ */}
          {tab === 'list' && (
            <ListTab
              inspections={filtered}
              filters={filters}
              setFilters={setFilters}
              search={search}
              setSearch={setSearch}
              canConduct={canConduct}
              onView={openDetail}
              onConduct={startConduct}
              user={user}
            />
          )}

          {/* ══ SCHEDULE TAB ══ */}
          {tab === 'schedule' && <ScheduleTab mine_id={filters.mine_id}/>}
        </>
      )}

      {/* ── Schedule modal ─────────────────────────────────────────── */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)}
        title="Schedule New Inspection" size="md">
        <ScheduleForm mines={mines} users={users}
          onSave={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}/>
      </Modal>

      {/* ── Detail modal ───────────────────────────────────────────── */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)}
        title={`Inspection ${viewItem?.inspection_number}`} size="lg">
        {viewItem && (
          <InspectionDetail
            ins={viewItem}
            canConduct={canConduct}
            onConduct={() => { setViewItem(null); startConduct(viewItem); }}
            onRefresh={() => openDetail(viewItem.id)}
            user={user}
          />
        )}
      </Modal>

      {/* ── Conduct / Checklist modal ───────────────────────────────── */}
      <Modal isOpen={!!conductItem} onClose={() => setConductItem(null)}
        title={`Conducting: ${conductItem?.inspection_number}`} size="xl">
        {conductItem && (
          <ConductChecklist
            ins={conductItem}
            checklist={checklist}
            updateItem={updateItem}
            uploadItemPhoto={uploadItemPhoto}
            geoData={geoData}
            geoLoading={geoLoading}
            captureGeo={captureGeo}
            results={results}
            onSave={() => saveChecklist(false)}
            onComplete={() => saveChecklist(true)}
            onClose={() => setConductItem(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
════════════════════════════════════════════════════════════════════ */
function DashboardTab({ stats }) {
  if (!stats) return (
    <div className="card text-center py-12">
      <FiClipboard size={32} style={{ color:'var(--text-muted)', margin:'0 auto 12px' }}/>
      <p style={{ color:'var(--text-muted)' }}>No inspection data available.</p>
    </div>
  );
  const kpis = [
    { label:'Total',        value:stats.total       || 0, color:'#3b82f6' },
    { label:'Scheduled',    value:stats.scheduled   || 0, color:'#6366f1' },
    { label:'In Progress',  value:stats.in_progress || 0, color:'#f59e0b' },
    { label:'Completed',    value:stats.completed   || 0, color:'#16a34a' },
    { label:'Follow-up',    value:stats.follow_up   || 0, color:'#dc2626' },
    { label:'Avg Score',    value:stats.avg_score ? `${parseFloat(stats.avg_score).toFixed(0)}%` : '—', color:scoreColor(stats.avg_score||0) },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="card p-3 text-center">
            <p style={{ fontSize:24, fontWeight:900, color:k.color, margin:0 }}>{k.value}</p>
            <p style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', margin:'3px 0 0' }}>{k.label}</p>
          </div>
        ))}
      </div>
      {stats.by_type?.length > 0 && (
        <div className="card">
          <h3 className="section-title">By Inspection Type</h3>
          <div className="space-y-2">
            {stats.by_type.map(t => (
              <div key={t.type} className="flex items-center justify-between py-2" style={{ borderBottom:'1px solid var(--border)' }}>
                <span className="text-sm" style={{ color:'var(--text-secondary)' }}>{t.type}</span>
                <span style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)' }}>{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   LIST TAB
════════════════════════════════════════════════════════════════════ */
function ListTab({ inspections, filters, setFilters, search, setSearch, canConduct, onView, onConduct, user }) {
  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="card-sm flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input" style={{ paddingLeft:32 }}
            placeholder="Search by ID, mine, type, inspector…"/>
        </div>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status:e.target.value }))}
          className="select" style={{ width:'auto' }}>
          <option value="">All Status</option>
          {['scheduled','in_progress','completed','cancelled','rescheduled'].map(s =>
            <option key={s} value={s}>{s.replace('_',' ')}</option>
          )}
        </select>
        <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type:e.target.value }))}
          className="select" style={{ width:'auto' }}>
          <option value="">All Types</option>
          {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {inspections.length === 0 ? (
        <EmptyState icon={FiClipboard} title="No inspections found"/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Inspection #</th><th>Mine</th><th>Type</th><th>Inspector</th>
                <th>Scheduled</th><th>Score / Risk</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map(ins => (
                <tr key={ins.id} style={{ cursor:'pointer' }} onClick={() => onView(ins.id)}>
                  <td>
                    <span className="font-mono text-xs font-bold" style={{ color:'var(--text-primary)' }}>
                      {ins.inspection_number}
                    </span>
                  </td>
                  <td>
                    <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{ins.mine_name}</p>
                    <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{ins.state}</p>
                  </td>
                  <td><span className="text-sm" style={{ color:'var(--text-secondary)' }}>{ins.type}</span></td>
                  <td><span className="text-sm" style={{ color:'var(--text-secondary)' }}>{ins.inspector_name || '—'}</span></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <FiCalendar size={11} style={{ color:'var(--text-muted)' }}/>
                      <span className="text-xs" style={{ color:'var(--text-secondary)' }}>{formatDate(ins.scheduled_date)}</span>
                    </div>
                  </td>
                  <td>
                    {ins.overall_score ? (
                      <div>
                        <span style={{ fontSize:12, fontWeight:800, color:scoreColor(ins.overall_score) }}>
                          {parseFloat(ins.overall_score).toFixed(0)}%
                        </span>
                        {ins.risk_level && (
                          <Badge color={RISK_COLOR[ins.risk_level]||'gray'} className="ml-1">{ins.risk_level}</Badge>
                        )}
                        <ScoreBar score={ins.overall_score} showLabel={false} height="h-1.5"/>
                      </div>
                    ) : <span className="text-xs" style={{ color:'var(--text-muted)' }}>Pending</span>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <Badge color={STATUS_COLOR[ins.status]||'gray'} dot>{ins.status?.replace('_',' ')}</Badge>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => onView(ins.id)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color:'var(--text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.background='var(--accent-bg)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background=''; }}
                        title="View Details">
                        <FiEye size={14}/>
                      </button>
                      {canConduct && ['scheduled','in_progress'].includes(ins.status) && (
                        <button onClick={() => onConduct(ins)}
                          style={{ padding:'4px 8px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.3)', color:'#16a34a', display:'flex', alignItems:'center', gap:4 }}
                          title="Conduct Inspection">
                          <FiClipboard size={12}/> Conduct
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SCHEDULE TAB — upcoming inspections
════════════════════════════════════════════════════════════════════ */
function ScheduleTab({ mine_id }) {
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    inspectionsApi.getSchedule({ days: 30, mine_id: mine_id || undefined })
      .then(r => setUpcoming(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mine_id]);

  if (loading) return <PageLoader message="Loading schedule…"/>;

  return (
    <div className="space-y-3">
      {upcoming.length === 0 ? (
        <EmptyState icon={FiCalendar} title="No upcoming inspections in next 30 days"/>
      ) : upcoming.map(ins => {
        const daysLeft = Math.round((new Date(ins.scheduled_date) - new Date()) / 86400000);
        const urgColor = daysLeft <= 1 ? '#dc2626' : daysLeft <= 7 ? '#d97706' : '#16a34a';
        return (
          <div key={ins.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold" style={{ color:'var(--text-muted)' }}>{ins.inspection_number}</span>
                  <Badge color={STATUS_COLOR[ins.status]||'blue'} dot>{ins.status}</Badge>
                </div>
                <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{ins.mine_name}</p>
                <p className="text-xs" style={{ color:'var(--text-muted)' }}>{ins.type} · Inspector: {ins.inspector_name||'—'}</p>
              </div>
              <div className="text-right">
                <p style={{ fontSize:11, fontWeight:700, color:urgColor, padding:'2px 10px', borderRadius:999, background:`${urgColor}12`, border:`1px solid ${urgColor}30`, display:'inline-block', whiteSpace:'nowrap' }}>
                  {daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft} days`}
                </p>
                <p className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>{formatDate(ins.scheduled_date)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   INSPECTION DETAIL MODAL
════════════════════════════════════════════════════════════════════ */
function InspectionDetail({ ins, canConduct, onConduct, onRefresh, user }) {
  const [caList,   setCaList]   = useState(ins.corrective_actions || []);
  const [showCaForm, setShowCaForm] = useState(false);

  const catGroups = {};
  (ins.checklist || []).forEach(item => {
    if (!catGroups[item.category]) catGroups[item.category] = [];
    catGroups[item.category].push(item);
  });

  const catIcon = { 'Safety/PPE':FiShield, Machinery:FiTool, Environment:FiFeather, Labour:FiUsers };

  const passed = (ins.checklist||[]).filter(i => i.result==='pass' || i.is_compliant===1).length;
  const failed = (ins.checklist||[]).filter(i => i.result==='fail' || i.is_compliant===0).length;
  const photos = ins.evidence_photos || [];

  return (
    <div className="space-y-5">
      {/* Header badges */}
      <div className="flex flex-wrap gap-2">
        <Badge color={STATUS_COLOR[ins.status]||'gray'} dot>{ins.status?.replace('_',' ')}</Badge>
        {ins.risk_level && <Badge color={RISK_COLOR[ins.risk_level]||'gray'}>{ins.risk_level} Risk</Badge>}
        {ins.follow_up_required ? <Badge color="orange">Follow-up Required</Badge> : null}
        {ins.checklist_completed ? <Badge color="green">Checklist Done</Badge> : null}
      </div>

      {/* Evidence card / geo-tag */}
      {(ins.location_in_mine || ins.gps_lat || ins.section) && (
        <div className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background:'rgba(59,130,246,.07)', border:'1px solid rgba(59,130,246,.25)' }}>
          <FiMapPin size={14} style={{ color:'#2563eb', flexShrink:0 }}/>
          <div>
            <p className="text-xs font-bold" style={{ color:'#2563eb' }}>Inspection Evidence</p>
            <p className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>
              {ins.section || ins.location_in_mine || 'Mine Site'}
              {ins.scheduled_date && ` · ${formatDate(ins.scheduled_date)}`}
              {ins.inspector_name && ` · ${ins.inspector_name}`}
            </p>
            {ins.gps_lat && (
              <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                📍 GPS: {parseFloat(ins.gps_lat).toFixed(5)}, {parseFloat(ins.gps_lon).toFixed(5)}
                {ins.gps_captured_at && ` · ${formatDateTime(ins.gps_captured_at)}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Score summary */}
      {ins.overall_score && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:'Score',    value:`${parseFloat(ins.overall_score).toFixed(0)}%`, color:scoreColor(ins.overall_score) },
            { label:'Passed',   value: passed, color:'#16a34a' },
            { label:'Failed',   value: failed, color:'#dc2626' },
            { label:'Risk',     value: ins.risk_level||'—', color:ins.risk_level?`var(--${RISK_COLOR[ins.risk_level]||'text-primary'})`:'var(--text-muted)' },
          ].map(k => (
            <div key={k.label} className="card p-3 text-center">
              <p style={{ fontSize:20, fontWeight:900, color:k.color, margin:0 }}>{k.value}</p>
              <p style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', margin:'2px 0 0' }}>{k.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Key details */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          ['Mine',       `${ins.mine_name} (${ins.mine_type})`],
          ['Inspector',  ins.inspector_name || '—'],
          ['Scheduled',  formatDate(ins.scheduled_date)],
          ['Completed',  formatDate(ins.completed_date) || '—'],
          ['Location',   ins.location_in_mine || ins.section || '—'],
          ['Type',       ins.type],
        ].map(([k, v]) => (
          <div key={k} style={{ padding:'8px 10px', borderRadius:8, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 3px' }}>{k}</p>
            <p style={{ fontWeight:600, color:'var(--text-primary)', margin:0, fontSize:12 }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Findings / recommendations */}
      {ins.findings && (
        <div style={{ padding:'12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 4px' }}>Findings</p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{ins.findings}</p>
        </div>
      )}
      {ins.recommendations && (
        <div style={{ padding:'12px', borderRadius:10, backgroundColor:'var(--blue-bg)', border:'1px solid var(--blue-border)' }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--blue)', margin:'0 0 4px' }}>Recommendations</p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{ins.recommendations}</p>
        </div>
      )}

      {/* Checklist grouped by category */}
      {Object.keys(catGroups).length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'var(--text-muted)' }}>
            Checklist ({ins.checklist?.length} items)
          </p>
          {Object.entries(catGroups).map(([cat, items]) => {
            const Icon   = catIcon[cat] || FiClipboard;
            const pCount = items.filter(i => i.result==='pass'||i.is_compliant===1).length;
            const fCount = items.filter(i => i.result==='fail'||i.is_compliant===0).length;
            return (
              <div key={cat} className="card mb-3 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={13} style={{ color:'var(--accent)' }}/>
                  <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{cat}</p>
                  <span style={{ fontSize:10, color:'#16a34a', fontWeight:700 }}>✓{pCount}</span>
                  {fCount > 0 && <span style={{ fontSize:10, color:'#dc2626', fontWeight:700 }}>✗{fCount}</span>}
                </div>
                <div className="space-y-1.5">
                  {items.map((item, i) => {
                    const result = item.result || (item.is_compliant===1?'pass':item.is_compliant===0?'fail':'na');
                    return (
                      <div key={i} className="flex items-start gap-3 p-2 rounded-lg"
                        style={{
                          background: result==='pass'?'rgba(34,197,94,.06)':result==='fail'?'rgba(239,68,68,.06)':'var(--bg-card-hover)',
                          border:     result==='pass'?'1px solid rgba(34,197,94,.25)':result==='fail'?'1px solid rgba(239,68,68,.25)':'1px solid var(--border)',
                        }}>
                        <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>
                          {result==='pass'?'✅':result==='fail'?'❌':'⬜'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs" style={{ color:'var(--text-primary)', fontWeight:result==='fail'?700:400 }}>{item.item_description}</p>
                          {item.observation && <p className="text-[10px] mt-0.5" style={{ color:'#dc2626' }}>⚠ {item.observation}</p>}
                          {item.evidence_photo && <p className="text-[10px] mt-0.5" style={{ color:'#2563eb' }}>📷 Evidence attached</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Evidence photos */}
      {photos.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color:'var(--text-muted)' }}>Evidence Photos</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <a key={i} href={p.path || p} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background:'var(--blue-bg)', border:'1px solid var(--blue-border)', color:'var(--blue)', textDecoration:'none' }}>
                <FiCamera size={11}/> Photo {i+1}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Corrective actions */}
      <CorrectiveActionsSection
        inspectionId={ins.id}
        actions={ins.corrective_actions || []}
        canAdd={['admin','government_officer','inspector','safety_officer','mine_manager'].includes(/* pass user role */ 'inspector')}
        onRefresh={onRefresh}
      />

      {/* Conduct button */}
      {canConduct && ['scheduled','in_progress'].includes(ins.status) && (
        <button onClick={onConduct} className="btn-primary w-full justify-center mt-2">
          <FiClipboard size={14}/> {ins.status==='in_progress'?'Continue Inspection':'Start Inspection'}
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CONDUCT CHECKLIST MODAL
════════════════════════════════════════════════════════════════════ */
function ConductChecklist({ ins, checklist, updateItem, uploadItemPhoto, geoData, geoLoading, captureGeo, results, onSave, onComplete, onClose }) {
  const [activeCategory, setActiveCategory] = useState(null);
  const uploadRef = useRef({});

  const categories = [...new Set(checklist.map(i => i.category))];
  if (!activeCategory && categories.length) setTimeout(() => setActiveCategory(categories[0]), 0);

  const catItems  = checklist.filter(i => i.category === activeCategory);
  const catIndex  = (cat) => checklist.filter(i => i.category === cat);
  const catScore  = (cat) => {
    const items    = catIndex(cat);
    const counted  = items.filter(i => i.result !== 'na');
    const passed   = items.filter(i => i.result === 'pass').length;
    return counted.length ? Math.round((passed / counted.length) * 100) : null;
  };

  const riskBg = { Low:'rgba(34,197,94,.12)', Medium:'rgba(245,158,11,.12)', High:'rgba(249,115,22,.12)', Critical:'rgba(239,68,68,.12)' };
  const riskBorder = { Low:'rgba(34,197,94,.3)', Medium:'rgba(245,158,11,.3)', High:'rgba(249,115,22,.3)', Critical:'rgba(239,68,68,.3)' };
  const catIcon = { 'Safety/PPE':FiShield, Machinery:FiTool, Environment:FiFeather, Labour:FiUsers };

  return (
    <div className="flex flex-col gap-4" style={{ maxHeight:'80vh', overflowY:'auto' }}>

      {/* Evidence card header */}
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background:'rgba(59,130,246,.07)', border:'1px solid rgba(59,130,246,.2)' }}>
        <FiMapPin size={14} style={{ color:'#2563eb', flexShrink:0 }}/>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold" style={{ color:'#2563eb' }}>
            {ins.location_in_mine || ins.section || ins.mine_name} · {formatDate(ins.scheduled_date)}
          </p>
          <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
            Inspector: {ins.inspector_name || 'You'} · {ins.type}
          </p>
        </div>
        {/* Geo-tag button */}
        <button onClick={captureGeo} disabled={geoLoading}
          style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', background: geoData?'rgba(34,197,94,.12)':'rgba(59,130,246,.12)', border: geoData?'1px solid rgba(34,197,94,.3)':'1px solid rgba(59,130,246,.3)', color: geoData?'#16a34a':'#2563eb', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}>
          <FiMapPin size={11}/>
          {geoLoading ? 'Locating…' : geoData ? `📍 Captured` : 'Capture GPS'}
        </button>
      </div>

      {geoData && (
        <p className="text-[10px]" style={{ color:'#16a34a', fontWeight:600 }}>
          ✓ GPS: {parseFloat(geoData.lat).toFixed(5)}, {parseFloat(geoData.lon).toFixed(5)} (±{Math.round(geoData.accuracy||0)}m)
        </p>
      )}
      {!geoData && (
        <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
          📍 GPS location not yet captured — tap "Capture GPS" above to geo-tag this inspection
        </p>
      )}

      {/* Live results bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label:'Checked',  value: `${results.passed + results.failed}/${results.total}`, color:'var(--text-primary)' },
          { label:'Passed',   value: results.passed, color:'#16a34a' },
          { label:'Failed',   value: results.failed, color:'#dc2626' },
          { label:'Score',    value: `${results.score}%`,  color:scoreColor(results.score) },
        ].map(k => (
          <div key={k.label} className="card p-2 text-center">
            <p style={{ fontSize:18, fontWeight:900, color:k.color, margin:0 }}>{k.value}</p>
            <p style={{ fontSize:9, fontWeight:600, color:'var(--text-muted)', margin:'2px 0 0' }}>{k.label}</p>
          </div>
        ))}
      </div>
      {results.counted > 0 && (
        <div style={{ padding:'6px 12px', borderRadius:8, background:riskBg[results.risk]||riskBg.Low, border:`1px solid ${riskBorder[results.risk]||riskBorder.Low}` }}>
          <p style={{ fontSize:11, fontWeight:700, color:results.risk==='Critical'?'#dc2626':results.risk==='High'?'#ea580c':results.risk==='Medium'?'#d97706':'#16a34a', margin:0 }}>
            Risk Level: {results.risk} · Compliance: {results.score}%
          </p>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => {
          const Icon  = catIcon[cat] || FiClipboard;
          const score = catScore(cat);
          const items = catIndex(cat);
          const failed = items.filter(i => i.result==='fail').length;
          return (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: activeCategory===cat?'var(--accent-bg)':'var(--bg-card)',
                border:     `1px solid ${activeCategory===cat?'var(--accent-border)':'var(--border)'}`,
                color:      activeCategory===cat?'var(--accent)':'var(--text-secondary)',
              }}>
              <Icon size={11}/>
              {cat}
              {score !== null && <span style={{ fontSize:9, fontWeight:800, color:scoreColor(score) }}>{score}%</span>}
              {failed > 0 && <span style={{ fontSize:9, fontWeight:800, color:'#dc2626' }}>✗{failed}</span>}
            </button>
          );
        })}
      </div>

      {/* Checklist items for active category */}
      <div className="space-y-2">
        {catItems.map((item, idx) => {
          const globalIdx = checklist.indexOf(item);
          return (
            <div key={idx} className="card p-3"
              style={{
                borderColor: item.result==='pass'?'rgba(34,197,94,.35)':item.result==='fail'?'rgba(239,68,68,.35)':'var(--border)',
                background:  item.result==='pass'?'rgba(34,197,94,.04)':item.result==='fail'?'rgba(239,68,68,.04)':'var(--bg-card)',
              }}>
              <p className="text-sm font-semibold mb-2" style={{ color:'var(--text-primary)' }}>{item.item_description}</p>

              {/* Pass / Fail / N/A buttons */}
              <div className="flex gap-2 mb-2">
                {[
                  { v:'pass', label:'✓ Pass',  bg:'rgba(34,197,94,.15)',  border:'rgba(34,197,94,.4)',  color:'#16a34a' },
                  { v:'fail', label:'✗ Fail',  bg:'rgba(239,68,68,.15)',  border:'rgba(239,68,68,.4)',  color:'#dc2626' },
                  { v:'na',   label:'— N/A',   bg:'rgba(148,163,184,.12)',border:'rgba(148,163,184,.3)',color:'#64748b' },
                ].map(opt => (
                  <button key={opt.v} onClick={() => updateItem(globalIdx, 'result', opt.v)}
                    style={{
                      flex:1, padding:'6px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                      background:  item.result===opt.v ? opt.bg    : 'var(--bg-card-hover)',
                      border:      item.result===opt.v ? `2px solid ${opt.border}` : '1px solid var(--border)',
                      color:       item.result===opt.v ? opt.color : 'var(--text-muted)',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Observation — required for failures */}
              {item.result === 'fail' && (
                <div>
                  <textarea
                    value={item.observation || ''}
                    onChange={e => updateItem(globalIdx, 'observation', e.target.value)}
                    className="input text-xs mb-2"
                    style={{ resize:'vertical', minHeight:56 }}
                    placeholder="⚠ Observation required for failed item — describe the issue clearly…"/>
                  {/* Evidence photo upload */}
                  <div className="flex items-center gap-2">
                    <label className="btn-outline btn-xs cursor-pointer flex items-center gap-1.5">
                      <FiCamera size={11}/>
                      {item.evidence_photo ? '📷 Photo Attached' : 'Upload Evidence Photo'}
                      <input
                        type="file" className="hidden"
                        accept="image/*"
                        onChange={e => uploadItemPhoto(globalIdx, e.target.files?.[0])}
                      />
                    </label>
                    {item.evidence_photo && (
                      <a href={item.evidence_photo} target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:'#2563eb', fontWeight:600, textDecoration:'none' }}>
                        View →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Remarks for any result */}
              {item.result !== 'na' && (
                <input
                  value={item.remarks || ''}
                  onChange={e => updateItem(globalIdx, 'remarks', e.target.value)}
                  className="input text-xs mt-2"
                  placeholder="Remarks (optional)…"/>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-3" style={{ borderTop:'1px solid var(--border)', position:'sticky', bottom:0, backgroundColor:'var(--bg-card)', padding:'12px 0 0' }}>
        <button onClick={onClose} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={onSave} className="btn-outline btn-sm flex-1 justify-center">
          <FiCheckSquare size={13}/> Save Progress
        </button>
        <button onClick={onComplete} className="btn-primary btn-sm flex-1 justify-center">
          <FiCheck size={13}/> Complete Inspection
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CORRECTIVE ACTIONS SECTION (inside detail modal)
════════════════════════════════════════════════════════════════════ */
function CorrectiveActionsSection({ inspectionId, actions: initialActions, canAdd, onRefresh }) {
  const [actions, setActions] = useState(initialActions);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState({});

  const loadActions = async () => {
    try { const r = await inspectionsApi.getCorrectiveActions(inspectionId); setActions(r.data||[]); }
    catch {}
  };

  const resolve = async (caId) => {
    setBusy(s => ({ ...s, [caId]: true }));
    try {
      await inspectionsApi.updateCorrectiveAction(caId, { status:'resolved', resolution_notes:'Resolved via dashboard' });
      toast.success('Action resolved');
      loadActions();
    } catch {}
    finally { setBusy(s => { const n={...s}; delete n[caId]; return n; }); }
  };

  const PRIORITY_COLOR = { critical:'red', high:'orange', medium:'yellow', low:'blue' };
  const STATUS_CA_COLOR = { open:'red', in_progress:'yellow', resolved:'green' };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color:'var(--text-muted)' }}>
          Corrective Actions ({actions.length})
        </p>
        <button onClick={() => setShowForm(v => !v)} className="btn-outline btn-xs">
          <FiPlus size={11}/> Add Action
        </button>
      </div>

      {showForm && (
        <CAForm inspectionId={inspectionId}
          onSave={() => { setShowForm(false); loadActions(); onRefresh(); }}
          onCancel={() => setShowForm(false)}/>
      )}

      {actions.length === 0 ? (
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>No corrective actions yet.</p>
      ) : actions.map(ca => (
        <div key={ca.id} className="card p-3 mb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{ca.observation}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge color={PRIORITY_COLOR[ca.priority]||'gray'}>{ca.priority}</Badge>
                <Badge color={STATUS_CA_COLOR[ca.status]||'gray'} dot>{ca.status}</Badge>
                {ca.responsible_person && <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>👤 {ca.responsible_person}</span>}
                {ca.due_date && <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>📅 Due: {formatDate(ca.due_date)}</span>}
              </div>
            </div>
            {ca.status !== 'resolved' && (
              <button disabled={!!busy[ca.id]} onClick={() => resolve(ca.id)}
                style={{ padding:'4px 10px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.3)', color:'#16a34a', whiteSpace:'nowrap' }}>
                {busy[ca.id] ? '…' : '✓ Resolve'}
              </button>
            )}
          </div>
          {ca.resolution_notes && (
            <p className="text-[10px] mt-2 pt-2" style={{ borderTop:'1px solid var(--border)', color:'var(--text-muted)' }}>
              Resolution: {ca.resolution_notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CORRECTIVE ACTION FORM
════════════════════════════════════════════════════════════════════ */
function CAForm({ inspectionId, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();
  const onSubmit = async (data) => {
    try {
      await inspectionsApi.createCorrectiveAction(inspectionId, data);
      toast.success('Corrective action added');
      onSave();
    } catch { toast.error('Failed to add action'); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card p-3 mb-3 space-y-3">
      <div className="form-group">
        <label className="label">Observation / Issue *</label>
        <textarea {...register('observation', { required:true })} className="input" rows={2}
          style={{ resize:'vertical' }} placeholder="Describe the issue requiring corrective action…"/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="form-group">
          <label className="label">Responsible Person</label>
          <input {...register('responsible_person')} className="input" placeholder="Name or designation"/>
        </div>
        <div className="form-group">
          <label className="label">Department</label>
          <input {...register('department')} className="input" placeholder="Safety / Ops / Environment"/>
        </div>
        <div className="form-group">
          <label className="label">Priority</label>
          <select {...register('priority')} className="select">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="form-group">
          <label className="label">Due Date</label>
          <input type="date" {...register('due_date')} className="input"/>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary btn-sm">Add Action</button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SCHEDULE FORM
════════════════════════════════════════════════════════════════════ */
function ScheduleForm({ mines, users, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { scheduled_date: new Date().toISOString().split('T')[0] },
  });

  const onSubmit = async (data) => {
    try {
      await inspectionsApi.create(data);
      toast.success('Inspection scheduled');
      onSave();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to schedule'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="form-group">
        <label className="label">Mine *</label>
        <select {...register('mine_id', { required:'Mine is required' })} className="select">
          <option value="">Select Mine</option>
          {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label className="label">Inspection Type *</label>
          <select {...register('type', { required:'Type is required' })} className="select">
            <option value="">Select Type</option>
            {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Scheduled Date *</label>
          <input type="date" {...register('scheduled_date', { required:true })} className="input"/>
        </div>
        <div className="form-group">
          <label className="label">Location / Section</label>
          <input {...register('location_in_mine')} className="input" placeholder="e.g. Underground Level 3"/>
        </div>
        <div className="form-group">
          <label className="label">Section / Area</label>
          <input {...register('section')} className="input" placeholder="e.g. Seam 14, Gallery C"/>
        </div>
        {users.length > 0 && (
          <div className="form-group col-span-2">
            <label className="label">Assign Inspector</label>
            <select {...register('inspector_id')} className="select">
              <option value="">Assign to me</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Scheduling…' : 'Schedule Inspection'}
        </button>
      </div>
    </form>
  );
}
