/**
 * KhanNetra — Mobile Field Application  v2
 * Mobile-first dashboard for mine employees: my mine, tasks, alerts,
 * quick-action forms with GPS capture, offline queue status.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiUserCheck, FiNavigation, FiAlertTriangle, FiCamera,
  FiMapPin, FiClock, FiHome, FiShield, FiFileText, FiUsers,
  FiWifi, FiWifiOff, FiUpload, FiCheckCircle, FiAlertOctagon,
  FiRefreshCw, FiX, FiSend, FiTool,
} from 'react-icons/fi';
import useAuthStore from '../../store/authStore';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import {
  minesApi, disasterApi, inspectionsApi, attendanceApi,
  safetyApi, incidentsApi,
} from '../../services/api';import { formatDate, timeAgo } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import clsx from 'clsx';

/* ── GPS hook ───────────────────────────────────────────────────── */
function useGPS() {
  const [gps, setGps] = useState(null);
  const [err, setErr] = useState(null);

  const capture = useCallback(() => {
    if (!navigator.geolocation) { setErr('GPS not supported'); return; }
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) }),
      e   => setErr(e.code === 1 ? 'Location permission denied' : 'Could not get location'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, []);

  return { gps, gpsErr: err, capture, clear: () => setGps(null) };
}

/* ── Quick attendance form ─────────────────────────────────────── */
function AttendanceForm({ user, mine, onClose, enqueue, isOnline }) {
  const [status, setStatus] = useState('present');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const { gps, gpsErr, capture } = useGPS();

  const submit = async () => {
    if (!mine?.id) { toast.error('No mine assigned'); return; }
    setSaving(true);
    const payload = {
      mine_id: mine.id, worker_name: user.full_name, worker_id: user.id,
      attendance_date: new Date().toISOString().slice(0,10),
      shift: 'day', status,
      check_in_time: new Date().toTimeString().slice(0,5),
      latitude: gps?.lat, longitude: gps?.lng, gps_accuracy: gps?.acc,
      remarks: note || null,
      device_info: navigator.userAgent.slice(0,100),
    };
    try {
      if (isOnline) {
        await attendanceApi.create(payload);
        toast.success('Attendance marked');
      } else {
        await enqueue('attendance', payload);
        toast('📴 Saved offline — will sync when online', { icon:'💾' });
      }
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs" style={{color:'var(--text-secondary)'}}>
        <strong className="text-amber-500">Attendance for {new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</strong>
        <div className="mt-1">Mine: {mine?.name || 'Unknown'}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['present','absent','half_day'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={clsx('py-2.5 rounded-xl border text-xs font-bold transition-all capitalize',
              status===s
                ? s==='present' ? 'bg-green-500/15 border-green-500 text-green-500'
                  : s==='absent' ? 'bg-red-500/15 border-red-500 text-red-500'
                  : 'bg-amber-500/15 border-amber-500 text-amber-500'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-amber-500/40')}>
            {s.replace('_',' ')}
          </button>
        ))}
      </div>
      <div>
        <label className="label">GPS Location (optional)</label>
        <div className="flex gap-2">
          <button onClick={capture} className="btn-outline btn-sm flex-1">
            <FiMapPin size={12}/> {gps ? `±${gps.acc}m` : 'Capture GPS'}
          </button>
          {gps && <button onClick={() => {}} className="btn-sm text-green-500 text-xs">✓</button>}
        </div>
        {gpsErr && <p className="text-[10px] text-amber-500 mt-1">{gpsErr}</p>}
      </div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} className="input resize-none text-sm" placeholder="Remarks (optional)"/>
      <button onClick={submit} disabled={saving} className="btn-primary w-full justify-center py-3">
        {saving ? <LoadingSpinner size="sm"/> : <FiCheckCircle size={16}/>}
        {isOnline ? 'Mark Attendance' : '📴 Save Offline'}
      </button>
    </div>
  );
}

/* ── Quick hazard report form ──────────────────────────────────── */
function HazardForm({ user, mine, onClose, enqueue, isOnline }) {
  const [form, setForm]   = useState({ type:'safety', severity:'medium', title:'', description:'' });
  const [saving, setSaving] = useState(false);
  const { gps, capture }   = useGPS();
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const submit = async () => {
    if (!form.title.trim()) { toast.error('Title required'); return; }
    if (!mine?.id) { toast.error('No mine assigned'); return; }
    setSaving(true);
    const payload = {
      mine_id: mine.id, type: form.type, severity: form.severity,
      title: form.title, description: form.description,
      latitude: gps?.lat, longitude: gps?.lng,
      observed_at: new Date().toISOString(),
    };
    try {
      if (isOnline) {
        await safetyApi.createObservation(new FormData(Object.entries(payload).reduce((fd,[k,v])=>{ if(v!=null)fd.append(k,v); return fd; }, new FormData())));
        toast.success('Hazard reported');
      } else {
        await enqueue('observation', payload);
        toast('📴 Saved offline — will sync when online', { icon:'💾' });
      }
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="form-group mb-0">
          <label className="label">Type</label>
          <select value={form.type} onChange={e=>set('type',e.target.value)} className="select">
            {['safety','environment','machinery','fire','electrical','general'].map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Severity</label>
          <select value={form.severity} onChange={e=>set('severity',e.target.value)} className="select">
            {['low','medium','high','critical'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group mb-0">
        <label className="label">Title *</label>
        <input value={form.title} onChange={e=>set('title',e.target.value)} className="input" placeholder="e.g. Exposed wiring near shaft"/>
      </div>
      <div className="form-group mb-0">
        <label className="label">Description</label>
        <textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={3} className="input resize-none" placeholder="Describe the hazard…"/>
      </div>
      <button onClick={capture} className="btn-outline btn-sm w-full">
        <FiMapPin size={12}/> {gps ? `GPS: ±${gps.acc}m` : 'Capture GPS Location'}
      </button>
      <button onClick={submit} disabled={saving} className="btn-primary w-full justify-center py-3">
        {saving ? <LoadingSpinner size="sm"/> : <FiSend size={15}/>}
        {isOnline ? 'Submit Hazard Report' : '📴 Save Offline'}
      </button>
    </div>
  );
}

/* ── Offline queue panel ───────────────────────────────────────── */
function OfflinePanel({ pending, syncing, isOnline, syncAll, discard, retry }) {
  if (pending.length === 0) return null;
  const pendCount  = pending.filter(p=>p.status==='pending').length;
  const failCount  = pending.filter(p=>p.status==='failed').length;
  const syncCount  = pending.filter(p=>p.status==='syncing').length;

  return (
    <div className={clsx('rounded-2xl border p-4 space-y-3',
      failCount>0 ? 'border-red-500/30 bg-red-500/5' :
      pendCount>0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-green-500/30 bg-green-500/5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isOnline ? <FiWifi size={15} className="text-green-500"/> : <FiWifiOff size={15} className="text-amber-500"/>}
          <p className="font-bold text-sm" style={{color:'var(--text-primary)'}}>
            Offline Queue — {pending.length} record{pending.length!==1?'s':''}
          </p>
        </div>
        {isOnline && pendCount > 0 && (
          <button onClick={syncAll} disabled={syncing} className="btn-primary btn-sm">
            {syncing ? <LoadingSpinner size="sm"/> : <FiRefreshCw size={12}/>}
            {syncing ? 'Syncing…' : `Sync ${pendCount}`}
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {pending.map(item => (
          <div key={item.client_id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[var(--border)]" style={{background:'var(--bg-card-hover)'}}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold capitalize" style={{color:'var(--text-primary)'}}>{item.type.replace('_',' ')}</p>
              <p className="text-[10px]" style={{color:'var(--text-muted)'}}>{new Date(item.created_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})}</p>
              {item.error && <p className="text-[10px] text-red-400 truncate">{item.error}</p>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge color={item.status==='failed'?'red':item.status==='syncing'?'blue':item.status==='pending'?'yellow':'green'}>
                {item.status}
              </Badge>
              {item.status==='failed' && (
                <button onClick={()=>retry(item.client_id)} className="p-1 rounded text-blue-500 hover:bg-blue-500/10"><FiRefreshCw size={11}/></button>
              )}
              {item.status!=='syncing' && (
                <button onClick={()=>discard(item.client_id)} className="p-1 rounded text-red-500 hover:bg-red-500/10"><FiX size={11}/></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */
export default function FieldDashboard() {
  const { user }     = useAuthStore();
  const navigate     = useNavigate();
  const {
    pending, pendingCount, failedCount, syncing,
    isOnline, enqueue, syncAll, discard, retry,
  } = useOfflineQueue();

  const [mine,         setMine]         = useState(null);
  const [activeAlerts, setAlerts]       = useState([]);
  const [upcomingIns,  setUpcomingIns]  = useState([]);
  const [currentTime,  setCurrentTime]  = useState(new Date());
  const [quickForm,    setQuickForm]    = useState(null); // 'attendance' | 'hazard' | null
  const [loadingData,  setLoadingData]  = useState(true);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const promises = [
        disasterApi.getActive().catch(() => ({ data: [] })),
      ];
      if (user?.mine_id) {
        promises.push(
          minesApi.getById(user.mine_id).catch(() => null),
          inspectionsApi.getAll({ mine_id: user.mine_id, status:'scheduled', limit:5 }).catch(() => ({ data:[] })),
        );
      }
      const results = await Promise.all(promises);
      setAlerts((results[0]?.data || []).filter(a=>['CRITICAL','HIGH'].includes(a.severity)).slice(0,3));
      if (user?.mine_id) {
        setMine(results[1]?.data || null);
        setUpcomingIns(results[2]?.data || []);
      }
    } catch {}
    finally { setLoadingData(false); }
  }, [user?.mine_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const QUICK_ACTIONS = [
    { id:'attendance',   icon:FiUserCheck,    label:'Mark Attendance',    desc:'Record today\'s attendance',   color:'text-teal-500   bg-teal-500/10   border-teal-500/25',   action:()=>setQuickForm('attendance') },
    { id:'hazard',       icon:FiShield,       label:'Report Hazard',       desc:'Submit safety observation',   color:'text-amber-500  bg-amber-500/10  border-amber-500/25',  action:()=>setQuickForm('hazard') },
    { id:'incident',     icon:FiAlertTriangle,label:'Report Incident',     desc:'Log accident or near-miss',   color:'text-red-500    bg-red-500/10    border-red-500/25',    action:()=>navigate('/incidents') },
    { id:'inspection',   icon:FiClipboard,    label:'Start Inspection',    desc:'Begin a new inspection',      color:'text-purple-500 bg-purple-500/10 border-purple-500/25', action:()=>navigate('/inspections') },
    { id:'documents',    icon:FiFileText,     label:'Upload Document',     desc:'Upload file or certificate',  color:'text-blue-500   bg-blue-500/10   border-blue-500/25',   action:()=>navigate('/documents') },
    { id:'alerts',       icon:FiAlertOctagon, label:'View Alerts',         desc:'Active disaster alerts',      color:'text-rose-500   bg-rose-500/10   border-rose-500/25',   action:()=>navigate('/disaster') },
    { id:'vision',       icon:FiCamera,       label:'PPE Scan',            desc:'AI safety vision check',      color:'text-cyan-500   bg-cyan-500/10   border-cyan-500/25',   action:()=>navigate('/vision') },
    { id:'workers',      icon:FiUsers,        label:'Workers Registry',    desc:'Manage worker profiles',      color:'text-green-500  bg-green-500/10  border-green-500/25',  action:()=>navigate('/workers') },
  ];

  // Only show forms the user's role allows
  const visibleActions = QUICK_ACTIONS.filter(a => {
    if (a.id === 'attendance') return ['mine_manager','inspector','safety_officer','contractor','mining_engineer'].includes(user?.role);
    if (a.id === 'inspection') return ['inspector','mine_manager','safety_officer'].includes(user?.role);
    if (a.id === 'workers')    return ['mine_manager','safety_officer','inspector'].includes(user?.role);
    return true;
  });

  const FiClipboard = require('react-icons/fi').FiClipboard;

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl font-black" style={{color:'var(--text-primary)'}}>
            👋 {user?.full_name?.split(' ')[0] || 'Hello'}
          </h1>
          <p className="text-xs" style={{color:'var(--text-muted)'}}>{user?.role?.replace(/_/g,' ')}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold font-mono" style={{color:'var(--text-primary)'}}>{currentTime.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</p>
          <p className="text-[11px]" style={{color:'var(--text-muted)'}}>{currentTime.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}</p>
        </div>
      </div>

      {/* Online/Offline banner */}
      <div className={clsx('flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl border',
        isOnline ? 'border-green-500/25 bg-green-500/5' : 'border-amber-500/25 bg-amber-500/8')}>
        <div className="flex items-center gap-2">
          {isOnline ? <FiWifi size={14} className="text-green-500"/> : <FiWifiOff size={14} className="text-amber-500"/>}
          <span className="text-sm font-semibold" style={{color:'var(--text-primary)'}}>
            {isOnline ? 'Online' : 'Offline — data saved locally'}
          </span>
        </div>
        {pendingCount > 0 && (
          <button onClick={syncAll} disabled={syncing || !isOnline} className="flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:text-amber-400">
            {syncing ? <LoadingSpinner size="sm"/> : <FiRefreshCw size={11}/>}
            {syncing ? 'Syncing…' : `${pendingCount} pending`}
          </button>
        )}
        {failedCount > 0 && <span className="text-xs text-red-400 font-bold">{failedCount} failed</span>}
      </div>

      {/* My Mine card */}
      {user?.mine_id && (
        <div className="card border-2 border-amber-500/25">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-xl">⛏</div>
              <div>
                <p className="font-bold" style={{color:'var(--text-primary)'}}>{mine?.name || 'Loading…'}</p>
                <p className="text-xs" style={{color:'var(--text-muted)'}}>{mine?.state}{mine?.district?', '+mine.district:''} · {mine?.type}</p>
              </div>
            </div>
            <Link to={`/mines/${user.mine_id}`} className="btn-outline btn-sm shrink-0">View</Link>
          </div>
          {mine && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                ['Compliance', parseFloat(mine.compliance_score||0).toFixed(0)+'%', parseFloat(mine.compliance_score||0)>=80?'text-green-500':parseFloat(mine.compliance_score||0)>=60?'text-amber-500':'text-red-500'],
                ['Safety',     parseFloat(mine.safety_score||0).toFixed(0)+'%',     parseFloat(mine.safety_score||0)>=80?'text-green-500':parseFloat(mine.safety_score||0)>=60?'text-amber-500':'text-red-500'],
                ['Risk',       parseFloat(mine.risk_score||0).toFixed(0)+'%',       parseFloat(mine.risk_score||0)>=70?'text-red-500':parseFloat(mine.risk_score||0)>=50?'text-amber-500':'text-green-500'],
              ].map(([l,v,c])=>(
                <div key={l} className="rounded-xl border border-[var(--border)] text-center py-2" style={{background:'var(--bg-card-hover)'}}>
                  <p className={clsx('text-base font-black',c)}>{v}</p>
                  <p className="text-[9px]" style={{color:'var(--text-muted)'}}>{l}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active alerts */}
      {activeAlerts.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FiAlertOctagon size={15} className="text-red-400"/>
            <p className="font-bold text-sm text-red-400">{activeAlerts.length} Active Alert{activeAlerts.length!==1?'s':''}</p>
          </div>
          {activeAlerts.map(a=>(
            <div key={a.id} className="flex items-center justify-between gap-2 py-1.5 border-t border-red-500/15">
              <div>
                <p className="text-xs font-semibold" style={{color:'var(--text-primary)'}}>{a.title}</p>
                <p className="text-[10px]" style={{color:'var(--text-muted)'}}>{a.location_name||a.alert_type} · {timeAgo(a.alert_time)}</p>
              </div>
              <Badge color={a.severity==='CRITICAL'?'red':'yellow'}>{a.severity}</Badge>
            </div>
          ))}
          <Link to="/disaster" className="btn-outline btn-sm w-full justify-center mt-2 text-xs">View All Alerts</Link>
        </div>
      )}

      {/* Upcoming inspections */}
      {upcomingIns.length > 0 && (
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{color:'var(--text-muted)'}}>Upcoming Inspections</p>
          {upcomingIns.map(ins=>(
            <div key={ins.id} className="flex items-center justify-between gap-2 py-2 border-t border-[var(--border)] first:border-0">
              <div>
                <p className="text-sm font-semibold" style={{color:'var(--text-primary)'}}>{ins.type} Inspection</p>
                <p className="text-[11px]" style={{color:'var(--text-muted)'}}>{formatDate(ins.scheduled_date)} · {ins.inspection_number}</p>
              </div>
              <Badge color="blue">Scheduled</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions grid */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{color:'var(--text-muted)'}}>Quick Actions</p>
        <div className="grid grid-cols-2 gap-3">
          {visibleActions.map(({ id, icon:Icon, label, desc, color, action }) => (
            <button key={id} onClick={action}
              className={clsx('flex items-center gap-3 p-4 rounded-2xl border transition-all hover:shadow-md active:scale-95 text-left', color)}>
              <div className="shrink-0 p-2.5 rounded-xl bg-white/20">
                <Icon size={20}/>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{label}</p>
                <p className="text-[10px] opacity-80 truncate">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Offline queue */}
      <OfflinePanel pending={pending} syncing={syncing} isOnline={isOnline} syncAll={syncAll} discard={discard} retry={retry}/>

      {/* Main dashboard link */}
      <Link to="/dashboard" className="flex items-center gap-2 p-3 rounded-xl border border-[var(--border)] hover:border-amber-500/40 transition-all">
        <FiHome size={16} style={{color:'var(--text-muted)'}}/>
        <span className="text-sm font-semibold" style={{color:'var(--text-secondary)'}}>Back to Main Dashboard</span>
      </Link>

      {/* Quick form overlays */}
      {quickForm === 'attendance' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{background:'rgba(0,0,0,.7)'}}>
          <div className="w-full max-w-sm rounded-3xl p-5 space-y-3" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base" style={{color:'var(--text-primary)'}}>Mark Attendance</h2>
              <button onClick={() => setQuickForm(null)} className="p-1.5 rounded-lg hover:bg-[var(--bg-card-hover)]"><FiX size={16}/></button>
            </div>
            <AttendanceForm user={user} mine={mine} onClose={() => setQuickForm(null)} enqueue={enqueue} isOnline={isOnline}/>
          </div>
        </div>
      )}
      {quickForm === 'hazard' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{background:'rgba(0,0,0,.7)'}}>
          <div className="w-full max-w-sm rounded-3xl p-5 space-y-3 max-h-screen overflow-y-auto" style={{background:'var(--bg-card)',border:'1px solid var(--border)'}}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base" style={{color:'var(--text-primary)'}}>Report Hazard</h2>
              <button onClick={() => setQuickForm(null)} className="p-1.5 rounded-lg hover:bg-[var(--bg-card-hover)]"><FiX size={16}/></button>
            </div>
            <HazardForm user={user} mine={mine} onClose={() => setQuickForm(null)} enqueue={enqueue} isOnline={isOnline}/>
          </div>
        </div>
      )}
    </div>
  );
}
