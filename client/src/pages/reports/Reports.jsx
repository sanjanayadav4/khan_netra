/**
 * KhanNetra — Reports  v2
 * 8 report types, real-data preview, PDF + Excel export.
 */
import { useState, useEffect, useCallback } from 'react';
import BackButton from '../../components/ui/BackButton';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { PageLoader, LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { reportsApi, minesApi } from '../../services/api';
import { formatDate, downloadBlob } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  FiBarChart2, FiDownload, FiAlertTriangle, FiFeather, FiClipboard,
  FiMapPin, FiTool, FiShield, FiEye, FiRefreshCw, FiCalendar,
  FiUsers, FiTrendingUp,
} from 'react-icons/fi';

const REPORT_TYPES = [
  { id:'daily_mine',         label:'Daily Mine Report',         icon:FiMapPin,       color:'text-blue-500     bg-blue-500/10     border-blue-500/25',     desc:'Mine status, compliance, risk and environment at a glance'          },
  { id:'weekly_safety',      label:'Weekly Safety Report',      icon:FiAlertTriangle,color:'text-red-500      bg-red-500/10      border-red-500/25',       desc:'Incidents, violations, observations and inspection findings'        },
  { id:'monthly_compliance', label:'Monthly Compliance Report', icon:FiBarChart2,    color:'text-amber-500   bg-amber-500/10   border-amber-500/25',      desc:'Compliance scores by category, workflow status and overdue items'   },
  { id:'inspection',         label:'Inspection Report',         icon:FiClipboard,    color:'text-purple-500  bg-purple-500/10  border-purple-500/25',     desc:'Inspection schedule, scores, findings and corrective actions'       },
  { id:'incident',           label:'Incident Report',           icon:FiShield,       color:'text-orange-500  bg-orange-500/10  border-orange-500/25',     desc:'Accident summary, casualty data, investigation status'              },
  { id:'environmental',      label:'Environmental Report',      icon:FiFeather,      color:'text-green-600   bg-green-500/10   border-green-500/25',      desc:'Air, water quality, noise, exceedances and sensor readings'         },
  { id:'contractor',         label:'Contractor Report',         icon:FiTool,         color:'text-cyan-500    bg-cyan-500/10    border-cyan-500/25',       desc:'Contractor performance, compliance and contract validity'           },
  { id:'risk',               label:'Risk Assessment Report',    icon:FiTrendingUp,   color:'text-rose-500    bg-rose-500/10    border-rose-500/25',       desc:'Mine risk scores, high violations, critical environmental alerts'   },
];

