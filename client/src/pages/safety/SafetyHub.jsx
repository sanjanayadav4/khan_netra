/**
 * KhanNetra DGMS — Safety Hub
 * Unified Safety Observation + Incident Reporting + Corrective Action module.
 *
 * Tabs:
 *  1. Dashboard — KPI cards, overdue escalation alerts, recent observations/incidents
 *  2. Observations — safety observations with GPS, photo, severity
 *  3. Incidents — full incident report with people involved, evidence, GPS
 *  4. Corrective Actions — workflow: open → in_progress → completed → verified
 *
 * All data from real backend. No fake data.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FiAlertTriangle, FiEye, FiPlus, FiSearch, FiRefreshCw,
  FiMapPin, FiCamera, FiUpload, FiCheck, FiX, FiClock,
  FiAlertOctagon, FiShield, FiUsers, FiChevronRight, FiActivity,
} from 'react-icons/fi';
import { safetyApi, incidentsApi, minesApi } from '../../services/api';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { formatDate, formatDateTime, timeAgo } from '../../utils/helpers';
import clsx from 'clsx';

/* ── Constants ──────────────────────────────────────────────────────── */
const SEV_COLOR = { critical:'red', high:'orange', medium:'yellow', low:'blue', fatal:'red', serious:'yellow', minor:'blue', near_miss:'gray' };
const PRI_COLOR = { critical:'red', high:'orange', medium:'yellow', low:'blue' };
const CA_STATUS_COLOR = { open:'red', in_progress:'yellow', completed:'green', verified:'teal' };

const CA_WORKFLOW = ['open','in_progress','completed','verified'];
const CA_WORKFLOW_LABELS = { open:'Open', in_progress:'In Progress', completed:'Completed', verified:'Verified' };

const OBS_TYPES = ['Unsafe Condition','Unsafe Act','Near Miss','Hazard','PPE Non-compliance','Housekeeping','Electrical','Fire Risk','Environmental','Other'];
const INC_TYPES = ['Roof Fall','Gas Ignition','Inundation','Slope Failure','Equipment Failure','Near Miss','Fire','Explosion','Electrical','Labour','Environmental','Other'];

const scoreColor = (v) => parseFloat(v) >= 80 ? '#16a34a' : parseFloat(v) >= 60 ? '#d97706' : '#dc2626';

