/**
 * KhanNetra — Worker Attendance  v2
 * Tab 1: Daily Attendance — bulk mark with GPS capture on mobile
 * Tab 2: Records — searchable/filterable history with summary stats
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiUsers, FiRefreshCw, FiSave, FiAlertOctagon, FiSearch,
  FiUserCheck, FiCalendar, FiMapPin, FiEye, FiChevronDown,
  FiList, FiWifi, FiWifiOff, FiClock,
} from 'react-icons/fi';
import { attendanceApi, workersApi, minesApi } from '../../services/api';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import BackButton from '../../components/ui/BackButton';

/* ── Constants ───────────────────────────────────────────────────────── */
const STATUS_COLOR = {
  present:'green', absent:'red', late:'yellow', half_day:'blue', on_leave:'gray',
};
const SHIFTS = [
  { value:'day',     label:'Day Shift'   },
  { value:'night',   label:'Night Shift' },
  { value:'general', label:'General'     },
  { value:'A',       label:'A Shift'     },
  { value:'B',       label:'B Shift'     },
  { value:'C',       label:'C Shift'     },
];
const STATUSES = [
  { value:'present',  label:'Present',  cls:'bg-green-500/15  text-green-600  border-green-500/40  hover:bg-green-500/25'  },
  { value:'absent',   label:'Absent',   cls:'bg-red-500/15    text-red-600    border-red-500/40    hover:bg-red-500/25'    },
  { value:'late',     label:'Late',     cls:'bg-amber-500/15  text-amber-600  border-amber-500/40  hover:bg-amber-500/25'  },
  { value:'half_day', label:'Half Day', cls:'bg-blue-500/15   text-blue-600   border-blue-500/40   hover:bg-blue-500/25'   },
  { value:'on_leave', label:'Leave',    cls:'bg-gray-500/15   text-gray-500   border-gray-400/40   hover:bg-gray-500/25'   },
];
const today = () => new Date().toISOString().split('T')[0];
const now   = () => new Date().toTimeString().slice(0, 5); // HH:MM

