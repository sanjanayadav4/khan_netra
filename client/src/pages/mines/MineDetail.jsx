/**
 * KhanNetra — Mine Detail / Profile
 * Full mine profile with 8 tabs:
 *   Overview · Violations · Incidents · Environment · Inspections · Documents · Mine Plans · Risk & Alerts
 * Uses CSS variables throughout for light/dark theme compatibility.
 */
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FiArrowLeft, FiEdit2, FiFeather, FiFileText, FiAlertOctagon,
  FiAlertTriangle, FiClipboard, FiCpu, FiMapPin, FiLayers,
  FiTarget, FiRss, FiShield, FiCheckSquare,
} from 'react-icons/fi';
import {
  minesApi, violationsApi, incidentsApi,
  environmentApi, inspectionsApi, documentsApi,
  minePlansApi, riskApi, disasterApi,
} from '../../services/api';
import { formatDate, formatMT, scoreToColor, getStatusColor } from '../../utils/helpers';
import ScoreBar from '../../components/ui/ScoreBar';
import Badge from '../../components/ui/Badge';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import MineForm from './MineForm';
import MineMap from './MineMap';
import useAuthStore from '../../store/authStore';
import clsx from 'clsx';

const SEV  = { critical:'red', fatal:'red', high:'yellow', serious:'yellow', medium:'blue', minor:'blue', low:'green', near_miss:'gray' };
const VSTS = { open:'red', under_review:'yellow', action_taken:'blue', closed:'green', appealed:'purple' };

/* ── Small detail row ─────────────────────────────────────────────── */
function DetailRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs" style={{ color:'var(--text-muted)' }}>{label}</dt>
      <dd className="text-sm font-semibold mt-0.5" style={{ color:'var(--text-primary)' }}>{value || '—'}</dd>
    </div>
  );
}

/* ── Empty-tab placeholder ─────────────────────────────────────────── */
function EmptyTab({ icon: Icon, message, link, linkLabel }) {
  return (
    <div className="card text-center py-12 space-y-3">
      <Icon size={32} style={{ color:'var(--text-muted)', margin:'0 auto' }}/>
      <p className="text-sm" style={{ color:'var(--text-muted)' }}>{message}</p>
      {link && <Link to={link} className="btn-outline btn-sm inline-flex mx-auto">{linkLabel}</Link>}
    </div>
  );
}

