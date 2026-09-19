/**
 * KhanNetra DGMS — Compliance Management
 * Full SIH compliance workflow:
 *   Pending → Submitted → Under Verification → Approved / Rejected → Resubmit
 *
 * Tabs:
 *  1. Dashboard  — KPI cards, category scores (Safety/Labour/Env/Production), deadlines
 *  2. Records    — filterable table with inline workflow actions
 *  3. Deadlines  — upcoming + overdue with visual urgency badges
 *  4. Regulations— link to existing Regulations page (unchanged)
 *
 * All data from real backend. No hardcoded values.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCheckSquare, FiPlus, FiCpu, FiEdit2, FiCheck, FiX,
  FiAlertTriangle, FiClock, FiSearch,
  FiFileText, FiUpload, FiEye, FiRefreshCw, FiChevronRight,
  FiShield, FiFeather, FiUsers, FiBarChart2,
} from 'react-icons/fi';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import { complianceApi, minesApi, documentsApi } from '../../services/api';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import ScoreBar from '../../components/ui/ScoreBar';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

/* ── Constants ──────────────────────────────────────────────────── */
const WORKFLOW_STEPS = ['pending', 'submitted', 'under_verification', 'approved'];

const WORKFLOW_CFG = {
  pending:            { badge:'gray',   label:'Pending'           },
  submitted:          { badge:'blue',   label:'Submitted'         },
  under_verification: { badge:'yellow', label:'Under Review'      },
  approved:           { badge:'green',  label:'Approved'          },
  rejected:           { badge:'red',    label:'Rejected'          },
};

const STATUS_COLOR   = { compliant:'green', non_compliant:'red', warning:'yellow', pending:'gray' };
const CATEGORY_COLOR = { Safety:'red', Environmental:'teal', Labour:'blue', Production:'orange', Operational:'orange', Documentation:'purple' };
const CATEGORY_ICON  = { Safety:FiShield, Environmental:FiFeather, Labour:FiUsers, Production:FiBarChart2, Operational:FiBarChart2, Documentation:FiFileText };

/* Requirements per category */
const REQUIREMENTS = {
  Safety: [
    'Helmet / PPE Compliance','Fire Extinguisher Inspection','Emergency Exit Marking',
    'Ventilation System Check','Machinery Safety Guards','First Aid Kit Availability',
    'Safety Drill Conducted','Gas Detector Calibration','Electrical Safety Audit',
    'Roof Support Inspection',
  ],
  Environmental: [
    'Air Quality Monitoring (PM10)','Water Discharge Quality','Coal Dust Suppression',
    'Noise Level Measurement','Land Reclamation Plan','Waste Disposal Record',
    'Environmental Impact Assessment','Tree Plantation Record','Effluent Treatment',
  ],
  Labour: [
    'Worker Attendance Register','Working Hours Compliance','Safety Training Records',
    'Contractor Worker Registration','Wages Disbursement Record','Medical Fitness Certificates',
    'Welfare Facilities Inspection','Grievance Register','Leave Records',
  ],
  Production: [
    'Monthly Production Report','Blasting Operations Record','Equipment Utilisation Log',
    'Transport Compliance Record','Ore Grade Report','Surveyor Certificate',
    'Mine Plan Currency','Royalty Payment Record',
  ],
};

/* Deadline urgency */
function getUrgency(daysRemaining) {
  const d = parseFloat(daysRemaining);
  if (d < 0)  return { label:'Overdue',      color:'#dc2626', bg:'rgba(239,68,68,.10)', border:'rgba(239,68,68,.30)' };
  if (d === 0)return { label:'Due Today',    color:'#dc2626', bg:'rgba(239,68,68,.08)', border:'rgba(239,68,68,.25)' };
  if (d <= 1) return { label:'Due Tomorrow', color:'#ea580c', bg:'rgba(249,115,22,.08)',border:'rgba(249,115,22,.25)' };
  if (d <= 7) return { label:`${Math.round(d)}d`, color:'#d97706', bg:'rgba(245,158,11,.07)', border:'rgba(245,158,11,.25)' };
  return           { label:`${Math.round(d)}d`, color:'var(--text-muted)', bg:'var(--bg-card-hover)', border:'var(--border)' };
}