/* GPS hook */
function useGPS() {
  const [status, setStatus] = useState('idle');
  const [coords, setCoords] = useState(null);

  const capture = (onSuccess) => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      toast('GPS not available — location not captured', { icon:'ℹ️' });
      return;
    }
    setStatus('acquiring');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) };
        setCoords(c);
        setStatus('ok');
        onSuccess && onSuccess(c);
        toast.success(`GPS captured (±${c.acc}m)`);
      },
      (err) => {
        setStatus(err.code === 1 ? 'denied' : 'unavailable');
        toast(`${err.code === 1 ? 'Location permission denied' : 'GPS unavailable'} — proceed without GPS`, { icon:'⚠️' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return { status, coords, capture, reset: () => { setStatus('idle'); setCoords(null); } };
}

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════ */
export default function SafetyHub() {
  const { user } = useAuthStore();

  const [tab,        setTab]        = useState('dashboard');
  const [dashboard,  setDashboard]  = useState(null);
  const [obs,        setObs]        = useState([]);
  const [incidents,  setIncidents]  = useState([]);
  const [cas,        setCAs]        = useState([]);
  const [mines,      setMines]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [mineFilter, setMineFilter] = useState('');
  const [search,     setSearch]     = useState('');
  const [sevFilter,  setSevFilter]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showObsForm,  setShowObsForm]  = useState(false);
  const [showIncForm,  setShowIncForm]  = useState(false);
  const [showCAForm,   setShowCAForm]   = useState(false);
  const [viewObs,      setViewObs]      = useState(null);
  const [viewInc,      setViewInc]      = useState(null);
  const [viewCA,       setViewCA]       = useState(null);
  const [caSource,     setCASource]     = useState(null);  // {type, id, description}

  const canReport = ['admin','government_officer','mine_manager','inspector','safety_officer',
                     'environment_officer','mining_engineer','contractor'].includes(user?.role);
  const canVerify = ['admin','government_officer','inspector','safety_officer'].includes(user?.role);

  /* ── Load ──────────────────────────────────────────────────────── */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const p = { mine_id: mineFilter || undefined };
    try {
      const [d, o, i, c] = await Promise.allSettled([
        safetyApi.getDashboard(p),
        safetyApi.getObservations({ ...p, severity: sevFilter || undefined, status: statusFilter || undefined, limit: 30 }),
        incidentsApi.getAll({ ...p, severity: sevFilter || undefined, status: statusFilter || undefined, limit: 30 }),
        safetyApi.getCAs({ ...p, status: statusFilter || undefined, limit: 30 }),
      ]);
      setDashboard(d.status === 'fulfilled' ? d.value?.data : null);
      setObs(o.status === 'fulfilled'       ? (o.value?.data || []) : []);
      setIncidents(i.status === 'fulfilled' ? (i.value?.data || []) : []);
      setCAs(c.status === 'fulfilled'       ? (c.value?.data || []) : []);
    } catch {}
    finally { setLoading(false); }
  }, [mineFilter, sevFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { minesApi.getAll({ limit: 100 }).then(r => setMines(r.data || [])).catch(() => {}); }, []);

  /* Auto-mark overdue on page load */
  useEffect(() => { safetyApi.markOverdue().catch(() => {}); }, []);

  /* ── Filter helpers ─────────────────────────────────────────────── */
  const filterText = (items, keys) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => keys.some(k => item[k]?.toLowerCase().includes(q)));
  };

  const filteredObs = filterText(obs, ['title','description','location','mine_name']);
  const filteredInc = filterText(incidents, ['type','description','location_in_mine','mine_name','incident_number']);
  const filteredCAs = filterText(cas, ['problem_description','action_number','mine_name','assigned_to_name']);

  /* ── Open add-CA form pre-filled from source ─────────────────────── */
  const addCAFromSource = (type, id, description) => {
    setCASource({ source_type: type, source_id: id, problem_description: description });
    setShowCAForm(true);
  };

  return (
    <div className="space-y-4">
      <BackButton/>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiShield style={{ color:'var(--accent)' }}/> Safety Hub
          </h1>
          <p className="page-subtitle">
            Safety observations · Incident reporting · Corrective action workflow
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={mineFilter} onChange={e => setMineFilter(e.target.value)} className="select w-44">
            <option value="">All Mines</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={() => load(true)} className="btn-outline btn-sm"><FiRefreshCw size={13}/> Refresh</button>
          {canReport && (
            <>
              <button onClick={() => setShowObsForm(true)} className="btn-outline btn-sm">
                <FiEye size={13}/> Observe
              </button>
              <button onClick={() => setShowIncForm(true)} className="btn-primary btn-sm">
                <FiAlertTriangle size={13}/> Report Incident
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id:'dashboard', label:'Dashboard'                           },
          { id:'obs',       label:`Observations (${filteredObs.length})` },
          { id:'incidents', label:`Incidents (${filteredInc.length})`    },
          { id:'actions',   label:`Corrective Actions (${filteredCAs.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('tab-item', tab === t.id && 'active')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search / filter bar (for non-dashboard tabs) */}
      {tab !== 'dashboard' && (
        <div className="card-sm flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} className="input"
              style={{ paddingLeft:32 }} placeholder={`Search ${tab}…`}/>
          </div>
          <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} className="select" style={{ width:'auto' }}>
            <option value="">All Severity</option>
            {['critical','high','medium','low','fatal','serious','minor','near_miss'].map(s =>
              <option key={s} value={s}>{s.replace('_',' ')}</option>
            )}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select" style={{ width:'auto' }}>
            <option value="">All Status</option>
            {tab === 'actions'
              ? CA_WORKFLOW.map(s => <option key={s} value={s}>{CA_WORKFLOW_LABELS[s]}</option>)
              : ['open','resolved','in_progress','closed'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)
            }
          </select>
        </div>
      )}

      {loading ? <PageLoader message="Loading safety data…"/> : (
        <>
          {/* ══ DASHBOARD ══ */}
          {tab === 'dashboard' && (
            <DashboardTab
              dashboard={dashboard}
              onViewObs={setViewObs}
              onViewInc={setViewInc}
              onViewCA={setViewCA}
            />
          )}

          {/* ══ OBSERVATIONS ══ */}
          {tab === 'obs' && (
            <ObservationsTab
              observations={filteredObs}
              canReport={canReport}
              onView={setViewObs}
              onAdd={() => setShowObsForm(true)}
              onAddCA={(ob) => addCAFromSource('observation', ob.id, ob.title || ob.description)}
            />
          )}

          {/* ══ INCIDENTS ══ */}
          {tab === 'incidents' && (
            <IncidentsTab
              incidents={filteredInc}
              canReport={canReport}
              onView={setViewInc}
              onAdd={() => setShowIncForm(true)}
              onAddCA={(inc) => addCAFromSource('incident', inc.id, `${inc.type}: ${inc.description?.slice(0,80)}`)}
            />
          )}

          {/* ══ CORRECTIVE ACTIONS ══ */}
          {tab === 'actions' && (
            <CorrectiveActionsTab
              actions={filteredCAs}
              canVerify={canVerify}
              onView={setViewCA}
              onAdd={() => { setCASource(null); setShowCAForm(true); }}
              onUpdate={async (id, data) => {
                try { await safetyApi.updateCA(id, data); toast.success('Action updated'); load(true); }
                catch { toast.error('Update failed'); }
              }}
            />
          )}
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────── */}
      <Modal isOpen={showObsForm} onClose={() => setShowObsForm(false)} title="Report Safety Observation" size="lg">
        <ObservationForm mines={mines} onSave={() => { setShowObsForm(false); load(); }} onCancel={() => setShowObsForm(false)}/>
      </Modal>

      <Modal isOpen={showIncForm} onClose={() => setShowIncForm(false)} title="Report Incident" size="lg">
        <IncidentReportForm mines={mines} onSave={() => { setShowIncForm(false); load(); }} onCancel={() => setShowIncForm(false)}/>
      </Modal>

      <Modal isOpen={showCAForm} onClose={() => { setShowCAForm(false); setCASource(null); }} title="Create Corrective Action" size="md">
        <CAForm mines={mines} source={caSource} onSave={() => { setShowCAForm(false); setCASource(null); load(); }} onCancel={() => { setShowCAForm(false); setCASource(null); }}/>
      </Modal>

      <Modal isOpen={!!viewObs} onClose={() => setViewObs(null)} title={`Observation ${viewObs?.observation_number}`} size="lg">
        {viewObs && <ObservationDetail obs={viewObs} onAddCA={() => addCAFromSource('observation', viewObs.id, viewObs.title)} onClose={() => setViewObs(null)}/>}
      </Modal>

      <Modal isOpen={!!viewInc} onClose={() => setViewInc(null)} title={`Incident ${viewInc?.incident_number}`} size="lg">
        {viewInc && <IncidentDetail inc={viewInc} onAddCA={() => addCAFromSource('incident', viewInc.id, `${viewInc.type}: ${viewInc.description?.slice(0,80)}`)} onClose={() => setViewInc(null)}/>}
      </Modal>

      <Modal isOpen={!!viewCA} onClose={() => setViewCA(null)} title={`Corrective Action ${viewCA?.action_number}`} size="md">
        {viewCA && <CADetail ca={viewCA} canVerify={canVerify} onUpdate={async (data) => { await safetyApi.updateCA(viewCA.id, data); toast.success('Updated'); setViewCA(null); load(); }}/>}
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
════════════════════════════════════════════════════════════════════ */
function DashboardTab({ dashboard, onViewObs, onViewInc, onViewCA }) {
  if (!dashboard) return (
    <div className="card text-center py-14">
      <FiShield size={32} style={{ color:'var(--text-muted)', margin:'0 auto 12px' }}/>
      <p style={{ color:'var(--text-muted)' }}>No safety data yet. Start by reporting an observation or incident.</p>
    </div>
  );

  const { observations: obs, incidents: inc, corrective_actions: ca,
          recent_observations, recent_incidents, overdue_actions } = dashboard;

  const kpis = [
    { label:'Open Observations',  value: obs?.open_count || 0,  color: obs?.critical > 0 ? '#dc2626' : '#d97706',  sub: `${obs?.total||0} total`     },
    { label:'Critical Obs',        value: obs?.critical  || 0,  color: '#dc2626',                                   sub: 'Needs immediate action'      },
    { label:'Open Incidents',      value: inc?.open_count|| 0,  color: inc?.fatal > 0 ? '#dc2626' : '#ea580c',      sub: `${inc?.fatal||0} fatal`      },
    { label:'Open Actions',        value: ca?.open_count || 0,  color: '#3b82f6',                                   sub: `${ca?.total||0} total`       },
    { label:'Overdue Actions',     value: ca?.overdue    || 0,  color: '#dc2626',                                   sub: '🔴 Escalation required'       },
  ];

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="card p-3 text-center"
            style={{ borderColor: k.label.includes('Overdue') && k.value > 0 ? 'rgba(239,68,68,.35)' : 'var(--border)' }}>
            <p style={{ fontSize:26, fontWeight:900, color:k.color, margin:0 }}>{k.value}</p>
            <p style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', margin:'3px 0 0' }}>{k.label}</p>
            <p style={{ fontSize:9, color:'var(--text-muted)', margin:'2px 0 0' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Overdue escalation alert */}
      {ca?.overdue > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl"
          style={{ background:'rgba(239,68,68,.08)', border:'2px solid rgba(239,68,68,.4)' }}>
          <FiAlertOctagon size={20} style={{ color:'#dc2626', flexShrink:0, marginTop:1 }}/>
          <div className="flex-1">
            <p className="font-bold text-sm" style={{ color:'#dc2626' }}>
              🔴 ESCALATION ALERT — {ca.overdue} Overdue Corrective Action{ca.overdue > 1 ? 's' : ''}
            </p>
            <p className="text-xs mt-1" style={{ color:'var(--text-secondary)' }}>
              The following corrective actions have missed their deadlines and require immediate attention.
              Responsible persons and supervisors have been notified.
            </p>
          </div>
        </div>
      )}

      {/* Three-column recent panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent observations */}
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'var(--text-muted)' }}>
            Recent Observations
          </p>
          {(recent_observations || []).length === 0
            ? <p style={{ fontSize:12, color:'var(--text-muted)' }}>None</p>
            : (recent_observations || []).map(o => (
              <div key={o.id} className="flex items-start gap-3 py-2.5 cursor-pointer"
                style={{ borderBottom:'1px solid var(--border)' }}
                onClick={() => onViewObs(o)}>
                <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, marginTop:4,
                  backgroundColor: o.severity==='critical'?'#dc2626':o.severity==='high'?'#f97316':'#f59e0b' }}/>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{o.title}</p>
                  <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                    {o.mine_name} · {timeAgo(o.observed_at)}
                  </p>
                </div>
                <Badge color={SEV_COLOR[o.severity]||'gray'}>{o.severity}</Badge>
              </div>
            ))
          }
        </div>

        {/* Recent incidents */}
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'var(--text-muted)' }}>
            Recent Incidents
          </p>
          {(recent_incidents || []).length === 0
            ? <p style={{ fontSize:12, color:'var(--text-muted)' }}>None</p>
            : (recent_incidents || []).map(i => (
              <div key={i.id} className="flex items-start gap-3 py-2.5 cursor-pointer"
                style={{ borderBottom:'1px solid var(--border)' }}
                onClick={() => onViewInc(i)}>
                <FiAlertTriangle size={12} style={{ color: i.severity==='fatal'?'#dc2626':'#f97316', flexShrink:0, marginTop:2 }}/>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{i.type}</p>
                  <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                    {i.mine_name} · {timeAgo(i.incident_date)}
                  </p>
                </div>
                <Badge color={SEV_COLOR[i.severity]||'gray'}>{i.severity}</Badge>
              </div>
            ))
          }
        </div>

        {/* Overdue actions */}
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: (overdue_actions||[]).length > 0 ? '#dc2626' : 'var(--text-muted)' }}>
            {(overdue_actions||[]).length > 0 ? '🔴 Overdue Actions' : 'Overdue Actions'}
          </p>
          {(overdue_actions || []).length === 0
            ? <p style={{ fontSize:12, color:'#16a34a', fontWeight:600 }}>✓ No overdue actions</p>
            : (overdue_actions || []).map(ca => (
              <div key={ca.id} className="flex items-start gap-3 py-2.5 cursor-pointer"
                style={{ borderBottom:'1px solid var(--border)' }}
                onClick={() => onViewCA(ca)}>
                <FiClock size={12} style={{ color:'#dc2626', flexShrink:0, marginTop:2 }}/>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>
                    {ca.action_number}
                  </p>
                  <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                    Due: {ca.due_date} · {ca.mine_name}
                  </p>
                </div>
                <span style={{ fontSize:9, fontWeight:800, color:'#fff', background:'#dc2626', padding:'1px 6px', borderRadius:999, whiteSpace:'nowrap' }}>
                  Lvl {ca.escalation_level}
                </span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   OBSERVATIONS TAB
════════════════════════════════════════════════════════════════════ */
function ObservationsTab({ observations, canReport, onView, onAdd, onAddCA }) {
  return observations.length === 0 ? (
    <EmptyState icon={FiEye} title="No observations found"
      action={canReport && <button onClick={onAdd} className="btn-primary">Report Observation</button>}/>
  ) : (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr><th>#</th><th>Mine / Location</th><th>Type</th><th>Severity</th><th>Observed</th><th>Status</th><th>GPS</th><th></th></tr>
        </thead>
        <tbody>
          {observations.map(o => (
            <tr key={o.id} style={{ cursor:'pointer' }} onClick={() => onView(o)}>
              <td><span className="font-mono text-xs font-bold" style={{ color:'var(--accent)' }}>{o.observation_number}</span></td>
              <td>
                <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{o.mine_name}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{o.location || o.section || '—'}</p>
              </td>
              <td><span className="text-sm" style={{ color:'var(--text-secondary)' }}>{o.type}</span></td>
              <td><Badge color={SEV_COLOR[o.severity]||'gray'}>{o.severity}</Badge></td>
              <td><span className="text-xs" style={{ color:'var(--text-muted)' }}>{formatDate(o.observed_at)}</span></td>
              <td>
                <Badge color={o.status==='resolved'?'green':o.status==='open'?'red':'yellow'} dot>
                  {o.status}
                </Badge>
              </td>
              <td>
                {o.latitude
                  ? <span style={{ fontSize:10, color:'#2563eb', fontWeight:600 }}>📍 Yes</span>
                  : <span style={{ fontSize:10, color:'var(--text-muted)' }}>—</span>
                }
              </td>
              <td onClick={e => e.stopPropagation()}>
                <div className="flex gap-1">
                  <button onClick={() => onView(o)} className="p-1.5 rounded-lg transition-colors"
                    style={{ color:'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.background='var(--accent-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background=''; }}>
                    <FiEye size={13}/>
                  </button>
                  {o.status === 'open' && (
                    <button onClick={() => onAddCA(o)} title="Add Corrective Action"
                      style={{ padding:'4px 8px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(59,130,246,.10)', border:'1px solid rgba(59,130,246,.3)', color:'#2563eb' }}>
                      + CA
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   INCIDENTS TAB
════════════════════════════════════════════════════════════════════ */
function IncidentsTab({ incidents, canReport, onView, onAdd, onAddCA }) {
  return incidents.length === 0 ? (
    <EmptyState icon={FiAlertTriangle} title="No incidents found"
      action={canReport && <button onClick={onAdd} className="btn-primary">Report Incident</button>}/>
  ) : (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr><th>#</th><th>Mine</th><th>Type</th><th>Severity</th><th>Casualties</th><th>DGMS</th><th>Status</th><th>Date</th><th></th></tr>
        </thead>
        <tbody>
          {incidents.map(i => (
            <tr key={i.id} style={{ cursor:'pointer' }} onClick={() => onView(i)}>
              <td><span className="font-mono text-xs font-bold" style={{ color:'var(--accent)' }}>{i.incident_number}</span></td>
              <td>
                <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{i.mine_name}</p>
                <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{i.location_in_mine || '—'}</p>
              </td>
              <td><span className="text-sm" style={{ color:'var(--text-secondary)' }}>{i.type}</span></td>
              <td><Badge color={SEV_COLOR[i.severity]||'gray'}>{i.severity}</Badge></td>
              <td>
                <span style={{ fontSize:12, fontWeight:700, color: parseInt(i.fatalities_count)>0?'#dc2626':'var(--text-secondary)' }}>
                  {i.injuries_count} inj · {i.fatalities_count} fatal
                </span>
              </td>
              <td><Badge color={i.dgms_notified?'green':'gray'}>{i.dgms_notified?'Yes':'No'}</Badge></td>
              <td>
                <Badge color={i.status==='closed'?'green':i.status==='open'?'red':'yellow'} dot>
                  {i.status?.replace(/_/g,' ')}
                </Badge>
              </td>
              <td><span className="text-xs" style={{ color:'var(--text-muted)' }}>{formatDate(i.incident_date)}</span></td>
              <td onClick={e => e.stopPropagation()}>
                <div className="flex gap-1">
                  <button onClick={() => onView(i)} className="p-1.5 rounded-lg transition-colors"
                    style={{ color:'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.background='var(--accent-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background=''; }}>
                    <FiEye size={13}/>
                  </button>
                  {i.status !== 'closed' && (
                    <button onClick={() => onAddCA(i)} title="Add Corrective Action"
                      style={{ padding:'4px 8px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(59,130,246,.10)', border:'1px solid rgba(59,130,246,.3)', color:'#2563eb' }}>
                      + CA
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CORRECTIVE ACTIONS TAB
════════════════════════════════════════════════════════════════════ */
function CorrectiveActionsTab({ actions, canVerify, onView, onAdd, onUpdate }) {
  const getUrgencyStyle = (ca) => {
    if (ca.is_overdue && !['completed','verified'].includes(ca.status))
      return { background:'rgba(239,68,68,.06)', borderColor:'rgba(239,68,68,.3)' };
    return {};
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={onAdd} className="btn-primary btn-sm"><FiPlus size={13}/> Add Action</button>
      </div>
      {actions.length === 0 ? (
        <EmptyState icon={FiCheck} title="No corrective actions found"/>
      ) : (
        <div className="space-y-2">
          {actions.map(ca => {
            const isOverdue = ca.is_overdue && !['completed','verified'].includes(ca.status);
            return (
              <div key={ca.id} className="card p-4" style={getUrgencyStyle(ca)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold" style={{ color:'var(--accent)' }}>{ca.action_number}</span>
                      <Badge color={CA_STATUS_COLOR[ca.status]||'gray'} dot>{CA_WORKFLOW_LABELS[ca.status]||ca.status}</Badge>
                      <Badge color={PRI_COLOR[ca.priority]||'gray'}>{ca.priority}</Badge>
                      {isOverdue && (
                        <span style={{ fontSize:10, fontWeight:800, color:'#fff', background:'#dc2626', padding:'1px 7px', borderRadius:999 }}>
                          🔴 OVERDUE (Lvl {ca.escalation_level})
                        </span>
                      )}
                      <Badge color={ca.source_type==='incident'?'red':'yellow'}>
                        {ca.source_type}
                      </Badge>
                    </div>
                    <p className="text-sm" style={{ color:'var(--text-primary)' }}>{ca.problem_description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                        👤 {ca.assigned_to_name || 'Unassigned'}
                      </span>
                      {ca.due_date && (
                        <span className="text-[10px]" style={{ color: isOverdue ? '#dc2626' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                          📅 Due: {ca.due_date}
                        </span>
                      )}
                      <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>{ca.mine_name}</span>
                    </div>
                  </div>

                  {/* Workflow action buttons */}
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {ca.status === 'open' && (
                      <button onClick={() => onUpdate(ca.id, { status:'in_progress' })}
                        style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.3)', color:'#d97706' }}>
                        Start →
                      </button>
                    )}
                    {ca.status === 'in_progress' && (
                      <button onClick={() => onUpdate(ca.id, { status:'completed', completion_notes:'Completed via dashboard' })}
                        style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.3)', color:'#16a34a' }}>
                        ✓ Complete
                      </button>
                    )}
                    {canVerify && ca.status === 'completed' && (
                      <button onClick={() => onUpdate(ca.id, { status:'verified' })}
                        style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(20,184,166,.12)', border:'1px solid rgba(20,184,166,.3)', color:'#0f766e' }}>
                        ✓✓ Verify
                      </button>
                    )}
                    <button onClick={() => onView(ca)} className="btn-outline btn-xs"><FiEye size={11}/></button>
                  </div>
                </div>

                {/* Workflow progress bar */}
                <div className="flex items-center gap-0 mt-3">
                  {CA_WORKFLOW.map((step, i) => {
                    const stepIdx  = CA_WORKFLOW.indexOf(ca.status);
                    const done     = i < stepIdx;
                    const current  = i === stepIdx;
                    const dotColor = done || current ? 'var(--accent)' : 'var(--border)';
                    return (
                      <div key={step} className="flex items-center flex-1">
                        <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, background: (done||current)?'var(--accent-bg)':'var(--bg-card-hover)', border:`2px solid ${dotColor}`, color: (done||current)?'var(--accent)':'var(--text-muted)' }}>
                          {done ? '✓' : i+1}
                        </div>
                        <span style={{ fontSize:8, color:(done||current)?'var(--accent)':'var(--text-muted)', margin:'0 3px', whiteSpace:'nowrap' }}>
                          {CA_WORKFLOW_LABELS[step]}
                        </span>
                        {i < CA_WORKFLOW.length - 1 && (
                          <div style={{ flex:1, height:1, background: done?'var(--accent)':'var(--border)', margin:'0 1px' }}/>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   OBSERVATION FORM
════════════════════════════════════════════════════════════════════ */
function ObservationForm({ mines, onSave, onCancel }) {
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm();
  const gps = useGPS();
  const [files, setFiles] = useState([]);

  const onSubmit = async (data) => {
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, v); });
      if (gps.coords) { fd.set('latitude', gps.coords.lat); fd.set('longitude', gps.coords.lon); fd.set('gps_accuracy', gps.coords.acc); }
      files.forEach(f => fd.append('photos', f));
      await safetyApi.createObservation(fd);
      toast.success('Observation reported');
      onSave();
    } catch { toast.error('Failed to submit'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-group sm:col-span-2">
          <label className="label">Mine *</label>
          <select {...register('mine_id', { required:true })} className="select">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Observation Type *</label>
          <select {...register('type', { required:true })} className="select">
            <option value="">Select Type</option>
            {OBS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Severity *</label>
          <select {...register('severity', { required:true })} className="select">
            {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Title *</label>
          <input {...register('title', { required:true })} className="input" placeholder="Brief description of the observation"/>
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Detailed Description *</label>
          <textarea {...register('description', { required:true })} className="input" rows={3} style={{ resize:'vertical' }} placeholder="Describe the safety issue in detail…"/>
        </div>
        <div className="form-group">
          <label className="label">Location / Area</label>
          <input {...register('location')} className="input" placeholder="e.g. Level 3 Gallery B"/>
        </div>
        <div className="form-group">
          <label className="label">Section</label>
          <input {...register('section')} className="input" placeholder="e.g. Seam 14"/>
        </div>
        <div className="form-group">
          <label className="label">Observed At *</label>
          <input type="datetime-local" {...register('observed_at', { required:true })} className="input"
            defaultValue={new Date().toISOString().slice(0,16)}/>
        </div>
        <div className="form-group">
          <label className="label">GPS Location</label>
          <button type="button" onClick={() => gps.capture()}
            disabled={gps.status === 'acquiring'}
            className="btn-outline btn-sm w-full justify-center">
            <FiMapPin size={12}/>
            {gps.status === 'acquiring' ? 'Acquiring…' : gps.coords ? `📍 Captured (±${gps.coords.acc}m)` : 'Capture GPS'}
          </button>
          {gps.status === 'denied' && <p className="text-[10px] text-amber-600 mt-1">Permission denied — observation saved without GPS</p>}
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Evidence Photos</label>
          <label className="btn-outline btn-sm cursor-pointer flex items-center gap-2 w-fit">
            <FiCamera size={13}/> Add Photos ({files.length})
            <input type="file" className="hidden" multiple accept="image/*" onChange={e => setFiles(Array.from(e.target.files))}/>
          </label>
        </div>
        <div className="form-group sm:col-span-2 flex items-center gap-3">
          <input type="checkbox" {...register('requires_action')} id="req_action" className="w-4 h-4" style={{ accentColor:'var(--accent)' }}/>
          <label htmlFor="req_action" className="text-sm font-semibold cursor-pointer" style={{ color:'var(--text-primary)' }}>
            Requires corrective action
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting?'Submitting…':'Submit Observation'}</button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   INCIDENT REPORT FORM
════════════════════════════════════════════════════════════════════ */
function IncidentReportForm({ mines, onSave, onCancel }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { incident_date: new Date().toISOString().slice(0,16), injuries_count:0, fatalities_count:0, affected_workers:0 }
  });
  const gps = useGPS();
  const [files, setFiles] = useState([]);

  const onSubmit = async (data) => {
    try {
      const fd = new FormData();
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, v); });
      if (gps.coords) { fd.set('latitude', gps.coords.lat); fd.set('longitude', gps.coords.lon); fd.set('gps_accuracy', gps.coords.acc); }
      files.forEach(f => fd.append('evidence', f));
      await safetyApi.createIncident(fd);
      toast.success('Incident reported');
      onSave();
    } catch { toast.error('Failed to submit'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-group sm:col-span-2">
          <label className="label">Mine *</label>
          <select {...register('mine_id', { required:true })} className="select">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Incident Type *</label>
          <select {...register('type', { required:true })} className="select">
            <option value="">Select Type</option>
            {INC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Severity *</label>
          <select {...register('severity', { required:true })} className="select">
            <option value="">Select</option>
            {['fatal','serious','minor','near_miss'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Date & Time *</label>
          <input type="datetime-local" {...register('incident_date', { required:true })} className="input"/>
        </div>
        <div className="form-group">
          <label className="label">Location / Area</label>
          <input {...register('location_in_mine')} className="input" placeholder="e.g. Seam 14 Gallery C"/>
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Description *</label>
          <textarea {...register('description', { required:true })} className="input" rows={3} style={{ resize:'vertical' }} placeholder="Describe what happened, sequence of events…"/>
        </div>
        <div className="form-group">
          <label className="label">People Involved</label>
          <input {...register('people_involved')} className="input" placeholder="Names or worker IDs"/>
        </div>
        <div className="form-group">
          <label className="label">Witness Names</label>
          <input {...register('witness_names')} className="input" placeholder="Witness names"/>
        </div>
        <div className="form-group">
          <label className="label">Injuries Count</label>
          <input type="number" min="0" {...register('injuries_count')} className="input"/>
        </div>
        <div className="form-group">
          <label className="label">Fatalities</label>
          <input type="number" min="0" {...register('fatalities_count')} className="input"/>
        </div>
        <div className="form-group">
          <label className="label">Affected Workers</label>
          <input type="number" min="0" {...register('affected_workers')} className="input"/>
        </div>
        <div className="form-group">
          <label className="label">Equipment Involved</label>
          <input {...register('equipment_involved')} className="input" placeholder="e.g. Loader #3"/>
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Immediate Action Taken</label>
          <textarea {...register('immediate_action')} className="input" rows={2} style={{ resize:'vertical' }} placeholder="What was done immediately after the incident…"/>
        </div>
        <div className="form-group">
          <label className="label">GPS Location</label>
          <button type="button" onClick={() => gps.capture()} disabled={gps.status==='acquiring'} className="btn-outline btn-sm w-full justify-center">
            <FiMapPin size={12}/>
            {gps.status === 'acquiring' ? 'Acquiring…' : gps.coords ? `📍 Captured (±${gps.coords.acc}m)` : 'Capture GPS'}
          </button>
          {gps.status === 'denied' && <p className="text-[10px] text-amber-600 mt-1">No GPS — saved without location</p>}
        </div>
        <div className="form-group">
          <label className="label">Evidence Photos / Video</label>
          <label className="btn-outline btn-sm cursor-pointer flex items-center gap-2 w-fit">
            <FiUpload size={13}/> Upload Evidence ({files.length})
            <input type="file" className="hidden" multiple accept="image/*,video/*" onChange={e => setFiles(Array.from(e.target.files))}/>
          </label>
        </div>
      </div>
      <div style={{ padding:'10px 12px', borderRadius:10, background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.25)' }}>
        <p style={{ fontSize:11, color:'#dc2626', fontWeight:700, margin:0 }}>
          ⚠ Fatal / Serious incidents will be automatically reported to DGMS officers and administrators.
        </p>
      </div>
      <div className="flex justify-end gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary btn-danger">{isSubmitting?'Submitting…':'Report Incident'}</button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CORRECTIVE ACTION FORM
════════════════════════════════════════════════════════════════════ */
function CAForm({ mines, source, onSave, onCancel }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      source_type: source?.source_type || 'manual',
      source_id:   source?.source_id   || 'manual',
      problem_description: source?.problem_description || '',
    }
  });

  const onSubmit = async (data) => {
    try {
      await safetyApi.createCA(data);
      toast.success('Corrective action created');
      onSave();
    } catch { toast.error('Failed'); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register('source_type')}/>
      <input type="hidden" {...register('source_id')}/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-group sm:col-span-2">
          <label className="label">Mine *</label>
          <select {...register('mine_id', { required:true })} className="select">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Problem Description *</label>
          <textarea {...register('problem_description', { required:true })} className="input" rows={3} style={{ resize:'vertical' }} placeholder="Describe the safety problem requiring corrective action…"/>
        </div>
        <div className="form-group sm:col-span-2">
          <label className="label">Planned Action / Solution</label>
          <textarea {...register('action_description')} className="input" rows={2} style={{ resize:'vertical' }} placeholder="Describe what needs to be done to fix this…"/>
        </div>
        <div className="form-group">
          <label className="label">Assigned To</label>
          <input {...register('assigned_to')} className="input" placeholder="Name or designation"/>
        </div>
        <div className="form-group">
          <label className="label">Department</label>
          <input {...register('department')} className="input" placeholder="Safety / Operations / Maintenance"/>
        </div>
        <div className="form-group">
          <label className="label">Priority *</label>
          <select {...register('priority', { required:true })} className="select">
            {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Due Date *</label>
          <input type="date" {...register('due_date', { required:true })} className="input"/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting?'Creating…':'Create Action'}</button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DETAIL MODALS (observation, incident, CA)
════════════════════════════════════════════════════════════════════ */
function ObservationDetail({ obs, onAddCA, onClose }) {
  const photos = (() => { try { return JSON.parse(obs.evidence_photos||'[]'); } catch { return []; } })();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge color={SEV_COLOR[obs.severity]||'gray'}>{obs.severity}</Badge>
        <Badge color={obs.status==='resolved'?'green':'red'} dot>{obs.status}</Badge>
        {obs.requires_action ? <Badge color="orange">Action Required</Badge> : null}
      </div>
      {obs.latitude && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background:'rgba(59,130,246,.07)', border:'1px solid rgba(59,130,246,.2)' }}>
          <FiMapPin size={12} style={{ color:'#2563eb', flexShrink:0 }}/>
          <p style={{ fontSize:11, color:'#2563eb', fontWeight:600, margin:0 }}>
            📍 {parseFloat(obs.latitude).toFixed(5)}, {parseFloat(obs.longitude).toFixed(5)}
            {obs.gps_accuracy ? ` (±${obs.gps_accuracy}m)` : ''}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {[['Type',obs.type],['Mine',obs.mine_name],['Location',obs.location||'—'],['Observed',formatDateTime(obs.observed_at)],['Reporter',obs.reporter_name||'—']].map(([k,v])=>(
          <div key={k} style={{ padding:'8px 10px', borderRadius:8, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 2px' }}>{k}</p>
            <p style={{ fontWeight:600, color:'var(--text-primary)', margin:0, fontSize:12 }}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 4px' }}>Description</p>
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{obs.description}</p>
      </div>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((ph, i) => (
            <a key={i} href={typeof ph==='string'?ph:ph.path} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background:'var(--blue-bg)', border:'1px solid var(--blue-border)', color:'var(--blue)', textDecoration:'none' }}>
              <FiCamera size={11}/> Photo {i+1}
            </a>
          ))}
        </div>
      )}
      {obs.status === 'open' && (
        <button onClick={onAddCA} className="btn-primary btn-sm w-full justify-center">
          <FiPlus size={13}/> Create Corrective Action
        </button>
      )}
    </div>
  );
}

function IncidentDetail({ inc, onAddCA, onClose }) {
  const photos = (() => { try { return JSON.parse(inc.evidence_photos||'[]'); } catch { return []; } })();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge color={SEV_COLOR[inc.severity]||'gray'}>{inc.severity}</Badge>
        <Badge color={inc.status==='closed'?'green':'red'} dot>{inc.status?.replace(/_/g,' ')}</Badge>
        {inc.dgms_notified ? <Badge color="blue">DGMS Notified</Badge> : null}
      </div>
      {inc.latitude && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background:'rgba(59,130,246,.07)', border:'1px solid rgba(59,130,246,.2)' }}>
          <FiMapPin size={12} style={{ color:'#2563eb', flexShrink:0 }}/>
          <p style={{ fontSize:11, color:'#2563eb', fontWeight:600, margin:0 }}>
            📍 {parseFloat(inc.latitude).toFixed(5)}, {parseFloat(inc.longitude).toFixed(5)}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Type',inc.type],['Mine',inc.mine_name],
          ['Location',inc.location_in_mine||'—'],['Date',formatDateTime(inc.incident_date)],
          ['Injuries',inc.injuries_count],['Fatalities',inc.fatalities_count],
          ['People Involved',inc.people_involved||'—'],['Equipment',inc.equipment_involved||'—'],
        ].map(([k,v])=>(
          <div key={k} style={{ padding:'8px 10px', borderRadius:8, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 2px' }}>{k}</p>
            <p style={{ fontWeight:600, color: (k==='Fatalities' && parseInt(v)>0)?'#dc2626':'var(--text-primary)', margin:0, fontSize:12 }}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 4px' }}>Description</p>
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{inc.description}</p>
      </div>
      {inc.immediate_action && (
        <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--accent-bg)', border:'1px solid var(--accent-border)' }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--accent)', margin:'0 0 4px' }}>Immediate Action Taken</p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{inc.immediate_action}</p>
        </div>
      )}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((ph, i) => (
            <a key={i} href={typeof ph==='string'?ph:ph.path} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background:'var(--blue-bg)', border:'1px solid var(--blue-border)', color:'var(--blue)', textDecoration:'none' }}>
              <FiCamera size={11}/> Evidence {i+1}
            </a>
          ))}
        </div>
      )}
      {inc.status !== 'closed' && (
        <button onClick={onAddCA} className="btn-primary btn-sm w-full justify-center">
          <FiPlus size={13}/> Create Corrective Action
        </button>
      )}
    </div>
  );
}

function CADetail({ ca, canVerify, onUpdate }) {
  const isOverdue = ca.is_overdue && !['completed','verified'].includes(ca.status);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge color={CA_STATUS_COLOR[ca.status]||'gray'} dot>{CA_WORKFLOW_LABELS[ca.status]}</Badge>
        <Badge color={PRI_COLOR[ca.priority]||'gray'}>{ca.priority}</Badge>
        {isOverdue && <span style={{ fontSize:10, fontWeight:800, color:'#fff', background:'#dc2626', padding:'1px 7px', borderRadius:999 }}>🔴 OVERDUE Lvl {ca.escalation_level}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Action #',ca.action_number],['Mine',ca.mine_name],
          ['Assigned To',ca.assigned_to_name||'—'],['Department',ca.department||'—'],
          ['Due Date',ca.due_date||'—'],['Source',ca.source_type],
        ].map(([k,v])=>(
          <div key={k} style={{ padding:'8px 10px', borderRadius:8, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 2px' }}>{k}</p>
            <p style={{ fontWeight:600, color:'var(--text-primary)', margin:0, fontSize:12 }}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 4px' }}>Problem</p>
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{ca.problem_description}</p>
      </div>
      {ca.action_description && (
        <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--accent-bg)', border:'1px solid var(--accent-border)' }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--accent)', margin:'0 0 4px' }}>Planned Action</p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{ca.action_description}</p>
        </div>
      )}
      {ca.completion_notes && (
        <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.25)' }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#16a34a', margin:'0 0 4px' }}>Completion Notes</p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{ca.completion_notes}</p>
        </div>
      )}
      {/* Workflow actions */}
      <div className="flex gap-3 pt-2" style={{ borderTop:'1px solid var(--border)' }}>
        {ca.status === 'open' && <button onClick={() => onUpdate({ status:'in_progress' })} className="btn-outline btn-sm flex-1 justify-center">Start Work →</button>}
        {ca.status === 'in_progress' && <button onClick={() => onUpdate({ status:'completed', completion_notes:'Completed' })} className="btn-primary btn-sm flex-1 justify-center">✓ Mark Complete</button>}
        {canVerify && ca.status === 'completed' && <button onClick={() => onUpdate({ status:'verified' })} className="btn-success btn-sm flex-1 justify-center">✓✓ Verify</button>}
      </div>
    </div>
  );
}