/* ── GPS hook ─────────────────────────────────────────────────────────── */
function useGPS() {
  const [gps, setGps]       = useState(null);   // { lat, lng, accuracy }
  const [gpsErr, setGpsErr] = useState(null);
  const [fetching, setFetching] = useState(false);

  const capture = useCallback(() => {
    if (!navigator.geolocation) { setGpsErr('GPS not available on this device'); return; }
    setFetching(true);
    setGpsErr(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setFetching(false);
        toast.success(`GPS captured (±${Math.round(pos.coords.accuracy)}m)`);
      },
      err => {
        setGpsErr(err.code === 1 ? 'Location permission denied' : 'Could not get location');
        setFetching(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, []);

  return { gps, gpsErr, fetching, capture, clear: () => setGps(null) };
}

/* ── Summary bar ─────────────────────────────────────────────────────── */
function SummaryBar({ summary }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-5 gap-2">
      {[
        { label:'Total',      v: summary.total,                                                    color:'text-[var(--text-primary)]' },
        { label:'Present',    v: summary.present,                                                  color:'text-green-600' },
        { label:'Absent',     v: summary.absent,                                                   color:'text-red-600'   },
        { label:'Late',       v: summary.late || 0,                                                color:'text-amber-600' },
        { label:'Not Marked', v: summary.not_marked !== undefined ? summary.not_marked : 0,        color:'text-[var(--text-muted)]' },
      ].map(({ label, v, color }) => (
        <div key={label} className="card-sm text-center border border-[var(--border)] py-2">
          <p className={clsx('text-xl font-black', color)}>{v || 0}</p>
          <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

/* ── Worker Profile mini-modal ───────────────────────────────────────── */
function WorkerMiniProfile({ workerId, onClose }) {
  const [data, setData]   = useState(null);
  const [loading, setLoad] = useState(true);

  useEffect(() => {
    workersApi.getHistory(workerId, { page:1, limit:20 })
      .then(r => setData(r.data))
      .catch(() => toast.error('Could not load profile'))
      .finally(() => setLoad(false));
  }, [workerId]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"/></div>;
  if (!data)   return <p className="py-8 text-center" style={{ color:'var(--text-muted)' }}>Not found.</p>;

  const { worker, history, stats } = data;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-[var(--border)]">
        <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-xl font-black text-amber-600">
          {worker.full_name.charAt(0)}
        </div>
        <div>
          <p className="font-black" style={{ color:'var(--text-primary)' }}>{worker.full_name}</p>
          <p className="text-xs font-mono text-amber-600">{worker.worker_code}</p>
          <p className="text-xs" style={{ color:'var(--text-muted)' }}>{worker.department} · {worker.designation}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label:'Total',   v: stats.total_records,              color:'text-[var(--text-primary)]' },
          { label:'Present', v: stats.present,                    color:'text-green-600' },
          { label:'Absent',  v: stats.absent,                     color:'text-red-600'   },
          { label:'Att. %',  v: `${stats.attendance_percent}%`,
            color: stats.attendance_percent >= 75 ? 'text-green-600' : 'text-amber-600' },
        ].map(({ label, v, color }) => (
          <div key={label} className="card-sm text-center border border-[var(--border)]">
            <p className={clsx('text-xl font-black', color)}>{v}</p>
            <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
          </div>
        ))}
      </div>
      <div className="table-container max-h-52 overflow-y-auto">
        <table className="table text-xs">
          <thead><tr><th>Date</th><th>Shift</th><th>Status</th><th>GPS</th></tr></thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td className="font-mono">{h.attendance_date}</td>
                <td className="capitalize">{h.shift}</td>
                <td><Badge color={STATUS_COLOR[h.status]||'gray'}>{h.status?.replace('_',' ')}</Badge></td>
                <td>{h.latitude ? <FiMapPin size={11} className="text-green-500"/> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 1 — Daily Attendance
   ════════════════════════════════════════════════════════════════════════ */
function DailyAttendanceTab({ mines, canWrite }) {
  const { user }    = useAuthStore();
  const { gps, gpsErr, fetching: gpsFetching, capture: captureGPS, clear: clearGPS } = useGPS();

  const [mineId,   setMineId]   = useState(user?.mine_id || '');
  const [date,     setDate]     = useState(today());
  const [shift,    setShift]    = useState('day');
  const [session,  setSession]  = useState(null);
  const [marks,    setMarks]    = useState({});  // { workerId: status }
  const [checkins, setCheckins] = useState({});  // { workerId: HH:MM }
  const [remarks,  setRemarks]  = useState({});  // { workerId: text }
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [deptF,    setDeptF]    = useState('');
  const [profileW, setProfileW] = useState(null);
  const [useGPSForAll, setUseGPSForAll] = useState(false);

  const loadSession = useCallback(async () => {
    if (!mineId || !date || !shift) return;
    setLoading(true);
    try {
      const r = await attendanceApi.getSession({ mine_id:mineId, attendance_date:date, shift });
      setSession(r.data);
      const initMarks = {}, initCI = {};
      for (const w of (r.data?.workers || [])) {
        if (w.att_status) initMarks[w.id] = w.att_status;
        if (w.check_in_time) initCI[w.id] = w.check_in_time;
      }
      setMarks(initMarks);
      setCheckins(initCI);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not load workers');
    } finally { setLoading(false); }
  }, [mineId, date, shift]);

  useEffect(() => { loadSession(); }, [loadSession]);

  const setMark = (wId, status) => {
    setMarks(prev => ({ ...prev, [wId]: status }));
    // Auto-set check-in time if marking present/late and no time set
    if ((status === 'present' || status === 'late') && !checkins[wId]) {
      setCheckins(prev => ({ ...prev, [wId]: now() }));
    }
  };

  const markAllPresent = async () => {
    try {
      await attendanceApi.markAll({ mine_id:mineId, attendance_date:date, shift, status:'present' });
      toast.success('All workers marked present');
      loadSession();
    } catch { toast.error('Mark all failed'); }
  };

  const saveAttendance = async () => {
    if (!session || !canWrite) return;
    const records = (session.workers || [])
      .filter(w => marks[w.id])
      .map(w => ({
        worker_id:      w.id,
        status:         marks[w.id],
        check_in_time:  checkins[w.id] || null,
        remarks:        remarks[w.id]  || null,
        ...(useGPSForAll && gps ? {
          latitude:    gps.lat,
          longitude:   gps.lng,
          gps_accuracy:gps.accuracy,
        } : {}),
      }));

    if (records.length === 0) { toast.error('No workers marked'); return; }
    setSaving(true);
    try {
      const r = await attendanceApi.bulkSave({ mine_id:mineId, attendance_date:date, shift, records });
      toast.success(r.message || 'Attendance saved');
      loadSession();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const departments = session
    ? [...new Set((session.workers||[]).map(w=>w.department).filter(Boolean))].sort()
    : [];

  const visible = (session?.workers||[]).filter(w => {
    if (deptF && w.department !== deptF) return false;
    if (search && !`${w.full_name} ${w.worker_code} ${w.designation}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const liveSummary = {
    total:      session?.workers?.length || 0,
    present:    Object.values(marks).filter(s => s==='present').length,
    absent:     Object.values(marks).filter(s => s==='absent').length,
    late:       Object.values(marks).filter(s => s==='late').length,
    not_marked: (session?.workers?.length||0) - Object.keys(marks).filter(k => session?.workers?.find(w=>w.id===k)).length,
  };

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <div className="form-group mb-0">
          <label className="label">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-40"/>
        </div>
        <div className="form-group mb-0">
          <label className="label">Mine</label>
          <select value={mineId} onChange={e => setMineId(e.target.value)} className="select w-52">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Shift</label>
          <select value={shift} onChange={e => setShift(e.target.value)} className="select w-36">
            {SHIFTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button onClick={loadSession} className="btn-outline btn-sm self-end">
          <FiRefreshCw size={13}/> Load Workers
        </button>
      </div>

      {/* GPS panel */}
      {canWrite && (
        <div className="card-sm flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FiMapPin size={15} className={gps ? 'text-green-500' : 'text-[var(--text-muted)]'}/>
            <div>
              <p className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>GPS Location</p>
              {gps
                ? <p className="text-[11px] text-green-500">{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{gps.accuracy}m)</p>
                : <p className="text-[11px]" style={{ color:'var(--text-muted)' }}>{gpsErr || 'Not captured'}</p>}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={captureGPS} disabled={gpsFetching} className="btn-outline btn-sm">
              {gpsFetching ? <><FiRefreshCw size={12} className="animate-spin"/> Getting…</> : <><FiMapPin size={12}/> Capture GPS</>}
            </button>
            {gps && <button onClick={clearGPS} className="btn-sm text-[var(--text-muted)] hover:text-red-500 border border-[var(--border)] rounded-lg px-2 py-1 text-xs">Clear</button>}
            {gps && (
              <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color:'var(--text-secondary)' }}>
                <input type="checkbox" checked={useGPSForAll} onChange={e => setUseGPSForAll(e.target.checked)} className="w-3.5 h-3.5"/>
                Attach GPS to all records
              </label>
            )}
          </div>
          {gpsErr && <p className="text-[11px] text-amber-500 w-full">{gpsErr}. GPS is optional — attendance can still be saved.</p>}
        </div>
      )}

      {session?.already_saved && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/8 border border-blue-500/25 text-xs" style={{ color:'var(--text-secondary)' }}>
          <FiClock size={13}/> Attendance for this session was previously saved. You can review and update it.
        </div>
      )}

      {session && <SummaryBar summary={liveSummary}/>}

      {/* Toolbar */}
      {session && (session.workers||[]).length > 0 && (
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <FiSearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search worker…" className="input pl-7 w-44 h-8 text-xs"/>
            </div>
            <select value={deptF} onChange={e => setDeptF(e.target.value)} className="select h-8 text-xs w-40">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            {canWrite && (
              <>
                <button onClick={markAllPresent}
                  className="btn-sm bg-green-500/10 text-green-600 border border-green-500/30 hover:bg-green-500/20 rounded-lg px-3 flex items-center gap-1.5 text-xs font-bold">
                  <FiUserCheck size={13}/> Mark All Present
                </button>
                <button onClick={saveAttendance} disabled={saving} className="btn-primary btn-sm">
                  {saving ? <><FiRefreshCw size={12} className="animate-spin"/> Saving…</> : <><FiSave size={13}/> Save Attendance</>}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Workers table */}
      {!mineId ? (
        <EmptyState icon={FiMapPin} title="Select a mine" description="Choose mine and shift to load workers"/>
      ) : loading ? (
        <PageLoader/>
      ) : !session || (session.workers||[]).length === 0 ? (
        <EmptyState icon={FiUsers} title="No workers for this shift"
          description="Register workers in the Workers section first"
          action={<a href="/workers" className="btn-primary text-sm">Workers Registry</a>}/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Worker ID</th><th>Name</th><th>Department</th>
                <th>Shift</th><th className="text-center min-w-[280px]">Attendance</th>
                <th>Check-In</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(worker => {
                const current = marks[worker.id] || null;
                return (
                  <tr key={worker.id} className={clsx('transition-colors',
                    current==='present' && 'bg-green-500/5',
                    current==='absent'  && 'bg-red-500/5',
                  )}>
                    <td><span className="font-mono text-xs font-bold text-amber-600">{worker.worker_code}</span></td>
                    <td>
                      <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{worker.full_name}</p>
                      <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{worker.designation}</p>
                      {worker.contractor_name && <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{worker.contractor_name}</p>}
                    </td>
                    <td><span className="text-xs" style={{ color:'var(--text-secondary)' }}>{worker.department}</span></td>
                    <td><span className="text-xs capitalize" style={{ color:'var(--text-muted)' }}>{worker.shift}</span></td>
                    <td>
                      <div className="flex gap-1 justify-center flex-wrap">
                        {/* Present + Absent always visible */}
                        {STATUSES.slice(0, 2).map(s => (
                          <button key={s.value} disabled={!canWrite} onClick={() => setMark(worker.id, s.value)}
                            className={clsx('px-2.5 py-1 rounded-lg text-xs font-bold border transition-all',
                              current===s.value ? s.cls+' ring-2 ring-offset-1 ring-current' : 'bg-[var(--bg-card-hover)] border-[var(--border)] hover:border-amber-500/40',
                              !canWrite && 'cursor-default opacity-60')}>
                            {s.label}
                          </button>
                        ))}
                        {/* More statuses dropdown */}
                        <div className="relative group">
                          <button disabled={!canWrite}
                            className={clsx('px-2 py-1 rounded-lg text-xs font-bold border transition-all',
                              STATUSES.slice(2).some(s => s.value===current)
                                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-[var(--bg-card-hover)] border-[var(--border)]',
                              !canWrite && 'cursor-default opacity-60')}>
                            <FiChevronDown size={12}/>
                          </button>
                          <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl py-1 hidden group-hover:block min-w-[110px]">
                            {STATUSES.slice(2).map(s => (
                              <button key={s.value} onClick={() => setMark(worker.id, s.value)}
                                className={clsx('w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-card-hover)]',
                                  current===s.value ? 'text-amber-600 font-bold' : '')}>
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <input type="time" value={checkins[worker.id]||''}
                        onChange={e => setCheckins(prev => ({ ...prev, [worker.id]:e.target.value }))}
                        disabled={!canWrite}
                        className="input w-24 text-xs h-7 font-mono"/>
                    </td>
                    <td>
                      <button onClick={() => setProfileW(worker.id)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-600 hover:bg-amber-500/10 transition-colors">
                        <FiEye size={13}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 && (
            <p className="text-center text-xs py-6" style={{ color:'var(--text-muted)' }}>No workers match the filter.</p>
          )}
        </div>
      )}

      {/* Sticky save for long lists */}
      {session && (session.workers||[]).length > 8 && canWrite && (
        <div className="sticky bottom-4 flex justify-end pointer-events-none">
          <button onClick={saveAttendance} disabled={saving}
            className="btn-primary shadow-2xl pointer-events-auto">
            {saving ? 'Saving…' : <><FiSave size={13}/> Save Attendance</>}
          </button>
        </div>
      )}

      <Modal isOpen={!!profileW} onClose={() => setProfileW(null)} title="Worker Profile" size="lg">
        {profileW && <WorkerMiniProfile workerId={profileW} onClose={() => setProfileW(null)}/>}
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 2 — Records
   ════════════════════════════════════════════════════════════════════════ */
function RecordsTab({ mines }) {
  const { user }    = useAuthStore();
  const [records, setRecords]       = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [dateFilter, setDateFilter] = useState(today());
  const [mineFilter, setMineFilter] = useState(user?.mine_id || '');
  const [shiftFilter,setShiftFilter]= useState('');
  const [statusF,    setStatusF]    = useState('');
  const [pagination, setPagination] = useState({});
  const [page,       setPage]       = useState(1);
  const [profileW,   setProfileW]   = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit:50 };
      if (dateFilter)  params.attendance_date = dateFilter;
      if (mineFilter)  params.mine_id         = mineFilter;
      if (shiftFilter) params.shift           = shiftFilter;
      if (statusF)     params.status          = statusF;

      const [recs, sum] = await Promise.all([
        attendanceApi.getAll(params),
        mineFilter && dateFilter
          ? attendanceApi.getDailySummary({ mine_id:mineFilter, date:dateFilter }).catch(()=>null)
          : Promise.resolve(null),
      ]);
      setRecords(recs.data || []);
      setPagination(recs.pagination || {});
      setSummary(sum?.data || null);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [dateFilter, mineFilter, shiftFilter, statusF, page]);

  return (
    <div className="space-y-4">
      <div className="card-sm flex flex-wrap gap-3 items-end">
        <div className="form-group mb-0">
          <label className="label">Date</label>
          <input type="date" value={dateFilter} onChange={e=>{setDateFilter(e.target.value);setPage(1);}} className="input w-40"/>
        </div>
        <div className="form-group mb-0">
          <label className="label">Mine</label>
          <select value={mineFilter} onChange={e=>{setMineFilter(e.target.value);setPage(1);}} className="select w-48">
            <option value="">All Mines</option>
            {mines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Shift</label>
          <select value={shiftFilter} onChange={e=>{setShiftFilter(e.target.value);setPage(1);}} className="select w-32">
            <option value="">All</option>
            {SHIFTS.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="form-group mb-0">
          <label className="label">Status</label>
          <select value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1);}} className="select w-32">
            <option value="">All</option>
            {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <button onClick={load} className="btn-outline btn-sm self-end"><FiRefreshCw size={13}/> Refresh</button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label:'Present',  value:summary.totals?.present,  color:'text-green-600' },
            { label:'Absent',   value:summary.totals?.absent,   color:'text-red-600'   },
            { label:'Late',     value:summary.totals?.late,     color:'text-amber-600' },
            { label:'Half Day', value:summary.totals?.half_day, color:'text-blue-600'  },
            { label:'On Leave', value:summary.totals?.on_leave, color:'text-gray-500'  },
            { label:'Total',    value:summary.totals?.total,    color:'text-[var(--text-primary)]' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card-sm text-center border border-[var(--border)]">
              <p className={clsx('text-2xl font-black', color)}>{value || 0}</p>
              <p className="text-[10px] mt-0.5" style={{ color:'var(--text-muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? <PageLoader/> : records.length === 0 ? (
        <EmptyState icon={FiUsers} title="No attendance records"
          description={dateFilter ? `No records for ${dateFilter}` : 'No attendance data found'}/>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Worker</th><th>Mine / Area</th><th>Shift</th>
                <th>Status</th><th>Check In</th><th>GPS</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>
                    <p className="font-semibold text-sm" style={{ color:'var(--text-primary)' }}>{r.worker_name}</p>
                    {r.worker_id && <p className="text-[10px] font-mono" style={{ color:'var(--text-muted)' }}>{r.worker_id}</p>}
                  </td>
                  <td>
                    <p className="text-sm" style={{ color:'var(--text-secondary)' }}>{r.mine_name}</p>
                    {r.work_area && <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{r.work_area}</p>}
                  </td>
                  <td><span className="text-xs capitalize" style={{ color:'var(--text-secondary)' }}>{r.shift}</span></td>
                  <td><Badge color={STATUS_COLOR[r.status]||'gray'}>{r.status?.replace('_',' ')}</Badge></td>
                  <td><span className="text-xs font-mono" style={{ color:'var(--text-secondary)' }}>{r.check_in_time || '—'}</span></td>
                  <td>
                    {r.latitude
                      ? <span title={`${r.latitude}, ${r.longitude}`} className="flex items-center gap-0.5 text-[10px] text-green-500">
                          <FiMapPin size={10}/> GPS
                        </span>
                      : <span className="text-[10px]" style={{ color:'var(--text-muted)' }}>—</span>}
                  </td>
                  <td><span className="text-xs" style={{ color:'var(--text-muted)' }}>{r.attendance_date}</span></td>
                  <td>
                    {r.worker_ref_id && (
                      <button onClick={() => setProfileW(r.worker_ref_id)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-amber-600 hover:bg-amber-500/10 transition-colors">
                        <FiEye size={13}/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 p-3">
              <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="btn-outline btn-sm">Prev</button>
              <span className="text-xs self-center" style={{ color:'var(--text-muted)' }}>Page {page} of {pagination.pages}</span>
              <button disabled={page>=pagination.pages} onClick={() => setPage(p=>p+1)} className="btn-outline btn-sm">Next</button>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={!!profileW} onClose={() => setProfileW(null)} title="Worker Profile" size="lg">
        {profileW && <WorkerMiniProfile workerId={profileW} onClose={() => setProfileW(null)}/>}
      </Modal>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════ */
export default function Attendance() {
  const { user }    = useAuthStore();
  const navigate    = useNavigate();
  const [mines, setMines]   = useState([]);
  const [tab,   setTab]     = useState('daily');
  const [online, setOnline] = useState(navigator.onLine);
  const canWrite = ['admin','government_officer','mine_manager','inspector','safety_officer'].includes(user?.role);

  useEffect(() => {
    minesApi.getAll({ limit:100 }).then(r => setMines(r.data||[])).catch(()=>{});
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  }, []);

  return (
    <div className="space-y-5">
      <BackButton className="mb-1"/>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2"><FiUsers className="text-amber-500"/> Worker Attendance</h1>
          <p className="page-subtitle">Daily attendance by mine and shift — register workers once, mark daily with optional GPS</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border',
            online ? 'text-green-600 border-green-500/30 bg-green-500/8' : 'text-red-500 border-red-500/30 bg-red-500/8')}>
            {online ? <FiWifi size={11}/> : <FiWifiOff size={11}/>} {online ? 'Online' : 'Offline'}
          </span>
          {canWrite && (
            <button onClick={() => navigate('/workers')} className="btn-outline btn-sm">
              <FiUsers size={13}/> Manage Workers
            </button>
          )}
        </div>
      </div>

      {!online && (
        <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 flex items-center gap-2 text-sm" style={{ color:'var(--text-secondary)' }}>
          <FiAlertOctagon size={14} className="shrink-0 text-amber-500"/>
          You are offline. Daily attendance requires connectivity.
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-xl p-1 gap-1 w-fit">
        {[
          { key:'daily',   label:'Daily Attendance', icon:FiCalendar },
          { key:'records', label:'Records',          icon:FiList     },
        ].map(({ key, label, icon:Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              tab===key ? 'bg-[var(--bg-card)] text-amber-500 shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
            <Icon size={14}/> {label}
          </button>
        ))}
      </div>

      {tab==='daily'   && <DailyAttendanceTab mines={mines} canWrite={canWrite}/>}
      {tab==='records' && <RecordsTab mines={mines}/>}
    </div>
  );
}
