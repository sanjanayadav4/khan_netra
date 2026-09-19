/**
 * KhanNetra DGMS — Enhanced GIS Mine Map
 * 6 independent map layers (each with ON/OFF toggle):
 *   1. Mines        — coloured by status/risk, mine boundary circle, "View Profile" popup
 *   2. Safety       — open incidents, colour-coded by severity
 *   3. Inspections  — scheduled/in-progress/completed
 *   4. Sensors      — environmental readings, colour by status (critical/warning/normal)
 *   5. Field Reports— geo-tagged field observations
 *   6. Disasters    — active earthquake/weather/flood alerts
 *
 * All data from real backend APIs. Incidents/inspections use mine coordinates
 * (same mine = slight offset so markers don't overlap). Sensor readings use
 * mine coordinates with a small programmatic offset per parameter index.
 *
 * Search: autocomplete from /mines/search — fly map to selected mine.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MapContainer, TileLayer, Marker, Popup, Circle,
  LayerGroup, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  FiLayers, FiMapPin, FiAlertTriangle, FiAlertOctagon, FiCompass,
  FiRefreshCw, FiSearch, FiX, FiThermometer, FiWind, FiDroplet,
  FiActivity, FiShield, FiRss, FiEye, FiCheckSquare, FiUsers,
  FiChevronDown,
} from 'react-icons/fi';
import { riskApi, minesApi } from '../../services/api';
import BackButton from '../../components/ui/BackButton';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import clsx from 'clsx';

/* ── Leaflet icon reset ─────────────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

/* ── Icon factory ───────────────────────────────────────────────────── */
const mkIcon = (color, size = 18, symbol = '●', pulse = false) => L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:${size}px;height:${size}px">
      ${pulse ? `<div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.35;animation:gis-pulse 1.8s ease-out infinite;"></div>` : ''}
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};border:2px solid rgba(255,255,255,.9);
        box-shadow:0 0 8px ${color}80,0 2px 5px rgba(0,0,0,.55);
        display:flex;align-items:center;justify-content:center;
        font-size:${Math.round(size*.55)}px;line-height:1;
      ">${symbol}</div>
    </div>
    <style>@keyframes gis-pulse{0%{transform:scale(1);opacity:.4}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}</style>
  `,
  iconSize:   [size, size],
  iconAnchor: [size / 2, size / 2],
  popupAnchor:[0, -size / 2 - 4],
});

/* ── Pre-built layer icons ──────────────────────────────────────────── */
const ICONS = {
  mineActive:      mkIcon('#22c55e', 22, '⛏'),
  mineCompliance:  mkIcon('#f97316', 22, '⛏'),
  mineSuspended:   mkIcon('#ef4444', 22, '⛏', true),
  mineInspection:  mkIcon('#f59e0b', 22, '⛏'),
  incidentFatal:   mkIcon('#dc2626', 16, '💀', true),
  incidentSerious: mkIcon('#ef4444', 15, '🚨', true),
  incidentMinor:   mkIcon('#f97316', 13, '⚠'),
  incidentNearMiss:mkIcon('#f59e0b', 12, '⚡'),
  inspScheduled:   mkIcon('#3b82f6', 14, '📋'),
  inspInProgress:  mkIcon('#f59e0b', 14, '🔍'),
  inspCompleted:   mkIcon('#22c55e', 13, '✓'),
  sensorCritical:  mkIcon('#dc2626', 14, '📡', true),
  sensorWarning:   mkIcon('#f59e0b', 13, '📡'),
  sensorNormal:    mkIcon('#22c55e', 12, '📡'),
  fieldReport:     mkIcon('#8b5cf6', 13, '📍'),
  disaster:        mkIcon('#dc2626', 16, '🌪', true),
};

function getMineIcon(mine) {
  if (mine.status === 'suspended')        return ICONS.mineSuspended;
  if (mine.status === 'under_inspection') return ICONS.mineInspection;
  if (parseFloat(mine.compliance_score) < 60) return ICONS.mineCompliance;
  return ICONS.mineActive;
}
function getIncidentIcon(inc) {
  const s = inc.severity?.toLowerCase();
  if (s === 'fatal')   return ICONS.incidentFatal;
  if (s === 'serious') return ICONS.incidentSerious;
  if (s === 'near_miss') return ICONS.incidentNearMiss;
  return ICONS.incidentMinor;
}
function getSensorIcon(sensor) {
  if (sensor.status === 'critical') return ICONS.sensorCritical;
  if (sensor.status === 'warning')  return ICONS.sensorWarning;
  return ICONS.sensorNormal;
}

/* ── Jitter to avoid stacked markers at same mine coordinate ────────── */
function jitter(lat, lon, index, spread = 0.008) {
  const angle = (index * 137.5 * Math.PI) / 180;
  const r     = spread * (0.3 + (index % 4) * 0.18);
  return [parseFloat(lat) + r * Math.cos(angle), parseFloat(lon) + r * Math.sin(angle)];
}

/* ── FlyTo controller (child component) ────────────────────────────── */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 10, { duration: 1.2 });
  }, [target, map]);
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   LAYER CONFIG — defines display name, icon colour, and default state
═══════════════════════════════════════════════════════════════════════ */
const LAYER_CONFIG = [
  { key:'mines',       label:'Mines',         icon:FiMapPin,       color:'#22c55e', desc:'All registered mines' },
  { key:'safety',      label:'Safety',         icon:FiAlertTriangle,color:'#ef4444', desc:'Open incidents & unsafe zones' },
  { key:'inspections', label:'Inspections',    icon:FiClipboard_,   color:'#3b82f6', desc:'Scheduled & active inspections' },
  { key:'sensors',     label:'Env Sensors',    icon:FiActivity,     color:'#f59e0b', desc:'Gas, temperature & env readings' },
  { key:'fieldReports',label:'Field Reports',  icon:FiCompass,      color:'#8b5cf6', desc:'Geo-tagged field observations' },
  { key:'disasters',   label:'Disasters',      icon:FiRss,          color:'#dc2626', desc:'Earthquake, flood & weather alerts' },
];
function FiClipboard_({ size }) { return <FiCheckSquare size={size}/>; }  // alias

/* ═══════════════════════════════════════════════════════════════════════
   POPUP helpers — consistent dark-glass style
═══════════════════════════════════════════════════════════════════════ */
const PS = {  // popup styles
  wrap:    { fontFamily:"'Inter',system-ui,sans-serif", fontSize:12, minWidth:220, maxWidth:280 },
  chip:    (bg, c) => ({ background:bg, color:c, padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700, display:'inline-block', marginBottom:6 }),
  title:   { fontWeight:800, fontSize:14, color:'#0f172a', margin:'4px 0 2px', lineHeight:1.25 },
  sub:     { color:'#64748b', fontSize:11, margin:'0 0 8px' },
  grid:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px', fontSize:11, margin:'6px 0' },
  kv:      { color:'#64748b' },
  val:     { fontWeight:700, color:'#0f172a' },
  valRed:  { fontWeight:700, color:'#dc2626' },
  valAmb:  { fontWeight:700, color:'#d97706' },
  valGrn:  { fontWeight:700, color:'#16a34a' },
  cta:     { display:'block', marginTop:10, padding:'6px 0', borderRadius:8, background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.35)', color:'#b45309', fontWeight:700, fontSize:11, textAlign:'center', textDecoration:'none' },
  divider: { borderTop:'1px solid #e2e8f0', margin:'8px 0 6px' },
};

/* ── Layer toggle button ───────────────────────────────────────────── */
function LayerToggle({ cfg, active, count, onClick }) {
  const Icon = cfg.icon;
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
      style={{
        backgroundColor: active ? `${cfg.color}18` : 'var(--bg-card)',
        borderColor:     active ? `${cfg.color}55` : 'var(--border)',
        color:           active ? cfg.color         : 'var(--text-muted)',
      }}>
      <Icon size={12}/>
      <span>{cfg.label}</span>
      {count > 0 && (
        <span style={{ background: active ? cfg.color : 'var(--bg-card-hover)', color: active ? '#fff' : 'var(--text-muted)', padding:'0 5px', borderRadius:999, fontSize:10, fontWeight:800 }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════ */
export default function GISMap() {
  const [gisData,  setGisData]  = useState(null);
  const [allMines, setAllMines] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [layers,   setLayers]   = useState({
    mines:true, safety:true, inspections:true,
    sensors:true, fieldReports:true, disasters:true,
  });
  const [mineFilter,  setMineFilter]  = useState('');
  const [flyTarget,   setFlyTarget]   = useState(null);

  /* Search autocomplete */
  const [searchQ,     setSearchQ]    = useState('');
  const [searchRes,   setSearchRes]  = useState([]);
  const [searchOpen,  setSearchOpen] = useState(false);
  const [searchBusy,  setSearchBusy] = useState(false);
  const searchRef  = useRef(null);
  const searchTimer= useRef(null);

  /* Stats panel */
  const [showStats, setShowStats] = useState(false);

  /* ── Data load ──────────────────────────────────────────────────── */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [gis, ms] = await Promise.all([
        riskApi.getGis(mineFilter ? { mine_id: mineFilter } : {}),
        minesApi.getAll({ limit: 100 }),
      ]);
      setGisData(gis.data);
      setAllMines(ms.data || []);
    } catch {
      setError('Failed to load GIS data. Check your connection and try again.');
      if (!quiet) toast.error('GIS data load failed');
    } finally {
      setLoading(false);
    }
  }, [mineFilter]);

  useEffect(() => { load(); }, [load]);

  /* ── Close search on outside click ────────────────────────────── */
  useEffect(() => {
    const h = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Autocomplete debounce ──────────────────────────────────────── */
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!searchQ.trim() || searchQ.length < 2) { setSearchRes([]); setSearchOpen(false); return; }
    setSearchBusy(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await minesApi.search(searchQ);
        setSearchRes(r.data || []);
        setSearchOpen(true);
      } catch { setSearchRes([]); }
      finally { setSearchBusy(false); }
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [searchQ]);

  const toggleLayer = (key) => setLayers(l => ({ ...l, [key]: !l[key] }));

  const handleSearchSelect = (mine) => {
    setSearchQ(mine.name);
    setSearchOpen(false);
    setMineFilter(mine.id);
    if (mine.latitude && mine.longitude)
      setFlyTarget([parseFloat(mine.latitude), parseFloat(mine.longitude)]);
  };

  const handleClearSearch = () => {
    setSearchQ(''); setSearchRes([]); setSearchOpen(false);
    setMineFilter(''); setFlyTarget(null);
  };

  /* ── Derived data ─────────────────────────────────────────────── */
  const mapMines      = (gisData?.mines        || []).filter(m => m.latitude && m.longitude);
  const mapIncidents  = (gisData?.incidents    || []).filter(i => i.latitude && i.longitude);
  const mapInspections= (gisData?.inspections  || []).filter(i => i.latitude && i.longitude);
  const mapSensors    = (gisData?.sensors      || []).filter(s => s.latitude && s.longitude);
  const mapFieldReps  = (gisData?.field_reports|| []).filter(r => r.latitude && r.longitude);
  const mapDisasters  = (gisData?.disasters    || []).filter(d => d.latitude && d.longitude);

  // Group sensors/incidents/inspections by mine so we can jitter them
  const grouped = { incidents:{}, inspections:{}, sensors:{} };
  mapIncidents.forEach((inc, i)  => { const k = `${inc.latitude},${inc.longitude}`; grouped.incidents[k]  = (grouped.incidents[k]  || []); grouped.incidents[k].push(inc);  });
  mapInspections.forEach((ins,i) => { const k = `${ins.latitude},${ins.longitude}`; grouped.inspections[k]= (grouped.inspections[k]|| []); grouped.inspections[k].push(ins);});
  mapSensors.forEach((s,i)       => { const k = `${s.latitude},${s.longitude}`;     grouped.sensors[k]    = (grouped.sensors[k]    || []); grouped.sensors[k].push(s);     });

  const center = mapMines.length
    ? [mapMines.reduce((s, m) => s + parseFloat(m.latitude), 0)  / mapMines.length,
       mapMines.reduce((s, m) => s + parseFloat(m.longitude), 0) / mapMines.length]
    : [22.5, 82.5];

  const meta  = gisData ? gisData : {};
  const counts = {
    mines:       mapMines.length,
    incidents:   mapIncidents.length,
    inspections: mapInspections.length,
    sensors:     mapSensors.length,
    fieldReports:mapFieldReps.length,
    disasters:   mapDisasters.length,
  };

  /* ── Render ───────────────────────────────────────────────────── */
  if (loading) return <PageLoader message="Loading GIS data…"/>;

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-96 gap-4 text-center">
      <FiAlertTriangle size={40} style={{ color:'#ef4444' }}/>
      <p className="font-bold text-lg" style={{ color:'var(--text-primary)' }}>GIS Map Unavailable</p>
      <p className="text-sm" style={{ color:'var(--text-muted)', maxWidth:360 }}>{error}</p>
      <button onClick={() => load()} className="btn-primary"><FiRefreshCw size={14}/> Retry</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <BackButton/>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiLayers style={{ color:'var(--accent)' }}/> GIS Mine Map
          </h1>
          <p className="page-subtitle">
            Live map — {counts.mines} mines · {counts.incidents} incidents · {counts.sensors} sensors · {counts.disasters} disaster alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowStats(s => !s)} className="btn-outline btn-sm">
            <FiActivity size={13}/> {showStats ? 'Hide' : 'Show'} Stats
          </button>
          <button onClick={() => load(true)} className="btn-outline btn-sm">
            <FiRefreshCw size={13}/> Refresh
          </button>
        </div>
      </div>

      {/* ── Stats panel ────────────────────────────────────────────── */}
      {showStats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { label:'Mines',        value:counts.mines,        color:'#22c55e' },
            { label:'Incidents',    value:counts.incidents,    color:'#ef4444' },
            { label:'Inspections',  value:counts.inspections,  color:'#3b82f6' },
            { label:'Env Sensors',  value:counts.sensors,      color:'#f59e0b' },
            { label:'Field Reports',value:counts.fieldReports, color:'#8b5cf6' },
            { label:'Disasters',    value:counts.disasters,    color:'#dc2626' },
          ].map(s => (
            <div key={s.label} className="card p-3 text-center">
              <p style={{ fontSize:22, fontWeight:900, color:s.color, margin:0 }}>{s.value}</p>
              <p style={{ fontSize:10, fontWeight:600, color:'var(--text-muted)', margin:'2px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Search + layer controls ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-start">
        {/* Mine search autocomplete */}
        <div ref={searchRef} className="relative" style={{ minWidth:260 }}>
          <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none', zIndex:1 }}/>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onFocus={() => searchRes.length && setSearchOpen(true)}
            placeholder="Search mine to locate on map…"
            className="input"
            style={{ paddingLeft:32, paddingRight: searchQ ? 30 : 12, width:'100%' }}
          />
          {searchQ && (
            <button onClick={handleClearSearch} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex' }}>
              <FiX size={12}/>
            </button>
          )}
          {searchOpen && (
            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, backgroundColor:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'var(--shadow-lg)', zIndex:9999, overflow:'hidden' }}>
              {searchBusy ? (
                <div className="flex items-center gap-2 py-3 px-4">
                  <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor:'var(--border)', borderTopColor:'var(--accent)' }}/>
                  <span style={{ fontSize:12, color:'var(--text-muted)' }}>Searching…</span>
                </div>
              ) : searchRes.length === 0 ? (
                <div style={{ padding:'10px 14px', fontSize:12, color:'var(--text-muted)' }}>No mines found</div>
              ) : searchRes.map(m => (
                <button key={m.id} onClick={() => handleSearchSelect(m)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
                  style={{ borderBottom:'1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor='var(--hover-accent-bg)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor=''}>
                  <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, backgroundColor:
                    m.status==='suspended'?'#ef4444':m.status==='active'?'#22c55e':'#f59e0b' }}/>
                  <div className="min-w-0 flex-1">
                    <p style={{ fontWeight:600, fontSize:13, color:'var(--text-primary)', margin:0 }}>{m.name}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)', margin:0 }}>{m.mine_id} · {m.state}</p>
                  </div>
                  <FiMapPin size={11} style={{ color:'var(--accent)', flexShrink:0 }}/>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Layer toggles */}
        <div className="flex flex-wrap gap-1.5">
          {LAYER_CONFIG.map(cfg => (
            <LayerToggle
              key={cfg.key}
              cfg={cfg}
              active={layers[cfg.key]}
              count={counts[cfg.key] || 0}
              onClick={() => toggleLayer(cfg.key)}
            />
          ))}
        </div>

        {/* All-off / all-on */}
        <div className="flex gap-1">
          <button onClick={() => setLayers(Object.fromEntries(LAYER_CONFIG.map(c => [c.key, true])))}
            className="btn-outline btn-xs">All On</button>
          <button onClick={() => setLayers(Object.fromEntries(LAYER_CONFIG.map(c => [c.key, false])))}
            className="btn-outline btn-xs">All Off</button>
        </div>
      </div>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ height:580, border:'1px solid var(--border)', boxShadow:'var(--shadow-md)' }}>
        <MapContainer center={center} zoom={5} style={{ height:'100%', width:'100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <FlyTo target={flyTarget}/>

          {/* ════ LAYER 1 — MINES ════ */}
          {layers.mines && (
            <LayerGroup>
              {mapMines.map(m => {
                const lat = parseFloat(m.latitude);
                const lon = parseFloat(m.longitude);
                const areaR = m.area_hectares ? Math.sqrt(m.area_hectares * 10000 / Math.PI) * 20 : 3000;
                const borderColor =
                  m.status === 'suspended'        ? '#ef4444' :
                  m.status === 'under_inspection' ? '#f59e0b' :
                  parseFloat(m.compliance_score) < 60 ? '#f97316' : '#22c55e';
                return (
                  <React.Fragment key={m.id}>
                    {/* Mine boundary circle */}
                    <Circle
                      center={[lat, lon]}
                      radius={Math.min(areaR, 8000)}
                      pathOptions={{ color:borderColor, fillColor:borderColor, fillOpacity:0.06, weight:1.5, dashArray:'6 4' }}
                    />
                    <Marker position={[lat, lon]} icon={getMineIcon(m)}>
                      <Popup maxWidth={290}>
                        <div style={PS.wrap}>
                          <span style={PS.chip(
                            m.status==='suspended' ? 'rgba(239,68,68,.15)' :
                            m.status==='active'    ? 'rgba(34,197,94,.15)' : 'rgba(245,158,11,.15)',
                            m.status==='suspended' ? '#dc2626' :
                            m.status==='active'    ? '#16a34a' : '#d97706'
                          )}>{m.status?.toUpperCase()}</span>
                          <p style={PS.title}>{m.name}</p>
                          <p style={PS.sub}>{m.mine_id} · {m.type} · {m.district}, {m.state}</p>
                          <div style={PS.grid}>
                            <div><span style={PS.kv}>Compliance </span><span style={parseFloat(m.compliance_score)>=80?PS.valGrn:parseFloat(m.compliance_score)>=60?PS.valAmb:PS.valRed}>{parseFloat(m.compliance_score||0).toFixed(1)}%</span></div>
                            <div><span style={PS.kv}>Risk </span><span style={parseFloat(m.risk_score)>=70?PS.valRed:PS.valAmb}>{parseFloat(m.risk_score||0).toFixed(1)}%</span></div>
                            <div><span style={PS.kv}>Safety </span><span style={PS.val}>{parseFloat(m.safety_score||0).toFixed(1)}%</span></div>
                            <div><span style={PS.kv}>Workers </span><span style={PS.val}>{m.workers_count?.toLocaleString() || '—'}</span></div>
                            <div><span style={PS.kv}>Open Violations </span><span style={m.open_violations>0?PS.valRed:PS.valGrn}>{m.open_violations||0}</span></div>
                            <div><span style={PS.kv}>Open Incidents </span><span style={m.open_incidents>0?PS.valAmb:PS.valGrn}>{m.open_incidents||0}</span></div>
                          </div>
                          {m.license_expiry && new Date(m.license_expiry) < new Date() && (
                            <p style={{ color:'#dc2626', fontWeight:700, fontSize:11, margin:'6px 0 0' }}>⛔ License EXPIRED {formatDate(m.license_expiry)}</p>
                          )}
                          <div style={PS.divider}/>
                          <a href={`/mines/${m.id}`} style={PS.cta}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(245,158,11,.22)'}
                            onMouseLeave={e=>e.currentTarget.style.background='rgba(245,158,11,.12)'}>
                            View Mine Profile →
                          </a>
                        </div>
                      </Popup>
                    </Marker>
                  </React.Fragment>
                );
              })}
            </LayerGroup>
          )}

          {/* ════ LAYER 2 — SAFETY / INCIDENTS ════ */}
          {layers.safety && (
            <LayerGroup>
              {mapIncidents.map((inc, idx) => {
                const [lat, lon] = jitter(inc.latitude, inc.longitude, idx, 0.012);
                return (
                  <Marker key={inc.id} position={[lat, lon]} icon={getIncidentIcon(inc)}>
                    <Popup maxWidth={270}>
                      <div style={PS.wrap}>
                        <span style={PS.chip(
                          inc.severity==='fatal'||inc.severity==='serious'?'rgba(239,68,68,.15)':'rgba(249,115,22,.15)',
                          inc.severity==='fatal'||inc.severity==='serious'?'#dc2626':'#ea580c'
                        )}>INCIDENT · {inc.severity?.toUpperCase()}</span>
                        <p style={PS.title}>{inc.type}</p>
                        <p style={PS.sub}>{inc.mine_name} · {inc.location_in_mine || 'Mine Site'}</p>
                        <div style={PS.grid}>
                          <div><span style={PS.kv}>Number </span><span style={PS.val}>{inc.incident_number}</span></div>
                          <div><span style={PS.kv}>Status </span><span style={PS.val}>{inc.status?.replace(/_/g,' ')}</span></div>
                          <div><span style={PS.kv}>Injuries </span><span style={inc.injuries_count>0?PS.valAmb:PS.val}>{inc.injuries_count}</span></div>
                          <div><span style={PS.kv}>Fatalities </span><span style={inc.fatalities_count>0?PS.valRed:PS.valGrn}>{inc.fatalities_count}</span></div>
                          <div style={{ gridColumn:'1/-1' }}><span style={PS.kv}>Date </span><span style={PS.val}>{formatDate(inc.incident_date)}</span></div>
                        </div>
                        {inc.description && <p style={{ fontSize:11, color:'#475569', marginTop:6, lineHeight:1.5 }}>{inc.description?.slice(0,140)}…</p>}
                        <a href="/incidents" style={PS.cta}>View All Incidents →</a>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          )}

          {/* ════ LAYER 3 — INSPECTIONS ════ */}
          {layers.inspections && (
            <LayerGroup>
              {mapInspections.map((ins, idx) => {
                const [lat, lon] = jitter(ins.latitude, ins.longitude, idx + 20, 0.014);
                const icon = ins.status==='completed' ? ICONS.inspCompleted :
                             ins.status==='in_progress' ? ICONS.inspInProgress : ICONS.inspScheduled;
                return (
                  <Marker key={ins.id} position={[lat, lon]} icon={icon}>
                    <Popup maxWidth={270}>
                      <div style={PS.wrap}>
                        <span style={PS.chip(
                          ins.status==='completed' ? 'rgba(34,197,94,.15)' :
                          ins.status==='in_progress' ? 'rgba(245,158,11,.15)' : 'rgba(59,130,246,.15)',
                          ins.status==='completed' ? '#16a34a' :
                          ins.status==='in_progress' ? '#d97706' : '#2563eb'
                        )}>INSPECTION · {ins.status?.toUpperCase().replace('_',' ')}</span>
                        <p style={PS.title}>{ins.inspection_number}</p>
                        <p style={PS.sub}>{ins.mine_name} · {ins.type}</p>
                        <div style={PS.grid}>
                          <div><span style={PS.kv}>Scheduled </span><span style={PS.val}>{formatDate(ins.scheduled_date)}</span></div>
                          {ins.overall_score && <div><span style={PS.kv}>Score </span><span style={parseFloat(ins.overall_score)>=80?PS.valGrn:parseFloat(ins.overall_score)>=60?PS.valAmb:PS.valRed}>{parseFloat(ins.overall_score).toFixed(0)}%</span></div>}
                        </div>
                        {ins.findings && <p style={{ fontSize:11, color:'#475569', marginTop:6 }}>{ins.findings?.slice(0,120)}…</p>}
                        <a href="/inspections" style={PS.cta}>View All Inspections →</a>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          )}

          {/* ════ LAYER 4 — ENV SENSORS ════ */}
          {layers.sensors && (
            <LayerGroup>
              {mapSensors.map((s, idx) => {
                const [lat, lon] = jitter(s.latitude, s.longitude, idx + 40, 0.016);
                return (
                  <Marker key={s.id} position={[lat, lon]} icon={getSensorIcon(s)}>
                    <Popup maxWidth={260}>
                      <div style={PS.wrap}>
                        <span style={PS.chip(
                          s.status==='critical'?'rgba(239,68,68,.15)':
                          s.status==='warning'?'rgba(245,158,11,.15)':'rgba(34,197,94,.15)',
                          s.status==='critical'?'#dc2626':s.status==='warning'?'#d97706':'#16a34a'
                        )}>SENSOR · {s.status?.toUpperCase()}</span>
                        <p style={PS.title}>{s.parameter}</p>
                        <p style={PS.sub}>{s.mine_name} · {s.location || s.reading_type}</p>
                        <div style={PS.grid}>
                          <div><span style={PS.kv}>Value </span>
                            <span style={s.status==='critical'?PS.valRed:s.status==='warning'?PS.valAmb:PS.valGrn}>
                              {parseFloat(s.value).toFixed(2)} {s.unit}
                            </span>
                          </div>
                          {s.threshold_max && <div><span style={PS.kv}>Max Limit </span><span style={PS.val}>{s.threshold_max} {s.unit}</span></div>}
                          <div style={{ gridColumn:'1/-1' }}><span style={PS.kv}>Recorded </span><span style={PS.val}>{formatDate(s.recorded_at)}</span></div>
                        </div>
                        <a href="/environment" style={PS.cta}>View Environment →</a>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          )}

          {/* ════ LAYER 5 — FIELD REPORTS ════ */}
          {layers.fieldReports && (
            <LayerGroup>
              {mapFieldReps.map(r => (
                <Marker key={r.id} position={[parseFloat(r.latitude), parseFloat(r.longitude)]} icon={ICONS.fieldReport}>
                  <Popup maxWidth={260}>
                    <div style={PS.wrap}>
                      <span style={PS.chip('rgba(139,92,246,.15)','#7c3aed')}>FIELD REPORT · {r.severity?.toUpperCase()}</span>
                      <p style={PS.title}>{r.title}</p>
                      <p style={PS.sub}>{r.mine_name} · {r.location_name || 'Field Site'}</p>
                      <div style={PS.grid}>
                        <div><span style={PS.kv}>Type </span><span style={PS.val}>{r.report_type}</span></div>
                        <div><span style={PS.kv}>Status </span><span style={PS.val}>{r.status}</span></div>
                        <div style={{ gridColumn:'1/-1' }}><span style={PS.kv}>Reported </span><span style={PS.val}>{formatDate(r.created_at)}</span></div>
                      </div>
                      <a href="/field-reports" style={PS.cta}>View Field Reports →</a>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </LayerGroup>
          )}

          {/* ════ LAYER 6 — DISASTERS ════ */}
          {layers.disasters && (
            <LayerGroup>
              {mapDisasters.map(d => (
                <Marker key={d.id} position={[parseFloat(d.latitude), parseFloat(d.longitude)]} icon={ICONS.disaster}>
                  <Popup maxWidth={280}>
                    <div style={PS.wrap}>
                      <span style={PS.chip(
                        d.severity==='CRITICAL'?'rgba(239,68,68,.2)':'rgba(249,115,22,.15)',
                        d.severity==='CRITICAL'?'#dc2626':'#ea580c'
                      )}>🌪 DISASTER · {d.severity}</span>
                      <p style={PS.title}>{d.alert_type}</p>
                      <p style={PS.sub}>{d.location_name}</p>
                      <div style={PS.grid}>
                        {d.magnitude && <div><span style={PS.kv}>Magnitude </span><span style={PS.valRed}>M{parseFloat(d.magnitude).toFixed(1)}</span></div>}
                        {d.wind_speed && <div><span style={PS.kv}>Wind </span><span style={PS.valAmb}>{parseFloat(d.wind_speed).toFixed(0)} km/h</span></div>}
                        {d.rainfall && <div><span style={PS.kv}>Rainfall </span><span style={PS.val}>{parseFloat(d.rainfall).toFixed(0)} mm</span></div>}
                        <div style={{ gridColumn:'1/-1' }}><span style={PS.kv}>Alert Time </span><span style={PS.val}>{formatDate(d.alert_time)}</span></div>
                      </div>
                      {d.affected_mines?.length > 0 && (
                        <p style={{ fontSize:11, color:'#ef4444', fontWeight:700, marginTop:6 }}>
                          ⚠ {d.affected_mines.length} mine(s) affected
                        </p>
                      )}
                      <a href="/disaster" style={PS.cta}>View Disaster Alerts →</a>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </LayerGroup>
          )}
        </MapContainer>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────── */}
      <div className="card-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
          <span style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--text-muted)' }}>Legend</span>
          {[
            { color:'#22c55e', label:'Active Mine (Good Compliance)' },
            { color:'#f97316', label:'Mine (Low Compliance)' },
            { color:'#ef4444', label:'Suspended / High Risk' },
            { color:'#f59e0b', label:'Under Inspection' },
            { color:'#dc2626', label:'Fatal/Serious Incident' },
            { color:'#3b82f6', label:'Scheduled Inspection' },
            { color:'#f59e0b', label:'Env Sensor Warning' },
            { color:'#8b5cf6', label:'Field Report' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span style={{ width:9, height:9, borderRadius:'50%', background:l.color, display:'inline-block', flexShrink:0, boxShadow:`0 0 4px ${l.color}60` }}/>
              <span style={{ fontSize:11, color:'var(--text-secondary)' }}>{l.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span style={{ width:24, height:0, border:'1.5px dashed #22c55e', display:'inline-block' }}/>
            <span style={{ fontSize:11, color:'var(--text-secondary)' }}>Mine Boundary</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// React imported at top of file