/* ── Preview renderers per report type ─────────────────────────── */
function PreviewMine({ data }) {
  const { mines = [], summary } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Total Mines', summary?.total, ''],['Operational', summary?.operational, 'text-green-600'],['Avg Compliance', `${summary?.avg_compliance}%`, ''],['Critical Risk', summary?.critical_mines, 'text-red-500']].map(([l,v,c])=>(
          <div key={l} className="rounded-xl border border-[var(--border)] text-center py-3" style={{background:'var(--bg-card-hover)'}}>
            <p className={clsx('text-xl font-black',c||'text-[var(--text-primary)]')}>{v??'—'}</p>
            <p className="text-[10px] mt-0.5" style={{color:'var(--text-muted)'}}>{l}</p>
          </div>
        ))}
      </div>
      {mines.length === 0 ? <p className="text-center py-8" style={{color:'var(--text-muted)'}}>No mines found.</p> : (
        <div className="table-container max-h-80 overflow-y-auto">
          <table className="table text-xs">
            <thead><tr><th>Mine</th><th>State</th><th>Status</th><th>Compliance</th><th>Risk</th><th>Violations</th><th>Incidents</th></tr></thead>
            <tbody>
              {mines.map(m=>(
                <tr key={m.id}>
                  <td className="font-semibold" style={{color:'var(--text-primary)'}}>{m.name}</td>
                  <td>{m.state}</td>
                  <td><Badge color={m.status==='operational'?'green':'gray'}>{m.status}</Badge></td>
                  <td><span className={parseFloat(m.compliance_score)>=80?'text-green-500':parseFloat(m.compliance_score)>=60?'text-amber-500':'text-red-500'}>{parseFloat(m.compliance_score||0).toFixed(1)}%</span></td>
                  <td><span className={parseFloat(m.risk_score)>=70?'text-red-500':parseFloat(m.risk_score)>=50?'text-amber-500':'text-green-500'}>{parseFloat(m.risk_score||0).toFixed(1)}%</span></td>
                  <td>{m.open_violations||0}</td>
                  <td>{m.open_incidents||0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PreviewSafety({ data }) {
  const { incidents=[], violations=[], summary } = data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Incidents',summary?.total_incidents,'text-red-500'],['Fatalities',summary?.fatalities,'text-red-600'],['Injuries',summary?.injuries,'text-amber-500'],['Open Violations',summary?.open_violations,'text-orange-500']].map(([l,v,c])=>(
          <div key={l} className="rounded-xl border border-[var(--border)] text-center py-3" style={{background:'var(--bg-card-hover)'}}>
            <p className={clsx('text-xl font-black',c)}>{v??0}</p>
            <p className="text-[10px] mt-0.5" style={{color:'var(--text-muted)'}}>{l}</p>
          </div>
        ))}
      </div>
      {incidents.length > 0 && (
        <div className="table-container max-h-64 overflow-y-auto">
          <table className="table text-xs">
            <thead><tr><th>Number</th><th>Mine</th><th>Severity</th><th>Date</th><th>Injuries</th><th>Fatalities</th></tr></thead>
            <tbody>
              {incidents.slice(0,20).map(i=>(
                <tr key={i.id}>
                  <td className="font-mono" style={{color:'var(--text-primary)'}}>{i.incident_number}</td>
                  <td>{i.mine_name}</td>
                  <td><Badge color={i.severity==='fatal'?'red':i.severity==='serious'?'yellow':'gray'}>{i.severity}</Badge></td>
                  <td>{i.incident_date}</td>
                  <td>{i.injuries_count||0}</td>
                  <td className={parseInt(i.fatalities_count)>0?'text-red-500 font-bold':''}>{i.fatalities_count||0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PreviewCompliance({ data }) {
  const { by_category=[], workflow={}, overdue_deadlines=[] } = data;
  return (
    <div className="space-y-4">
      <div className="table-container max-h-48 overflow-y-auto">
        <table className="table text-xs">
          <thead><tr><th>Category</th><th>Total</th><th>Avg Score</th><th>Compliant</th></tr></thead>
          <tbody>
            {by_category.map(c=>(
              <tr key={c.category}>
                <td className="font-semibold" style={{color:'var(--text-primary)'}}>{c.category}</td>
                <td>{c.total}</td>
                <td><span className={parseFloat(c.avg_score)>=80?'text-green-500':parseFloat(c.avg_score)>=60?'text-amber-500':'text-red-500'}>{parseFloat(c.avg_score||0).toFixed(1)}%</span></td>
                <td>{c.compliant}/{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(workflow).map(([k,v])=>(
          <div key={k} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border)]" style={{background:'var(--bg-card-hover)'}}>
            <span className="text-sm font-bold" style={{color:'var(--text-primary)'}}>{v}</span>
            <span className="text-xs capitalize" style={{color:'var(--text-muted)'}}>{k.replace(/_/g,' ')}</span>
          </div>
        ))}
      </div>
      {overdue_deadlines.length > 0 && (
        <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20">
          <p className="text-xs font-bold text-red-400 mb-2">⚠ {overdue_deadlines.length} Overdue Deadlines</p>
          {overdue_deadlines.slice(0,5).map(d=>(
            <p key={d.id} className="text-[11px] text-red-300">{d.mine_name} — {d.title||d.description?.slice(0,50)||'—'} (Due: {d.deadline_date})</p>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewGeneric({ data, type }) {
  const rows = data.inspections || data.incidents || data.readings || data.contractors || data.mines || [];
  if (rows.length === 0) return <p className="text-center py-8" style={{color:'var(--text-muted)'}}>No data for selected filters.</p>;
  return (
    <div className="space-y-3">
      {data.summary && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(data.summary).map(([k,v])=>(
            <div key={k} className="rounded-xl border border-[var(--border)] px-4 py-2 text-center" style={{background:'var(--bg-card-hover)'}}>
              <p className="text-lg font-black" style={{color:'var(--text-primary)'}}>{typeof v==='number'?v.toLocaleString('en-IN'):v}</p>
              <p className="text-[10px]" style={{color:'var(--text-muted)'}}>{k.replace(/_/g,' ')}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs" style={{color:'var(--text-muted)'}}>{rows.length} record{rows.length!==1?'s':''} found. Export for full details.</p>
    </div>
  );
}

function PreviewContent({ type, data }) {
  if (!data) return null;
  if (type === 'daily_mine' || type === 'mine') return <PreviewMine data={data}/>;
  if (type === 'weekly_safety' || type === 'violations') return <PreviewSafety data={data}/>;
  if (type === 'monthly_compliance' || type === 'compliance') return <PreviewCompliance data={data}/>;
  return <PreviewGeneric data={data} type={type}/>;
}

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
export default function Reports() {
  const [mines,    setMines]    = useState([]);
  const [selMine,  setSelMine]  = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [loading,  setLoading]  = useState({});
  const [preview,  setPreview]  = useState(null);   // { type, data, meta }
  const [prevType, setPrevType] = useState(null);
  const [prevLoading, setPrevLoading] = useState(false);

  useEffect(() => {
    minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{});
  }, []);

  const openPreview = useCallback(async (type) => {
    setPrevType(type);
    setPrevLoading(true);
    setPreview(null);
    try {
      const r = await reportsApi.preview({ type, mine_id:selMine||undefined, from_date:fromDate||undefined, to_date:toDate||undefined });
      setPreview(r);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Preview failed');
      setPrevType(null);
    } finally { setPrevLoading(false); }
  }, [selMine, fromDate, toDate]);

  const dlPDF = async (type) => {
    const key = `pdf_${type}`;
    setLoading(p => ({...p,[key]:true}));
    try {
      const r = await reportsApi.downloadPDF({ type, mine_id:selMine||undefined, from_date:fromDate||undefined, to_date:toDate||undefined });
      downloadBlob(r, `KhanNetra-${type}-Report.pdf`);
      toast.success('PDF downloaded');
    } catch { toast.error('PDF export failed'); }
    finally { setLoading(p => ({...p,[key]:false})); }
  };

  const dlExcel = async (type) => {
    const key = `xls_${type}`;
    setLoading(p => ({...p,[key]:true}));
    try {
      const r = await reportsApi.downloadExcel({ type, mine_id:selMine||undefined, from_date:fromDate||undefined, to_date:toDate||undefined });
      downloadBlob(r, `KhanNetra-${type}-Export.xlsx`);
      toast.success('Excel exported');
    } catch { toast.error('Excel export failed'); }
    finally { setLoading(p => ({...p,[key]:false})); }
  };

  const rt = REPORT_TYPES.find(r => r.id === prevType);

  return (
    <div className="space-y-5 pb-10"><BackButton className="mb-1"/>
      <div>
        <h1 className="page-title flex items-center gap-2"><FiBarChart2 className="text-amber-500"/> Automatic Reports</h1>
        <p className="page-subtitle">Generate PDF and Excel reports from real KhanNetra data — select filters, preview, then export</p>
      </div>

      {/* Filters */}
      <div className="card-sm">
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{color:'var(--text-muted)'}}>Report Filters (Optional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="form-group mb-0">
            <label className="label">Mine</label>
            <select value={selMine} onChange={e=>setSelMine(e.target.value)} className="select">
              <option value="">All Mines</option>
              {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">From Date</label>
            <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="input"/>
          </div>
          <div className="form-group mb-0">
            <label className="label">To Date</label>
            <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="input"/>
          </div>
        </div>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {REPORT_TYPES.map(rt => {
          const Icon = rt.icon;
          return (
            <div key={rt.id} className="card hover:shadow-md transition-all flex flex-col">
              <div className={clsx('w-10 h-10 rounded-xl border flex items-center justify-center mb-3 shrink-0', rt.color)}>
                <Icon size={18}/>
              </div>
              <h3 className="font-bold text-sm mb-1" style={{color:'var(--text-primary)'}}>{rt.label}</h3>
              <p className="text-[11px] mb-4 flex-1" style={{color:'var(--text-muted)'}}>{rt.desc}</p>
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => openPreview(rt.id)}
                  className="flex-1 btn-outline btn-sm justify-center text-[11px]">
                  <FiEye size={11}/> Preview
                </button>
                <button onClick={() => dlPDF(rt.id)} disabled={loading[`pdf_${rt.id}`]}
                  className="flex-1 btn-primary btn-sm justify-center text-[11px]">
                  {loading[`pdf_${rt.id}`] ? <LoadingSpinner size="sm"/> : <FiDownload size={11}/>} PDF
                </button>
                <button onClick={() => dlExcel(rt.id)} disabled={loading[`xls_${rt.id}`]}
                  className="btn-outline btn-sm justify-center text-[11px]">
                  {loading[`xls_${rt.id}`] ? <LoadingSpinner size="sm"/> : <FiDownload size={11}/>} XLS
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full export */}
      <div className="rounded-2xl border border-amber-500/25 p-5 bg-amber-500/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-amber-500 text-base">Full Data Export</h3>
            <p className="text-sm" style={{color:'var(--text-muted)'}}>All data — mines, violations, incidents, compliance, inspections, environment — in one Excel workbook</p>
          </div>
          <button onClick={() => dlExcel('all')} disabled={loading['xls_all']} className="btn-primary">
            {loading['xls_all'] ? <><LoadingSpinner size="sm"/> Exporting…</> : <><FiDownload size={16}/> Download All Data</>}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      <Modal isOpen={!!prevType} onClose={() => { setPrevType(null); setPreview(null); }}
        title={rt ? `Preview: ${rt.label}` : 'Report Preview'} size="lg">
        <div className="space-y-4">
          {/* Meta */}
          {preview?.meta && (
            <div className="flex flex-wrap gap-3 text-xs" style={{color:'var(--text-muted)'}}>
              <span><FiCalendar size={11} className="inline mr-1"/>{preview.meta.generated_at ? new Date(preview.meta.generated_at).toLocaleString('en-IN') : '—'}</span>
              {preview.meta.mine_name && <span>Mine: <strong style={{color:'var(--text-primary)'}}>{preview.meta.mine_name}</strong></span>}
              {preview.meta.from_date && <span>From: {preview.meta.from_date}</span>}
              {preview.meta.to_date   && <span>To: {preview.meta.to_date}</span>}
              <span>By: <strong style={{color:'var(--text-primary)'}}>{preview.meta.generated_by}</strong></span>
            </div>
          )}

          {prevLoading ? <div className="flex justify-center py-12"><LoadingSpinner size="lg"/></div>
          : preview?.data ? <PreviewContent type={prevType} data={preview.data}/>
          : null}

          {/* Export from modal */}
          {!prevLoading && preview && (
            <div className="flex gap-3 pt-3 border-t border-[var(--border)]">
              <button onClick={() => dlPDF(prevType)} disabled={loading[`pdf_${prevType}`]} className="btn-primary flex-1 justify-center">
                {loading[`pdf_${prevType}`] ? <LoadingSpinner size="sm"/> : <FiDownload size={14}/>} Export PDF
              </button>
              <button onClick={() => dlExcel(prevType)} disabled={loading[`xls_${prevType}`]} className="btn-outline flex-1 justify-center">
                {loading[`xls_${prevType}`] ? <LoadingSpinner size="sm"/> : <FiDownload size={14}/>} Export Excel
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