export default function MineDetail() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuthStore();

  const [mine,       setMine]       = useState(null);
  const [violations, setViolations] = useState([]);
  const [incidents,  setIncidents]  = useState([]);
  const [envLatest,  setEnvLatest]  = useState([]);
  const [inspections,setInspections]= useState([]);
  const [documents,  setDocuments]  = useState([]);
  const [minePlans,  setMinePlans]  = useState([]);
  const [riskData,   setRiskData]   = useState(null);
  const [disaster,   setDisaster]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('overview');
  const [showEdit,   setShowEdit]   = useState(false);

  const canEdit = ['admin','government_officer','mine_manager'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const [m, v, inc, env, ins, docs] = await Promise.all([
        minesApi.getById(id),
        violationsApi.getAll({ mine_id: id, limit: 15 }),
        incidentsApi.getAll({ mine_id: id, limit: 15 }),
        environmentApi.getLatestByMine(id),
        inspectionsApi.getAll({ mine_id: id, limit: 15 }),
        documentsApi.getAll({ mine_id: id, limit: 15 }),
      ]);
      setMine(m.data);
      setViolations(v.data || []);
      setIncidents(inc.data || []);
      setEnvLatest(env.data || []);
      setInspections(ins.data || []);
      setDocuments(docs.data || []);

      // Underground mines: load mine plans
      if (m.data?.type?.toLowerCase().includes('underground')) {
        minePlansApi.getAll({ mine_id: id, limit: 10 }).then(r => setMinePlans(r.data || [])).catch(() => {});
      }

      // Risk prediction (non-blocking)
      riskApi.getRiskPrediction && riskApi.getRiskPrediction(id).then(r => setRiskData(r.data)).catch(() => {});

      // Disaster alerts (non-blocking)
      disasterApi.getActive().then(r => {
        const mine_alerts = (r.data || []).filter(a =>
          (a.affected_mines || []).some(am => am.id === id) ||
          (a.latitude && m.data?.latitude && Math.abs(a.latitude - m.data.latitude) < 2)
        );
        setDisaster(mine_alerts.slice(0, 5));
      }).catch(() => {});

    } catch { navigate('/mines'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <PageLoader message="Loading mine profile…"/>;
  if (!mine)   return null;

  const isUnderground = mine?.type?.toLowerCase().includes('underground');

  const TABS = [
    { id:'overview',    label:'Overview'                              },
    { id:'violations',  label:`Violations (${violations.length})`     },
    { id:'incidents',   label:`Incidents (${incidents.length})`       },
    { id:'environment', label:'Environment'                           },
    { id:'inspections', label:`Inspections (${inspections.length})`   },
    { id:'documents',   label:`Documents (${documents.length})`       },
    ...(isUnderground ? [{ id:'mine-plan', label:`Mine Plans (${minePlans.length})` }] : []),
    { id:'risk',        label:'Risk & Alerts'                         },
  ];

  const scores = [
    { label:'Compliance', value: mine.compliance_score },
    { label:'Safety',     value: mine.safety_score     },
    { label:'Environment',value: mine.environmental_score },
    { label:'Risk Score', value: mine.risk_score, inverted: true },
  ];

  const licenceExpired = mine.license_expiry && new Date(mine.license_expiry) < new Date();
  const licenceSoon    = !licenceExpired && mine.license_expiry && new Date(mine.license_expiry) < new Date(Date.now() + 90*864e5);

  const SEV_ALERT = { CRITICAL:'red', HIGH:'orange', MEDIUM:'yellow', LOW:'blue' };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/mines" className="flex items-center gap-1 text-sm mb-2 transition-colors"
            style={{ color:'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color='var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}>
            <FiArrowLeft size={14}/> Back to Mines
          </Link>
          <h1 className="page-title">{mine.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-sm font-mono" style={{ color:'var(--text-muted)' }}>{mine.mine_id}</span>
            <span style={{ color:'var(--text-muted)' }}>·</span>
            <Badge color={mine.type === 'Underground' ? 'blue' : 'green'}>{mine.type}</Badge>
            <Badge color={getStatusColor(mine.status)} dot>{mine.status.replace(/_/g,' ')}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button onClick={() => setShowEdit(true)} className="btn-outline">
              <FiEdit2 size={15}/> Edit
            </button>
          )}
          <Link to={`/ai/chat`} className="btn-outline">
            <FiCpu size={15}/> AI Assistant
          </Link>
          <Link to={`/risk-dashboard`} className="btn-primary">
            <FiTarget size={15}/> Risk Analysis
          </Link>
        </div>
      </div>

      {/* ── Score cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {scores.map(sc => {
          const val  = parseFloat(sc.value || 0);
          const disp = sc.inverted ? 100 - val : val;
          return (
            <div key={sc.label} className="card">
              <p className="text-xs font-semibold mb-2" style={{ color:'var(--text-muted)' }}>{sc.label}</p>
              <p className={clsx('text-3xl font-black mb-2', scoreToColor(disp))}>{val.toFixed(1)}%</p>
              <ScoreBar score={disp} showLabel={false}/>
            </div>
          );
        })}
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div className="tab-bar flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('tab-item', tab === t.id && 'active')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          OVERVIEW
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card">
            <h3 className="section-title">Mine Information</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              <DetailRow label="State / District"  value={`${mine.state}, ${mine.district}`}/>
              <DetailRow label="Location"          value={mine.location_name}/>
              <DetailRow label="Area"              value={mine.area_hectares ? `${mine.area_hectares} ha` : null}/>
              <DetailRow label="Depth"             value={mine.depth_meters  ? `${mine.depth_meters} m`  : null}/>
              <DetailRow label="Mining Method"     value={mine.mining_method}/>
              <DetailRow label="Established"       value={mine.established_year}/>
              <DetailRow label="Workers"           value={mine.workers_count?.toLocaleString()}/>
              <DetailRow label="Primary Mineral"   value={mine.primary_mineral || 'Coal'}/>
              <DetailRow label="Production (Act.)" value={formatMT(mine.current_production_mt)}/>
              <DetailRow label="Capacity"          value={formatMT(mine.production_capacity_mt)}/>
            </dl>
          </div>

          <div className="space-y-4">
            <div className="card">
              <h3 className="section-title">Owner & Contact</h3>
              <dl className="space-y-2">
                <DetailRow label="Owner"   value={mine.owner_name}/>
                <DetailRow label="Company" value={mine.owner_company}/>
                <DetailRow label="Email"   value={mine.contact_email}/>
                <DetailRow label="Phone"   value={mine.contact_phone}/>
              </dl>
            </div>
            <div className="card">
              <h3 className="section-title">License & Inspection</h3>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="License #" value={mine.license_number}/>
                <div>
                  <dt className="text-xs" style={{ color:'var(--text-muted)' }}>License Expiry</dt>
                  <dd className={clsx('text-sm font-semibold mt-0.5',
                    licenceExpired ? 'text-red-600 font-bold' : licenceSoon ? 'text-amber-600' : '')}
                    style={!licenceExpired && !licenceSoon ? { color:'var(--text-primary)' } : {}}>
                    {formatDate(mine.license_expiry)}
                    {licenceExpired && ' ⛔ EXPIRED'}
                    {licenceSoon && !licenceExpired && ' ⚠️ Soon'}
                  </dd>
                </div>
                <DetailRow label="Last Inspected" value={formatDate(mine.last_inspection_date)}/>
                <DetailRow label="Next Inspection" value={formatDate(mine.next_inspection_date)}/>
              </div>
            </div>
          </div>

          {mine.latitude && mine.longitude && (
            <div className="card p-0 overflow-hidden lg:col-span-2" style={{ height:280 }}>
              <MineMap mines={[mine]}/>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          VIOLATIONS
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'violations' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="section-title mb-0">Violations</h3>
            <Link to={`/violations?mine_id=${id}`} className="btn-outline btn-sm">
              <FiAlertOctagon size={13}/> Manage
            </Link>
          </div>
          {violations.length === 0
            ? <EmptyTab icon={FiCheckSquare} message="No violations recorded ✓"/>
            : <div className="table-container"><table className="table">
                <thead><tr><th>#</th><th>Category</th><th>Severity</th><th>Status</th><th>Fine</th><th>Detected</th></tr></thead>
                <tbody>
                  {violations.map(v => (
                    <tr key={v.id}>
                      <td><span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>{v.violation_number}</span></td>
                      <td>
                        <p className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{v.category}</p>
                        <p className="text-[11px]" style={{ color:'var(--text-muted)' }}>{v.type}</p>
                      </td>
                      <td><Badge color={SEV[v.severity]}>{v.severity}</Badge></td>
                      <td><Badge color={VSTS[v.status] || 'gray'} dot>{v.status.replace('_',' ')}</Badge></td>
                      <td><span className="text-sm" style={{ color:'var(--text-secondary)' }}>₹{Number(v.fine_amount||0).toLocaleString('en-IN')}</span></td>
                      <td><span className="text-xs" style={{ color:'var(--text-muted)' }}>{formatDate(v.detected_date)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          INCIDENTS
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'incidents' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="section-title mb-0">Incidents</h3>
            <Link to={`/incidents?mine_id=${id}`} className="btn-outline btn-sm">
              <FiAlertTriangle size={13}/> Manage
            </Link>
          </div>
          {incidents.length === 0
            ? <EmptyTab icon={FiShield} message="No incidents recorded ✓"/>
            : <div className="table-container"><table className="table">
                <thead><tr><th>#</th><th>Type</th><th>Severity</th><th>Injuries/Fatal</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {incidents.map(i => (
                    <tr key={i.id}>
                      <td><span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>{i.incident_number}</span></td>
                      <td><span className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{i.type}</span></td>
                      <td><Badge color={SEV[i.severity]}>{i.severity.replace('_',' ')}</Badge></td>
                      <td>
                        <span className={clsx('text-sm font-semibold', parseInt(i.fatalities_count) > 0 ? 'text-red-600' : '')}
                          style={parseInt(i.fatalities_count) === 0 ? { color:'var(--text-secondary)' } : {}}>
                          {i.injuries_count} / {i.fatalities_count}
                        </span>
                      </td>
                      <td><span className="text-xs" style={{ color:'var(--text-muted)' }}>{formatDate(i.incident_date)}</span></td>
                      <td><Badge color={i.status === 'closed' ? 'green' : 'red'} dot>{i.status.replace(/_/g,' ')}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ENVIRONMENT
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'environment' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="section-title mb-0">Latest Readings</h3>
            <Link to={`/environment?mine_id=${id}`} className="btn-outline btn-sm">
              <FiFeather size={13}/> Manage
            </Link>
          </div>
          {envLatest.length === 0
            ? <EmptyTab icon={FiFeather} message="No environmental readings recorded"/>
            : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {envLatest.map(r => (
                  <div key={r.parameter} className="card p-4"
                    style={{
                      borderColor: r.status === 'critical' ? 'rgba(239,68,68,.35)' :
                                   r.status === 'warning'  ? 'rgba(245,158,11,.35)' : 'var(--border)',
                      background:  r.status === 'critical' ? 'rgba(239,68,68,.04)' :
                                   r.status === 'warning'  ? 'rgba(245,158,11,.04)' : 'var(--bg-card)',
                    }}>
                    <div className="flex items-center gap-2 mb-2">
                      <FiFeather size={13} style={{ color:'var(--text-muted)' }}/>
                      <span className="text-xs font-semibold" style={{ color:'var(--text-secondary)' }}>{r.parameter}</span>
                    </div>
                    <p className={clsx('text-2xl font-black',
                      r.status === 'critical' ? 'text-red-600' :
                      r.status === 'warning'  ? 'text-amber-600' : 'text-green-600')}>
                      {parseFloat(r.value).toFixed(2)}
                    </p>
                    <p className="text-xs" style={{ color:'var(--text-muted)' }}>{r.unit}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge color={r.status === 'normal' ? 'green' : r.status === 'warning' ? 'yellow' : 'red'}>
                        {r.status}
                      </Badge>
                      <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>max {r.threshold_max}</span>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          INSPECTIONS
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'inspections' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="section-title mb-0">Inspections</h3>
            <Link to={`/inspections?mine_id=${id}`} className="btn-outline btn-sm">
              <FiClipboard size={13}/> Manage
            </Link>
          </div>
          {inspections.length === 0
            ? <EmptyTab icon={FiClipboard} message="No inspections recorded"/>
            : <div className="table-container"><table className="table">
                <thead><tr><th>#</th><th>Type</th><th>Inspector</th><th>Scheduled</th><th>Score</th><th>Status</th></tr></thead>
                <tbody>
                  {inspections.map(ins => (
                    <tr key={ins.id}>
                      <td><span className="font-mono text-xs" style={{ color:'var(--text-muted)' }}>{ins.inspection_number}</span></td>
                      <td><span className="text-sm" style={{ color:'var(--text-primary)' }}>{ins.type}</span></td>
                      <td><span className="text-sm" style={{ color:'var(--text-secondary)' }}>{ins.inspector_name || '—'}</span></td>
                      <td><span className="text-xs" style={{ color:'var(--text-muted)' }}>{formatDate(ins.scheduled_date)}</span></td>
                      <td>
                        {ins.overall_score
                          ? <span className={clsx('text-sm font-bold',
                              parseFloat(ins.overall_score) >= 80 ? 'text-green-600' :
                              parseFloat(ins.overall_score) >= 60 ? 'text-amber-600' : 'text-red-600')}>
                              {parseFloat(ins.overall_score).toFixed(1)}%
                            </span>
                          : <span className="text-xs" style={{ color:'var(--text-muted)' }}>—</span>
                        }
                      </td>
                      <td><Badge color={ins.status === 'completed' ? 'green' : ins.status === 'scheduled' ? 'blue' : 'gray'} dot>{ins.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          DOCUMENTS
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'documents' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="section-title mb-0">Documents</h3>
            <Link to={`/documents?mine_id=${id}`} className="btn-outline btn-sm">
              <FiFileText size={13}/> Manage
            </Link>
          </div>
          {documents.length === 0
            ? <EmptyTab icon={FiFileText} message="No documents uploaded"/>
            : <div className="table-container"><table className="table">
                <thead><tr><th>Title</th><th>Type</th><th>Issuing Authority</th><th>Expiry</th><th>Status</th></tr></thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <FiFileText size={13} style={{ color:'var(--text-muted)', flexShrink:0 }}/>
                          <span className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{doc.title}</span>
                        </div>
                      </td>
                      <td><Badge color="gray">{doc.type}</Badge></td>
                      <td><span className="text-xs" style={{ color:'var(--text-muted)' }}>{doc.issuing_authority || '—'}</span></td>
                      <td>
                        <span className={clsx('text-xs font-medium',
                          doc.status === 'expired' ? 'text-red-600' :
                          doc.status === 'expiring_soon' ? 'text-amber-600' : '')}
                          style={doc.status === 'active' ? { color:'var(--text-secondary)' } : {}}>
                          {formatDate(doc.expiry_date)}
                        </span>
                      </td>
                      <td>
                        <Badge color={doc.status === 'active' ? 'green' : doc.status === 'expired' ? 'red' : 'yellow'} dot>
                          {doc.status.replace('_',' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MINE PLANS (underground only)
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'mine-plan' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="section-title mb-0 flex items-center gap-2">
              <FiLayers size={15} style={{ color:'var(--accent)' }}/> Digital Mine Plans
            </h3>
            <Link to={`/mine-plans?mine_id=${id}`} className="btn-primary btn-sm">
              <FiLayers size={13}/> Manage Plans
            </Link>
          </div>
          {minePlans.length === 0
            ? <EmptyTab icon={FiLayers} message="No digital mine plans uploaded yet" link={`/mine-plans?mine_id=${id}`} linkLabel="Upload First Plan"/>
            : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {minePlans.map(plan => (
                  <div key={plan.id} className="card p-4"
                    style={{
                      borderColor: plan.is_current_version ? 'var(--accent-border)' : 'var(--border)',
                      background:  plan.is_current_version ? 'var(--accent-bg)' : 'var(--bg-card)',
                    }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="font-bold text-sm" style={{ color:'var(--text-primary)' }}>{plan.plan_title}</p>
                        <p className="text-[11px]" style={{ color:'var(--text-muted)' }}>
                          {plan.plan_type} · v{plan.version_number}
                          {plan.is_current_version ? ' · ✓ Current' : ''}
                        </p>
                      </div>
                      <Badge color={
                        plan.approval_status === 'approved' ? 'green' :
                        plan.approval_status === 'rejected' ? 'red'   : 'yellow'
                      }>
                        {plan.approval_status?.replace(/_/g,' ')}
                      </Badge>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Link to={`/mine-plans/${plan.id}`} className="btn-outline btn-sm flex-1 justify-center">View Plan</Link>
                      <a href={`/api/v1/mine-plans/${plan.id}/file`} download className="btn-outline btn-sm" title="Download">↓</a>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          RISK & ALERTS  (new tab)
      ══════════════════════════════════════════════════════════════ */}
      {tab === 'risk' && (
        <div className="space-y-5">
          {/* Risk prediction card */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title mb-0 flex items-center gap-2">
                  <FiTarget size={15} style={{ color:'var(--accent)' }}/> Risk Prediction
                </h3>
                <Link to={`/risk-dashboard`} className="btn-outline btn-sm">Full Risk Dashboard</Link>
              </div>

              {riskData ? (
                <div className="space-y-4">
                  {/* Overall risk */}
                  <div className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
                    <div style={{ textAlign:'center', minWidth:72 }}>
                      <p style={{ fontSize:32, fontWeight:900, color:
                        riskData.risk_level === 'CRITICAL' ? '#dc2626' :
                        riskData.risk_level === 'HIGH'     ? '#ea580c' :
                        riskData.risk_level === 'MEDIUM'   ? '#d97706' : '#16a34a',
                        margin:0 }}>
                        {riskData.overall_risk?.toFixed(0)}%
                      </p>
                      <p style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', margin:'2px 0 0' }}>RISK SCORE</p>
                    </div>
                    <div>
                      <Badge color={
                        riskData.risk_level === 'CRITICAL' ? 'red' :
                        riskData.risk_level === 'HIGH'     ? 'orange' :
                        riskData.risk_level === 'MEDIUM'   ? 'yellow' : 'green'
                      }>{riskData.risk_level || 'Unknown'}</Badge>
                      <p className="text-xs mt-2" style={{ color:'var(--text-secondary)' }}>{mine.name}</p>
                    </div>
                  </div>

                  {/* Risk factors */}
                  {riskData.risk_factors?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'var(--text-muted)' }}>Risk Factors</p>
                      <div className="space-y-2">
                        {riskData.risk_factors.map((f, i) => (
                          <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg"
                            style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
                            <span style={{ fontSize:11, fontWeight:800, color:'var(--accent)', minWidth:18 }}>{i+1}.</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{f.factor}</p>
                              {f.value !== undefined && <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Value: {f.value}</p>}
                            </div>
                            {f.weight !== undefined && (
                              <span className="text-xs font-bold shrink-0" style={{ color:'var(--accent)' }}>{f.weight?.toFixed(0)}%</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {riskData.recommendations?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color:'var(--text-muted)' }}>Recommendations</p>
                      <div className="space-y-1.5">
                        {riskData.recommendations.slice(0,4).map((r, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg"
                            style={{ background:'var(--accent-bg)', border:'1px solid var(--accent-border)' }}>
                            <Badge color={r.priority === 'CRITICAL' ? 'red' : r.priority === 'HIGH' ? 'orange' : 'yellow'}>
                              {r.priority}
                            </Badge>
                            <p className="text-xs" style={{ color:'var(--text-secondary)' }}>{r.action}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FiTarget size={28} style={{ color:'var(--text-muted)', margin:'0 auto 8px' }}/>
                  <p className="text-sm" style={{ color:'var(--text-muted)' }}>Risk data not available for this mine</p>
                  <Link to="/risk-dashboard" className="btn-outline btn-sm mt-3 inline-flex">View Risk Dashboard</Link>
                </div>
              )}
            </div>

            {/* Disaster / active alerts */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title mb-0 flex items-center gap-2">
                  <FiRss size={15} style={{ color:'#dc2626' }}/> Active Alerts
                </h3>
                <Link to="/disaster" className="btn-outline btn-sm">All Alerts</Link>
              </div>

              {disaster.length > 0 ? (
                <div className="space-y-2">
                  {disaster.map(a => (
                    <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl"
                      style={{
                        background: a.severity === 'CRITICAL' ? 'rgba(239,68,68,.07)' : 'rgba(249,115,22,.06)',
                        border:     a.severity === 'CRITICAL' ? '1px solid rgba(239,68,68,.25)' : '1px solid rgba(249,115,22,.22)',
                      }}>
                      <FiRss size={14} style={{ color: a.severity === 'CRITICAL' ? '#dc2626' : '#f97316', flexShrink:0, marginTop:2 }}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color:'var(--text-primary)' }}>{a.title}</p>
                        <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{a.alert_type}</p>
                      </div>
                      <Badge color={SEV_ALERT[a.severity] || 'gray'}>{a.severity}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <FiShield size={24} style={{ color:'#16a34a' }}/>
                  <p className="text-sm font-semibold" style={{ color:'#16a34a' }}>No active alerts</p>
                  <p className="text-xs" style={{ color:'var(--text-muted)' }}>This mine has no associated disaster alerts</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { to:`/compliance?mine_id=${id}`,   label:'Compliance',      icon:FiCheckSquare, color:'#16a34a' },
              { to:`/violations?mine_id=${id}`,   label:'Violations',      icon:FiAlertOctagon,color:'#dc2626' },
              { to:`/incidents?mine_id=${id}`,    label:'Incidents',       icon:FiAlertTriangle,color:'#ea580c'},
              { to:'/disaster',                   label:'Disaster Alerts', icon:FiRss,         color:'#f97316' },
            ].map(({ to, label, icon: Icon, color }) => (
              <Link key={to} to={to}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                style={{ borderColor:'var(--border)', backgroundColor:'var(--bg-card)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=color+'55'; e.currentTarget.style.background=color+'08'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--bg-card)'; }}>
                <div style={{ width:30, height:30, borderRadius:8, background:`${color}15`, border:`1px solid ${color}25`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Icon size={14} style={{ color }}/>
                </div>
                <span className="text-sm font-semibold" style={{ color:'var(--text-secondary)' }}>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Edit modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Mine" size="lg">
        <MineForm mine={mine} onSave={() => { setShowEdit(false); load(); }} onCancel={() => setShowEdit(false)}/>
      </Modal>
    </div>
  );
}