/* Score colour helper */
const scoreColor = (v) => parseFloat(v) >= 80 ? '#16a34a' : parseFloat(v) >= 60 ? '#d97706' : '#dc2626';

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════ */
export default function Compliance() {
  const { user } = useAuthStore();

  const [tab,          setTab]          = useState('dashboard');
  const [records,      setRecords]      = useState([]);
  const [deadlines,    setDeadlines]    = useState([]);
  const [dashboard,    setDashboard]    = useState(null);
  const [mines,        setMines]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [aiResult,     setAiResult]     = useState(null);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [selMine,      setSelMine]      = useState('');
  const [filters,      setFilters]      = useState({ workflow_status:'', category:'', search:'' });
  const [showForm,     setShowForm]     = useState(false);
  const [editItem,     setEditItem]     = useState(null);
  const [viewItem,     setViewItem]     = useState(null);
  const [rejectDlg,    setRejectDlg]    = useState(null);
  const [actionBusy,   setActionBusy]   = useState({});

  const canWrite  = ['admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'].includes(user?.role);
  const canVerify = ['admin','government_officer','inspector'].includes(user?.role);

  /* ── Load all data ─────────────────────────────────────────────── */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const p = { mine_id: selMine || undefined, ...filters };
      const [recs, dash, dl] = await Promise.allSettled([
        complianceApi.getRecords(p),
        complianceApi.getDashboard({ mine_id: selMine || undefined }),
        complianceApi.getDeadlines({ mine_id: selMine || undefined, days: 30 }),
      ]);
      setRecords(recs.status === 'fulfilled'    ? (recs.value?.data  || []) : []);
      setDashboard(dash.status === 'fulfilled'  ?  dash.value?.data         : null);
      setDeadlines(dl.status   === 'fulfilled'  ? (dl.value?.data   || []) : []);
    } catch {}
    finally { setLoading(false); }
  }, [selMine, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{}); }, []);

  /* ── AI ──────────────────────────────────────────────────────── */
  const runAI = async () => {
    if (!selMine) { toast.error('Select a mine first'); return; }
    setAiLoading(true);
    try { const r = await complianceApi.runAiAssessment(selMine); setAiResult(r.data); }
    catch { toast.error('AI assessment failed'); }
    finally { setAiLoading(false); }
  };

  /* ── Workflow action ───────────────────────────────────────────── */
  const doAction = async (id, action, extra = {}) => {
    setActionBusy(s => ({ ...s, [id]: action }));
    try {
      if      (action === 'submit')  await complianceApi.submitRecord(id, extra);
      else if (action === 'verify')  await complianceApi.startVerification(id);
      else if (action === 'approve') await complianceApi.approveRecord(id, extra);
      else if (action === 'reject')  await complianceApi.rejectRecord(id, extra);
      toast.success(`Record ${action}d successfully`);
      load(true);
      setViewItem(null); setRejectDlg(null);
    } catch (e) {
      toast.error(e.response?.data?.message || `Action '${action}' failed`);
    } finally {
      setActionBusy(s => { const n = { ...s }; delete n[id]; return n; });
    }
  };

  /* ── Filtered records ─────────────────────────────────────────── */
  const filtered = records.filter(r => {
    const q = (filters.search || '').toLowerCase();
    return !q || r.parameter_name?.toLowerCase().includes(q) || r.mine_name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <BackButton/>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiCheckSquare style={{ color:'var(--accent)' }}/> Compliance Management
          </h1>
          <p className="page-subtitle">
            SIH-aligned compliance monitoring — Safety · Labour · Environmental · Production
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={selMine} onChange={e => setSelMine(e.target.value)} className="select w-48">
            <option value="">All Mines</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={() => load(true)} className="btn-outline btn-sm">
            <FiRefreshCw size={13}/> Refresh
          </button>
          <button onClick={runAI} disabled={aiLoading || !selMine} className="btn-outline btn-sm">
            <FiCpu size={13}/> {aiLoading ? 'Analysing…' : 'AI Assessment'}
          </button>
          {canWrite && (
            <button onClick={() => setShowForm(true)} className="btn-primary btn-sm">
              <FiPlus size={13}/> Add Record
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[
          { id:'dashboard', label:'Dashboard'                          },
          { id:'records',   label:`Records (${filtered.length})`       },
          { id:'deadlines', label:`Deadlines (${deadlines.length})`    },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('tab-item', tab === t.id && 'active')}>
            {t.label}
          </button>
        ))}
        <Link to="/compliance/regulations" className="tab-item flex items-center gap-1">
          Regulations <FiChevronRight size={11}/>
        </Link>
      </div>

      {loading ? <PageLoader message="Loading compliance data…"/> : (
        <>
          {tab === 'dashboard' && (
            <DashboardTab dashboard={dashboard} deadlines={deadlines}/>
          )}
          {tab === 'records' && (
            <RecordsTab
              records={filtered}
              filters={filters}
              setFilters={setFilters}
              canWrite={canWrite}
              canVerify={canVerify}
              onEdit={r  => { setEditItem(r); setShowForm(true); }}
              onView={r  => setViewItem(r)}
              onAction={doAction}
              onReject={r => setRejectDlg(r)}
              actionBusy={actionBusy}
            />
          )}
          {tab === 'deadlines' && <DeadlinesTab deadlines={deadlines}/>}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditItem(null); }}
        title={editItem ? 'Update Compliance Record' : 'Add Compliance Record'} size="lg">
        <ComplianceForm
          mines={mines} record={editItem}
          onSave={() => { setShowForm(false); setEditItem(null); load(); }}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      </Modal>

      {/* Record detail modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title="Record Details" size="lg">
        {viewItem && (
          <RecordDetail
            record={viewItem}
            canVerify={canVerify}
            actionBusy={actionBusy}
            onAction={doAction}
            onReject={() => setRejectDlg(viewItem)}
          />
        )}
      </Modal>

      {/* Reject dialog */}
      <Modal isOpen={!!rejectDlg} onClose={() => setRejectDlg(null)} title="Reject — Provide Reason" size="sm">
        {rejectDlg && (
          <RejectForm
            record={rejectDlg}
            onReject={reason => doAction(rejectDlg.id, 'reject', { rejection_reason: reason })}
            onCancel={() => setRejectDlg(null)}
          />
        )}
      </Modal>

      {/* AI result modal */}
      <Modal isOpen={!!aiResult} onClose={() => setAiResult(null)} title="AI Compliance Assessment" size="md">
        {aiResult && <AIResultPanel result={aiResult}/>}
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
════════════════════════════════════════════════════════════════════ */
function DashboardTab({ dashboard, deadlines }) {
  if (!dashboard) return (
    <div className="card text-center py-14">
      <FiCheckSquare size={32} style={{ color:'var(--text-muted)', margin:'0 auto 12px' }}/>
      <p style={{ color:'var(--text-muted)' }}>
        No compliance data yet. Select a mine or add records.
      </p>
    </div>
  );

  const overall = parseFloat(dashboard.overall_score || 0);
  const wf      = dashboard.workflow || {};

  /* Map DB categories to the 4 SIH required ones */
  const CATS = ['Safety','Environmental','Labour','Production'];
  const catMap = {};
  (dashboard.by_category || []).forEach(c => { catMap[c.category] = c; });

  const radarData = (dashboard.by_category || []).map(c => ({
    subject: (c.category||'').substring(0, 11),
    score:   parseFloat(c.avg_score || 0),
  }));

  const overdue  = deadlines.filter(d => parseFloat(d.days_remaining) <  0);
  const upcoming = deadlines.filter(d => parseFloat(d.days_remaining) >= 0);

  return (
    <div className="space-y-5">

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">

        {/* Overall % */}
        <div className="card col-span-2 flex items-center gap-4 p-5"
          style={{ background:'linear-gradient(135deg,var(--bg-card),var(--accent-bg))', border:'1px solid var(--accent-border)' }}>
          <div>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)', margin:0 }}>
              Overall Compliance
            </p>
            <p style={{ fontSize:40, fontWeight:900, color:scoreColor(overall), margin:'4px 0 0', lineHeight:1 }}>
              {overall.toFixed(0)}%
            </p>
            <div style={{ marginTop:8, width:120 }}>
              <ScoreBar score={overall} showLabel={false}/>
            </div>
          </div>
        </div>

        {/* Workflow stage counts */}
        {[
          { label:'Pending',      value:wf.pending,            color:'#94a3b8' },
          { label:'Submitted',    value:wf.submitted,          color:'#3b82f6' },
          { label:'Under Review', value:wf.under_verification, color:'#f59e0b' },
          { label:'Approved',     value:wf.approved,           color:'#16a34a' },
          { label:'Rejected',     value:wf.rejected,           color:'#dc2626' },
        ].map(k => (
          <div key={k.label} className="card p-3 text-center">
            <p style={{ fontSize:24, fontWeight:900, color:k.color, margin:0 }}>{k.value||0}</p>
            <p style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', margin:'3px 0 0' }}>{k.label}</p>
          </div>
        ))}

        {/* Overdue */}
        <div className="card p-3 text-center"
          style={{ borderColor:wf.overdue>0?'rgba(239,68,68,.35)':'var(--border)', background:wf.overdue>0?'rgba(239,68,68,.06)':'var(--bg-card)' }}>
          <p style={{ fontSize:24, fontWeight:900, color:wf.overdue>0?'#dc2626':'#16a34a', margin:0 }}>{wf.overdue||0}</p>
          <p style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', margin:'3px 0 0' }}>Overdue</p>
        </div>
      </div>

      {/* ── Category cards + radar ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 4 SIH category cards */}
        <div className="grid grid-cols-2 gap-3">
          {CATS.map(name => {
            const data  = catMap[name] || null;
            const Icon  = CATEGORY_ICON[name] || FiCheckSquare;
            const score = data ? parseFloat(data.avg_score || 0) : null;
            const dot   = score === null ? '#94a3b8' : scoreColor(score);
            const status= score === null ? 'No Data' : score>=80?'Good':score>=60?'Warning':'Critical';
            return (
              <div key={name} className="card p-4"
                style={{ borderColor:score!==null&&score<60?'rgba(239,68,68,.25)':'var(--border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div style={{ width:30, height:30, borderRadius:8, background:`${dot}15`, border:`1px solid ${dot}25`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Icon size={14} style={{ color:dot }}/>
                  </div>
                  <p className="text-xs font-bold" style={{ color:'var(--text-primary)' }}>{name}</p>
                </div>
                <p style={{ fontSize:28, fontWeight:900, color:dot, margin:0 }}>
                  {score !== null ? `${score.toFixed(0)}%` : '—'}
                </p>
                <p style={{ fontSize:10, fontWeight:700, color:dot, margin:'2px 0 0' }}>{status}</p>
                {data && (
                  <div style={{ marginTop:8 }}>
                    <ScoreBar score={score} showLabel={false} height="h-1.5"/>
                    <p className="text-[10px] mt-1" style={{ color:'var(--text-muted)' }}>
                      {data.compliant||0} compliant · {data.non_compliant||0} non-compliant
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Radar chart */}
        <div className="card">
          <h3 className="section-title">Compliance Radar</h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)"/>
                <PolarAngleAxis dataKey="subject" tick={{ fontSize:10, fill:'var(--text-muted)' }}/>
                <Radar dataKey="score" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.18} strokeWidth={2}/>
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40">
              <p style={{ color:'var(--text-muted)', fontSize:13 }}>
                Select a mine to view the radar chart
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Deadline preview ─────────────────────────────────────── */}
      {(overdue.length > 0 || upcoming.length > 0) && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2 mb-4">
            <FiClock size={14} style={{ color:'var(--accent)' }}/> Upcoming Deadlines
          </h3>
          <div className="space-y-2">
            {[...overdue, ...upcoming].slice(0,6).map(d => {
              const urg = getUrgency(d.days_remaining);
              return (
                <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                  style={{ background:urg.bg, border:`1px solid ${urg.border}` }}>
                  <span style={{ fontSize:10, fontWeight:800, color:urg.color, padding:'2px 7px', borderRadius:999, background:`${urg.color}18`, minWidth:54, textAlign:'center', whiteSpace:'nowrap' }}>
                    {urg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{d.parameter_name}</p>
                    <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{d.category}</p>
                  </div>
                  <Badge color={WORKFLOW_CFG[d.workflow_status]?.badge||'gray'}>
                    {WORKFLOW_CFG[d.workflow_status]?.label||d.workflow_status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RECORDS TAB
════════════════════════════════════════════════════════════════════ */
function RecordsTab({ records, filters, setFilters, canWrite, canVerify, onEdit, onView, onAction, onReject, actionBusy }) {
  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="card-sm flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search:e.target.value }))}
            className="input" style={{ paddingLeft:32 }} placeholder="Search parameter, mine…"/>
        </div>
        <select value={filters.workflow_status} onChange={e => setFilters(f => ({ ...f, workflow_status:e.target.value }))}
          className="select" style={{ width:'auto' }}>
          <option value="">All Stages</option>
          {Object.entries(WORKFLOW_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category:e.target.value }))}
          className="select" style={{ width:'auto' }}>
          <option value="">All Categories</option>
          {['Safety','Environmental','Labour','Production','Operational','Documentation'].map(c =>
            <option key={c} value={c}>{c}</option>
          )}
        </select>
      </div>

      {/* Stage pills */}
      <div className="tab-bar">
        {[['','All'],['pending','Pending'],['submitted','Submitted'],['under_verification','Under Review'],['approved','Approved'],['rejected','Rejected']].map(([v,l]) => (
          <button key={v} onClick={() => setFilters(f => ({ ...f, workflow_status:v }))}
            className={clsx('tab-item', filters.workflow_status === v && 'active')}>
            {l}
          </button>
        ))}
      </div>

      {records.length === 0 ? (
        <div className="card text-center py-10">
          <FiCheckSquare size={28} style={{ color:'var(--text-muted)', margin:'0 auto 8px' }}/>
          <p style={{ color:'var(--text-muted)' }}>No records match your filters</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Mine</th><th>Category</th><th>Requirement</th>
                <th>Deadline</th><th>Score</th><th>Stage</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => {
                const wf   = WORKFLOW_CFG[r.workflow_status] || WORKFLOW_CFG.pending;
                const days = r.due_date ? (new Date(r.due_date) - new Date()) / 86400000 : null;
                const urg  = days !== null ? getUrgency(days) : null;
                const busy = actionBusy[r.id];
                return (
                  <tr key={r.id} style={{ cursor:'pointer' }} onClick={() => onView(r)}>
                    <td>
                      <p className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{r.mine_name}</p>
                    </td>
                    <td>
                      <Badge color={CATEGORY_COLOR[r.category]||'gray'}>{r.category}</Badge>
                    </td>
                    <td>
                      <p className="text-sm" style={{ color:'var(--text-primary)' }}>{r.parameter_name}</p>
                      {r.responsible_officer_name && (
                        <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                          👤 {r.responsible_officer_name}
                        </p>
                      )}
                    </td>
                    <td>
                      {urg ? (
                        <span style={{ fontSize:11, fontWeight:700, color:urg.color, padding:'2px 8px', borderRadius:999, background:urg.bg, border:`1px solid ${urg.border}`, whiteSpace:'nowrap' }}>
                          {urg.label}
                        </span>
                      ) : <span style={{ color:'var(--text-muted)', fontSize:12 }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize:14, fontWeight:800, color:scoreColor(r.score) }}>
                        {r.score}%
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <Badge color={wf.badge} dot>{wf.label}</Badge>
                      {r.workflow_status === 'rejected' && r.rejection_reason && (
                        <p className="text-[10px] text-red-600 mt-0.5 max-w-32 truncate">{r.rejection_reason}</p>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* Submit */}
                        {canWrite && ['pending','rejected'].includes(r.workflow_status) && (
                          <button disabled={!!busy} onClick={() => onAction(r.id,'submit')}
                            style={{ background:'rgba(59,130,246,.12)', border:'1px solid rgba(59,130,246,.3)', color:'#2563eb', borderRadius:7, padding:'4px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {busy==='submit'?'…':'Submit'}
                          </button>
                        )}
                        {/* Review */}
                        {canVerify && r.workflow_status === 'submitted' && (
                          <button disabled={!!busy} onClick={() => onAction(r.id,'verify')}
                            style={{ background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.3)', color:'#d97706', borderRadius:7, padding:'4px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {busy==='verify'?'…':'Review'}
                          </button>
                        )}
                        {/* Approve + Reject */}
                        {canVerify && r.workflow_status === 'under_verification' && (
                          <>
                            <button disabled={!!busy} onClick={() => onAction(r.id,'approve')}
                              style={{ background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.3)', color:'#16a34a', borderRadius:7, padding:'4px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                              {busy==='approve'?'…':'✓'}
                            </button>
                            <button disabled={!!busy} onClick={() => onReject(r)}
                              style={{ background:'rgba(239,68,68,.10)', border:'1px solid rgba(239,68,68,.3)', color:'#dc2626', borderRadius:7, padding:'4px 8px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                              {busy==='reject'?'…':'✗'}
                            </button>
                          </>
                        )}
                        {/* Edit */}
                        {canWrite && ['pending','rejected'].includes(r.workflow_status) && (
                          <button onClick={() => onEdit(r)}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color:'var(--text-muted)' }}
                            onMouseEnter={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.background='var(--accent-bg)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color='var(--text-muted)'; e.currentTarget.style.background=''; }}>
                            <FiEdit2 size={13}/>
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
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DEADLINES TAB
════════════════════════════════════════════════════════════════════ */
function DeadlinesTab({ deadlines }) {
  const overdue  = deadlines.filter(d => parseFloat(d.days_remaining) <  0);
  const today    = deadlines.filter(d => parseFloat(d.days_remaining) === 0);
  const upcoming = deadlines.filter(d => parseFloat(d.days_remaining) >  0);

  const Group = ({ title, items, titleColor }) => (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:titleColor }}>
        {title} ({items.length})
      </p>
      <div className="space-y-2">
        {items.length === 0
          ? <p style={{ color:'var(--text-muted)', fontSize:12 }}>None</p>
          : items.map(d => {
              const urg = getUrgency(parseFloat(d.days_remaining));
              return (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background:urg.bg, border:`1px solid ${urg.border}` }}>
                  <span style={{ fontSize:10, fontWeight:800, color:urg.color, padding:'2px 7px', borderRadius:999, background:`${urg.color}18`, minWidth:60, textAlign:'center', whiteSpace:'nowrap' }}>
                    {urg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{d.parameter_name}</p>
                    <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>
                      {d.category} · {d.mine_name}
                      {d.responsible_officer_name && ` · 👤 ${d.responsible_officer_name}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-semibold" style={{ color:'var(--text-muted)' }}>{d.due_date}</p>
                    <Badge color={WORKFLOW_CFG[d.workflow_status]?.badge||'gray'}>
                      {WORKFLOW_CFG[d.workflow_status]?.label||d.workflow_status}
                    </Badge>
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Group title="🔴 Overdue"              items={overdue}  titleColor="#dc2626"/>
      <Group title="🟠 Due Today"            items={today}    titleColor="#ea580c"/>
      <Group title="🟡 Upcoming (30 days)"   items={upcoming} titleColor="#d97706"/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RECORD DETAIL MODAL
════════════════════════════════════════════════════════════════════ */
function RecordDetail({ record: r, canVerify, actionBusy, onAction, onReject }) {
  const wf   = WORKFLOW_CFG[r.workflow_status] || WORKFLOW_CFG.pending;
  const busy = actionBusy[r.id];
  const stepIdx = WORKFLOW_STEPS.indexOf(r.workflow_status);
  const isRejected = r.workflow_status === 'rejected';

  return (
    <div className="space-y-5">
      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge color={CATEGORY_COLOR[r.category]||'gray'}>{r.category}</Badge>
        <Badge color={wf.badge} dot>{wf.label}</Badge>
        {r.resubmission_count > 0 && <Badge color="orange">Resubmitted ×{r.resubmission_count}</Badge>}
      </div>

      {/* Title */}
      <div className="card p-4" style={{ background:'var(--bg-card-hover)' }}>
        <p className="font-bold text-base" style={{ color:'var(--text-primary)' }}>{r.parameter_name}</p>
        <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{r.mine_name}</p>
      </div>

      {/* Workflow progress bar */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:'var(--text-muted)' }}>
          Workflow Progress
        </p>
        <div className="flex items-center">
          {WORKFLOW_STEPS.map((step, i) => {
            const done = !isRejected && i < stepIdx;
            const curr = i === stepIdx && !isRejected;
            const rej  = isRejected && i === Math.max(0, stepIdx);
            const dot  = rej ? '#ef4444' : (done||curr) ? 'var(--accent)' : 'var(--border)';
            return (
              <div key={step} className="flex items-center flex-1">
                <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0, background: rej?'rgba(239,68,68,.15)':(done||curr)?'var(--accent-bg)':'var(--bg-card-hover)', border:`2px solid ${dot}`, color: rej?'#dc2626':(done||curr)?'var(--accent)':'var(--text-muted)' }}>
                  {rej ? '✗' : done ? '✓' : i+1}
                </div>
                <p style={{ fontSize:9, color: curr?'var(--accent)':done?'var(--text-secondary)':'var(--text-muted)', fontWeight:curr?700:400, margin:'0 4px', whiteSpace:'nowrap' }}>
                  {WORKFLOW_CFG[step]?.label}
                </p>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div style={{ flex:1, height:1, background: done?'var(--accent)':'var(--border)', margin:'0 2px' }}/>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Required',    r.required_value || '—'],
          ['Actual',      r.actual_value   || '—'],
          ['Score',       `${r.score}%`           ],
          ['Due Date',    r.due_date       || '—' ],
          ['Responsible', r.responsible_officer_name || '—'],
          ['Verified By', r.verified_by_name         || '—'],
        ].map(([k, v]) => (
          <div key={k} style={{ padding:'8px 10px', borderRadius:8, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-muted)', margin:'0 0 3px' }}>{k}</p>
            <p style={{ fontWeight:600, color:'var(--text-primary)', margin:0, fontSize:12 }}>{v}</p>
          </div>
        ))}
      </div>

      {r.notes && (
        <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--text-muted)', margin:'0 0 4px' }}>Notes</p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, margin:0 }}>{r.notes}</p>
        </div>
      )}

      {r.rejection_reason && (
        <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.25)' }}>
          <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#dc2626', margin:'0 0 4px' }}>Rejection Reason</p>
          <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, margin:0 }}>{r.rejection_reason}</p>
        </div>
      )}

      {/* Verifier actions */}
      {canVerify && r.workflow_status === 'under_verification' && (
        <div className="flex gap-3 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
          <button onClick={() => onAction(r.id,'approve')} disabled={!!busy} className="btn-primary btn-sm flex-1 justify-center">
            <FiCheck size={13}/> {busy==='approve'?'Approving…':'Approve'}
          </button>
          <button onClick={onReject} disabled={!!busy} className="btn-danger btn-sm flex-1 justify-center">
            <FiX size={13}/> Reject with Reason
          </button>
        </div>
      )}
      {canVerify && r.workflow_status === 'submitted' && (
        <button onClick={() => onAction(r.id,'verify')} disabled={!!busy} className="btn-primary btn-sm w-full justify-center">
          <FiEye size={13}/> {busy==='verify'?'Starting…':'Start Verification'}
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   REJECT FORM
════════════════════════════════════════════════════════════════════ */
function RejectForm({ record, onReject, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy,   setBusy]   = useState(false);

  const confirm = async () => {
    if (!reason.trim()) { toast.error('Rejection reason is required'); return; }
    setBusy(true);
    await onReject(reason.trim());
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p className="font-semibold text-sm" style={{ color:'var(--text-primary)', margin:0 }}>{record.parameter_name}</p>
        <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{record.mine_name} · {record.category}</p>
      </div>
      <div className="form-group">
        <label className="label">Rejection Reason *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} className="input" rows={4}
          placeholder="State clearly why this record is rejected and what correction is required…"
          style={{ resize:'vertical', minHeight:90 }}/>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
          This reason will be visible to the responsible officer for correction and resubmission.
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary btn-sm flex-1 justify-center">Cancel</button>
        <button onClick={confirm} disabled={busy || !reason.trim()} className="btn-danger btn-sm flex-1 justify-center">
          {busy ? 'Rejecting…' : 'Confirm Rejection'}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   ADD / EDIT FORM
════════════════════════════════════════════════════════════════════ */
function ComplianceForm({ mines, record, onSave, onCancel }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: record || {},
  });
  const [uploading, setUploading] = useState(false);
  const [docId,     setDocId]     = useState(record?.document_id || null);
  const [docName,   setDocName]   = useState('');

  const category = watch('category');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file',  file);
      fd.append('title', `Compliance Evidence — ${file.name}`);
      fd.append('type',  'Compliance Evidence');
      fd.append('category', 'Compliance');
      const r = await documentsApi.upload(fd);
      setDocId(r.data?.id);
      setDocName(file.name);
      toast.success('Document uploaded');
    } catch { toast.error('Upload failed'); }
    finally { setUploading(false); }
  };

  const onSubmit = async (data) => {
    try {
      const payload = { ...data, document_id: docId };
      if (record?.id) { await complianceApi.update(record.id, payload); toast.success('Record updated'); }
      else            { await complianceApi.create(payload);             toast.success('Record created'); }
      onSave();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!record && (
          <div className="form-group sm:col-span-2">
            <label className="label">Mine *</label>
            <select {...register('mine_id', { required:'Mine is required' })} className="select">
              <option value="">Select Mine</option>
              {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {errors.mine_id && <p className="text-xs text-red-600 mt-1">{errors.mine_id.message}</p>}
          </div>
        )}

        <div className="form-group">
          <label className="label">Category *</label>
          <select {...register('category', { required:'Category is required' })} className="select">
            <option value="">Select Category</option>
            {['Safety','Environmental','Labour','Production','Operational','Documentation'].map(c =>
              <option key={c} value={c}>{c}</option>
            )}
          </select>
          {errors.category && <p className="text-xs text-red-600 mt-1">{errors.category.message}</p>}
        </div>

        <div className="form-group">
          <label className="label">Requirement / Parameter *</label>
          {category && REQUIREMENTS[category] ? (
            <select {...register('parameter_name', { required:true })} className="select">
              <option value="">Select Requirement</option>
              {REQUIREMENTS[category].map(r => <option key={r} value={r}>{r}</option>)}
              <option value="__custom__">Other…</option>
            </select>
          ) : (
            <input {...register('parameter_name', { required:'Parameter is required' })} className="input"
              placeholder="e.g. Fire extinguisher inspection"/>
          )}
        </div>

        <div className="form-group">
          <label className="label">Required Standard</label>
          <input {...register('required_value')} className="input"
            placeholder="e.g. Monthly inspection, CMR 2017 Reg 168"/>
        </div>

        <div className="form-group">
          <label className="label">Actual Value / Finding</label>
          <input {...register('actual_value')} className="input"
            placeholder="e.g. Last inspected 3 months ago"/>
        </div>

        <div className="form-group">
          <label className="label">Status</label>
          <select {...register('status')} className="select">
            <option value="pending">Pending</option>
            <option value="compliant">Compliant</option>
            <option value="non_compliant">Non-Compliant</option>
            <option value="warning">Warning</option>
          </select>
        </div>

        <div className="form-group">
          <label className="label">Score (0–100)</label>
          <input type="number" min="0" max="100" {...register('score')} className="input"/>
        </div>

        <div className="form-group">
          <label className="label">Due Date</label>
          <input type="date" {...register('due_date')} className="input"/>
        </div>

        <div className="form-group sm:col-span-2">
          <label className="label">Remarks / Notes</label>
          <textarea {...register('notes')} rows={2} className="input" style={{ resize:'vertical' }}/>
        </div>

        {/* Document upload */}
        <div className="form-group sm:col-span-2">
          <label className="label">Supporting Document (Evidence)</label>
          <div className="flex items-center gap-3">
            <label className="btn-outline btn-sm cursor-pointer flex items-center gap-2">
              <FiUpload size={13}/>
              {uploading ? 'Uploading…' : docName ? `📎 ${docName}` : 'Attach Evidence'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.csv"/>
            </label>
            {docId && !uploading && (
              <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>✓ Document attached</span>
            )}
          </div>
          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            PDF, Word, Excel, Images accepted. Max 10 MB.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting || uploading} className="btn-primary">
          {isSubmitting ? 'Saving…' : record ? 'Update Record' : 'Add Record'}
        </button>
      </div>
    </form>
  );
}

/* ════════════════════════════════════════════════════════════════════
   AI RESULT PANEL
════════════════════════════════════════════════════════════════════ */
function AIResultPanel({ result }) {
  const color = result.risk_level === 'CRITICAL' ? '#dc2626'
    : result.risk_level === 'HIGH'   ? '#ea580c'
    : result.risk_level === 'MEDIUM' ? '#d97706'
    : '#16a34a';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 rounded-xl"
        style={{ background:`${color}10`, border:`1px solid ${color}30` }}>
        <div>
          <p style={{ fontWeight:900, fontSize:20, color, margin:0 }}>{result.risk_level}</p>
          <p style={{ fontSize:12, color:'var(--text-muted)', margin:'2px 0 0' }}>{result.mine_name}</p>
        </div>
        <p style={{ fontWeight:900, fontSize:36, color, margin:0 }}>{result.risk_score}%</p>
      </div>
      <div style={{ padding:'12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>{result.summary}</p>
      </div>
      <div className="space-y-2">
        {result.recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl"
            style={{
              background: rec.priority==='CRITICAL'?'rgba(239,68,68,.07)':rec.priority==='HIGH'?'rgba(249,115,22,.07)':'rgba(59,130,246,.07)',
              border:     rec.priority==='CRITICAL'?'1px solid rgba(239,68,68,.25)':rec.priority==='HIGH'?'1px solid rgba(249,115,22,.25)':'1px solid rgba(59,130,246,.20)',
            }}>
            <Badge color={rec.priority==='CRITICAL'?'red':rec.priority==='HIGH'?'orange':'blue'}>{rec.priority}</Badge>
            <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, lineHeight:1.5 }}>{rec.action}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
