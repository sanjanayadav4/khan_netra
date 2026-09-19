/**
 * KhanNetra DGMS — Mine Disaster & Emergency Alert Management System
 * Built on top of the existing /disaster/* API endpoints (no backend changes).
 * All simulated sensor data is clearly labelled ⚠ DEMO / SIMULATED DATA.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertTriangle, FiAlertOctagon, FiRefreshCw, FiCheckCircle,
  FiXCircle, FiClock, FiMapPin, FiBarChart2, FiZap, FiVolume2,
  FiVolumeX, FiInfo, FiCheckSquare, FiShield, FiUsers, FiWifi,
  FiWifiOff, FiSearch, FiFilter, FiActivity, FiTrendingUp,
  FiThermometer, FiDroplet, FiWind, FiCpu, FiTool,
  FiRadio, FiPhone, FiNavigation, FiPower, FiBell,
  FiChevronRight, FiChevronDown, FiX, FiCheck,
  FiAlertCircle, FiEye, FiLayers, FiDatabase,
} from 'react-icons/fi';
import { disasterApi } from '../../services/api';
import { formatDateTime, timeAgo } from '../../utils/helpers';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import BackButton from '../../components/ui/BackButton';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
═══════════════════════════════════════════════════════════════════ */

const SEV_CFG = {
  CRITICAL: { label:'CRITICAL', badge:'red',    dot:'bg-red-500',    text:'text-red-600',    textDark:'text-red-400',    bg:'rgba(239,68,68,.08)',   border:'rgba(239,68,68,.30)',   pulse:true  },
  HIGH:     { label:'HIGH',     badge:'orange', dot:'bg-orange-500', text:'text-orange-600', textDark:'text-orange-400', bg:'rgba(249,115,22,.07)',  border:'rgba(249,115,22,.28)',  pulse:true  },
  MEDIUM:   { label:'MEDIUM',   badge:'yellow', dot:'bg-amber-500',  text:'text-amber-600',  textDark:'text-amber-400',  bg:'rgba(245,158,11,.06)',  border:'rgba(245,158,11,.25)',  pulse:false },
  LOW:      { label:'LOW',      badge:'blue',   dot:'bg-blue-500',   text:'text-blue-600',   textDark:'text-blue-400',   bg:'rgba(37,99,235,.05)',   border:'rgba(37,99,235,.20)',   pulse:false },
};

const TYPE_EMOJI = {
  'Earthquake': '🌍', 'Thunderstorm': '⛈️', 'Thunderstorm / Lightning': '⛈️',
  'Heavy Rainfall': '🌧️', 'Extreme Rainfall': '🌊', 'Heavy Rainfall / Flood Risk': '🌊',
  'Cyclonic Wind': '🌀', 'Severe Wind': '💨', 'Flood': '🌊',
  'TEST – Earthquake': '🧪', 'Gas Leak': '☁️', 'Fire': '🔥',
  'Roof Collapse': '🏗️', 'Seismic': '📡', 'Worker SOS': '🆘',
};

const CATEGORY_FILTERS = [
  { id:'all',         label:'All Alerts',     icon:FiAlertTriangle },
  { id:'gas',         label:'Gas & Air',       icon:FiWind          },
  { id:'fire',        label:'Fire & Heat',     icon:FiThermometer   },
  { id:'flood',       label:'Flood & Water',   icon:FiDroplet       },
  { id:'earthquake',  label:'Earthquake',      icon:FiActivity      },
  { id:'environment', label:'Environment',     icon:FiLayers        },
  { id:'machinery',   label:'Machinery',       icon:FiTool          },
  { id:'worker',      label:'Worker Safety',   icon:FiUsers         },
];

const CAT_KEYWORDS = {
  gas:         ['gas','methane','co','oxygen','coal dust','air quality','ch4'],
  fire:        ['fire','smoke','heat','temperature','conveyor'],
  flood:       ['flood','rainfall','rain','water','seepage','cyclone','wind'],
  earthquake:  ['earthquake','seismic','vibration','strata','roof'],
  environment: ['environment','thunderstorm','lightning','weather'],
  machinery:   ['machinery','conveyor','belt','equipment','proximity'],
  worker:      ['worker','sos','man-down','person','miner','tracking'],
};

function matchCategory(alert, cat) {
  if (cat === 'all') return true;
  const haystack = `${alert.alert_type} ${alert.title} ${alert.description || ''}`.toLowerCase();
  return (CAT_KEYWORDS[cat] || []).some(kw => haystack.includes(kw));
}

const EVAC_ACTIONS = {
  Earthquake:   ['STOP all blasting and machinery immediately','Evacuate all underground workers via nearest exit','Move to open area away from high walls and slopes','Do not re-enter until stability assessment is complete','Contact DGMS Emergency: 1800-345-6789'],
  Flood:        ['Shut down all electrical equipment immediately','Evacuate low-lying areas and sump pits first','Move vehicles and equipment to higher ground','Seal all mine entries to prevent water ingress','Contact State Disaster Management Authority'],
  Cyclone:      ['Halt all open-cast and surface operations','Secure all loose equipment and structures','Move workers to reinforced shelter buildings','Stay away from highwalls, conveyors and towers','Monitor IMD alerts continuously'],
  Thunderstorm: ['Stop all blasting operations immediately','Keep workers away from tall structures and trees','Ground all electrical equipment','Wait 30 minutes after last thunder before resuming','Inspect all electrical installations after storm'],
  Fire:         ['Activate fire suppression systems immediately','Evacuate all personnel from affected section','Isolate electrical power to the zone','Do not use water on electrical fires — use CO₂','Contact Mine Rescue Team: 1800-123-4567'],
  Gas:          ['Stop all ignition sources immediately','Activate ventilation fans to maximum','Evacuate affected section of mine','Deploy gas monitoring team with PPE','Do not re-enter until gas levels are safe'],
  default:      ['Halt all non-essential operations','Account for all personnel on site','Follow mine emergency response plan','Contact Mine Manager and Safety Officer immediately','Stand by for further instructions from DGMS'],
};

function getEvacActions(alertType) {
  for (const [key, val] of Object.entries(EVAC_ACTIONS)) {
    if (alertType?.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return EVAC_ACTIONS.default;
}

/* ─── DEMO simulated sensor data (clearly labelled) ─────────────── */
const DEMO_SENSORS = [
  {
    id:'s1', type:'Gas',  param:'Methane (CH₄)',   unit:'% LEL', value:28, threshold:20, safe:10,
    severity:'HIGH', mine:'Jharia Central Mine', location:'Level 3 – Section B',
    time: new Date(Date.now()-8*60000).toISOString(),
    action:'Activate ventilation. Evacuate section if >40% LEL.',
    icon: FiWind, color:'orange',
  },
  {
    id:'s2', type:'Gas',  param:'Carbon Monoxide (CO)', unit:'ppm', value:12, threshold:25, safe:5,
    severity:'MEDIUM', mine:'Raniganj Deep Mine', location:'Underground – Face 7',
    time: new Date(Date.now()-23*60000).toISOString(),
    action:'Increase ventilation. Monitor closely. Alert workers.',
    icon: FiWind, color:'yellow',
  },
  {
    id:'s3', type:'Gas',  param:'Oxygen (O₂)',      unit:'%vol', value:19.2, threshold:19.5, safe:20.9,
    severity:'HIGH', mine:'Jharia Coking Coal Ltd', location:'Deep Level – Shaft 2',
    time: new Date(Date.now()-4*60000).toISOString(),
    action:'Oxygen deficiency alert. Evacuate immediately.',
    icon: FiActivity, color:'orange',
  },
  {
    id:'s4', type:'Gas',  param:'Coal Dust',        unit:'mg/m³', value:1.8, threshold:2.0, safe:1.0,
    severity:'MEDIUM', mine:'Bokaro Steel Mine', location:'Conveyor – Zone A',
    time: new Date(Date.now()-41*60000).toISOString(),
    action:'Activate dust suppression. Check conveyor seals.',
    icon: FiLayers, color:'yellow',
  },
  {
    id:'s5', type:'Environment', param:'Temperature', unit:'°C', value:34, threshold:32, safe:28,
    severity:'MEDIUM', mine:'Jharia Central Mine', location:'Surface – Control Room',
    time: new Date(Date.now()-15*60000).toISOString(),
    action:'Increase ventilation. Provide cooling water to workers.',
    icon: FiThermometer, color:'yellow',
  },
  {
    id:'s6', type:'Environment', param:'Water Seepage', unit:'L/hr', value:850, threshold:500, safe:200,
    severity:'HIGH', mine:'Raniganj Deep Mine', location:'Sump Pit – Level 2',
    time: new Date(Date.now()-6*60000).toISOString(),
    action:'Activate additional pumps. Monitor water level.',
    icon: FiDroplet, color:'orange',
  },
  {
    id:'s7', type:'Structural', param:'Roof Movement',  unit:'mm', value:4.2, threshold:3.0, safe:1.0,
    severity:'HIGH', mine:'Dhanbad East Mine', location:'Stope – Section 12',
    time: new Date(Date.now()-2*60000).toISOString(),
    action:'Evacuate roof section immediately. Timber / rock-bolt.',
    icon: FiLayers, color:'orange',
  },
  {
    id:'s8', type:'Structural', param:'Seismic Vibration', unit:'mm/s', value:6.5, threshold:5.0, safe:2.0,
    severity:'CRITICAL', mine:'Jharia Coking Coal Ltd', location:'Underground – All Sections',
    time: new Date(Date.now()-1*60000).toISOString(),
    action:'STOP all blasting. Evacuate all underground workers NOW.',
    icon: FiActivity, color:'red',
  },
];

const DEMO_WORKER_ALERTS = [
  { id:'w1', worker:'Rajan Kumar (W-4421)',  type:'SOS',          mine:'Jharia Central Mine', location:'Level 3 – Shaft B', time: new Date(Date.now()-3*60000).toISOString(),  severity:'CRITICAL', status:'Active'  },
  { id:'w2', worker:'Suresh Yadav (W-3187)', type:'Man-Down',     mine:'Raniganj Deep Mine',  location:'Face 7 – Section C',time: new Date(Date.now()-12*60000).toISOString(), severity:'CRITICAL', status:'Active'  },
  { id:'w3', worker:'Mohan Singh (W-2954)',  type:'Zone Breach',  mine:'Bokaro Steel Mine',   location:'Restricted – Zone R2',time: new Date(Date.now()-28*60000).toISOString(),severity:'MEDIUM',   status:'Acknowledged'},
];

/* ═══════════════════════════════════════════════════════════════════
   WEB AUDIO SIREN
═══════════════════════════════════════════════════════════════════ */
function useSiren() {
  const ctxRef    = useRef(null);
  const activeRef = useRef(false);
  const play = useCallback(() => {
    if (activeRef.current) return;
    try {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = ctxRef.current;
      activeRef.current = true;
      let t = ctx.currentTime;
      for (let i = 0; i < 6; i++) {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, t + i*1.2);
        osc.frequency.linearRampToValueAtTime(900, t + i*1.2 + 0.6);
        osc.frequency.linearRampToValueAtTime(300, t + i*1.2 + 1.2);
        gain.gain.setValueAtTime(0.35, t + i*1.2);
        gain.gain.setValueAtTime(0.0,  t + i*1.2 + 1.15);
        osc.start(t + i*1.2); osc.stop(t + i*1.2 + 1.2);
      }
      setTimeout(() => { activeRef.current = false; }, 7500);
    } catch {}
  }, []);
  const stop = useCallback(() => {
    try { ctxRef.current?.close(); activeRef.current = false; } catch {}
  }, []);
  return { play, stop };
}

/* ═══════════════════════════════════════════════════════════════════
   EMERGENCY OVERLAY (full-screen)
═══════════════════════════════════════════════════════════════════ */
function EmergencyOverlay({ alert, onDismiss }) {
  useEffect(() => {
    if (navigator.vibrate) navigator.vibrate([400,200,400,200,400]);
  }, []);
  if (!alert) return null;
  const evac = getEvacActions(alert.alert_type);
  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,.93)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ maxWidth:700, width:'100%', borderRadius:20, padding:'36px',
        background: alert.severity === 'CRITICAL' ? 'rgba(239,68,68,.12)' : 'rgba(249,115,22,.10)',
        border: `2px solid ${alert.severity === 'CRITICAL' ? 'rgba(239,68,68,.6)' : 'rgba(249,115,22,.5)'}`,
        animation:'kn-flash 1s ease-in-out 3' }}>
        <div className="flex items-start gap-4 mb-5">
          <span style={{ fontSize:52, lineHeight:1 }}>{TYPE_EMOJI[alert.alert_type] || '⚠️'}</span>
          <div className="flex-1">
            {alert.is_test
              ? <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-2" style={{ background:'rgba(245,158,11,.2)', border:'1px solid rgba(245,158,11,.5)' }}>
                  <span style={{ color:'#fbbf24', fontSize:11, fontWeight:700 }}>🧪 TEST DRILL — NOT A REAL EMERGENCY</span>
                </div>
              : <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-2" style={{ background:'rgba(239,68,68,.2)', border:'1px solid rgba(239,68,68,.5)' }}>
                  <span style={{ color:'#f87171', fontSize:11, fontWeight:700 }}>🚨 REAL EMERGENCY — TAKE IMMEDIATE ACTION</span>
                </div>
            }
            <h2 style={{ color:'#f1f5f9', fontWeight:900, fontSize:22, margin:0, lineHeight:1.1 }}>{alert.severity} DISASTER ALERT</h2>
            <p style={{ color:'rgba(255,255,255,.7)', fontSize:14, margin:'6px 0 0' }}>{alert.title}</p>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
          {[['Type', alert.alert_type],['Location', alert.location_name||'See details'],
            ['Time', formatDateTime(alert.alert_time)],
            ['Affected Mines', alert.affected_mines?.length ? `${alert.affected_mines.length} mine(s)` : 'Assessing…']
          ].map(([k,v]) => (
            <div key={k} style={{ padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)' }}>
              <p style={{ color:'rgba(255,255,255,.4)', fontSize:10, fontWeight:700, textTransform:'uppercase', margin:0 }}>{k}</p>
              <p style={{ color:'#f1f5f9', fontSize:13, fontWeight:700, margin:'3px 0 0' }}>{v}</p>
            </div>
          ))}
        </div>
        <div style={{ padding:16, borderRadius:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', marginBottom:20 }}>
          <p style={{ color:'#fbbf24', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', margin:'0 0 10px' }}>🚁 Immediate Emergency Actions</p>
          {evac.map((e, i) => (
            <div key={i} className="flex items-start gap-2 mb-2">
              <span style={{ color:'#f59e0b', fontWeight:900, flexShrink:0 }}>{i+1}.</span>
              <span style={{ color:'rgba(255,255,255,.8)', fontSize:13 }}>{e}</span>
            </div>
          ))}
        </div>
        <button onClick={onDismiss} style={{ width:'100%', padding:13, borderRadius:11, fontWeight:800, fontSize:14, cursor:'pointer', border:'none', background:'linear-gradient(135deg,#f59e0b,#d97706)', color:'#060e1c' }}>
          ✓ Acknowledge & Dismiss Emergency Overlay
        </button>
      </div>
      <style>{`@keyframes kn-flash{0%,100%{opacity:1}50%{opacity:.7}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EMERGENCY RESPONSE MODE PANEL
═══════════════════════════════════════════════════════════════════ */
const RESPONSE_ACTIONS = [
  { id:'evacuation',   icon:FiUsers,      label:'Start Mass Evacuation',         desc:'Alert all underground workers to evacuate via designated exits',   color:'#ef4444' },
  { id:'siren',        icon:FiVolume2,    label:'Trigger Mine Siren',            desc:'Activate emergency sirens across all mine sections',               color:'#f97316' },
  { id:'pa',           icon:FiRadio,      label:'Broadcast PA Emergency',        desc:'Send emergency voice broadcast over PA system',                    color:'#f59e0b' },
  { id:'escape_route', icon:FiNavigation, label:'Show Emergency Escape Route',   desc:'Display safest evacuation route on all mine terminals',            color:'#3b82f6' },
  { id:'machinery',    icon:FiTool,       label:'Restrict / Stop Machinery',     desc:'Emergency shutdown all heavy machinery in affected zone',          color:'#8b5cf6' },
  { id:'power',        icon:FiPower,      label:'Isolate Power (Zone)',          desc:'Cut electrical power to the affected section',                     color:'#ec4899' },
  { id:'control_room', icon:FiPhone,      label:'Notify Control Room',           desc:'Send emergency alert to the central mine control room',            color:'#06b6d4' },
  { id:'rescue',       icon:FiShield,     label:'Notify Rescue Team',            desc:'Alert Mine Rescue Team — DGMS Rescue: 1800-345-6789',             color:'#10b981' },
  { id:'zone_mark',    icon:FiMapPin,     label:'Mark Affected Zone',            desc:'Flag the disaster zone on the mine map for all operators',         color:'#f59e0b' },
];

function EmergencyResponsePanel({ alert, onClose }) {
  const [actionStatus, setActionStatus] = useState({});  // id → 'pending'|'done'
  const [confirming,   setConfirming]   = useState(null); // id being confirmed

  const execute = (id) => {
    setActionStatus(s => ({ ...s, [id]: 'pending' }));
    setConfirming(null);
    setTimeout(() => {
      setActionStatus(s => ({ ...s, [id]: 'done' }));
      const act = RESPONSE_ACTIONS.find(a => a.id === id);
      toast.success(`${act?.label} — initiated successfully`);
    }, 1400);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:8999, background:'rgba(0,0,0,.85)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px', overflowY:'auto' }}>
      <div style={{ maxWidth:760, width:'100%', borderRadius:20, overflow:'hidden', border:'2px solid rgba(239,68,68,.50)', boxShadow:'0 0 60px rgba(239,68,68,.25)' }}>
        {/* Header */}
        <div style={{ background:'rgba(239,68,68,.15)', borderBottom:'1px solid rgba(239,68,68,.3)', padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize:28 }}>🚨</span>
            <div>
              <h2 style={{ color:'#f87171', fontWeight:900, fontSize:20, margin:0 }}>EMERGENCY RESPONSE MODE</h2>
              <p style={{ color:'rgba(255,255,255,.5)', fontSize:12, margin:'3px 0 0' }}>{alert?.title || 'Active Critical Alert'}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', borderRadius:8, color:'rgba(255,255,255,.6)', cursor:'pointer', padding:'6px 12px', fontSize:12, fontWeight:700 }}>
            CLOSE RESPONSE MODE
          </button>
        </div>

        {/* Simulated-hardware disclaimer */}
        <div style={{ background:'rgba(245,158,11,.10)', borderBottom:'1px solid rgba(245,158,11,.25)', padding:'10px 24px' }}>
          <p style={{ color:'#fbbf24', fontSize:11, fontWeight:700, margin:0 }}>
            ⚠ DEMO / SIMULATED RESPONSE — Actions below simulate hardware integration. In a live deployment, these buttons will trigger real siren controllers, PA systems, power isolation relays and rescue-team SMS gateways.
          </p>
        </div>

        {/* Action grid */}
        <div style={{ background:'rgba(15,23,42,.92)', padding:'20px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:12 }}>
            {RESPONSE_ACTIONS.map(action => {
              const Icon   = action.icon;
              const status = actionStatus[action.id];
              const isDone = status === 'done';
              const isPending = status === 'pending';
              const isConfirming = confirming === action.id;
              return (
                <div key={action.id} style={{
                  borderRadius:12, border:`1px solid ${isDone ? 'rgba(34,197,94,.4)' : 'rgba(255,255,255,.10)'}`,
                  background: isDone ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.04)',
                  padding:'14px 16px', transition:'all .2s',
                }}>
                  <div className="flex items-start gap-3">
                    <div style={{ width:36, height:36, borderRadius:10, background:`${action.color}22`, border:`1px solid ${action.color}44`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {isDone
                        ? <FiCheck size={16} style={{ color:'#4ade80' }}/>
                        : <Icon size={16} style={{ color:action.color }}/>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ color: isDone ? '#4ade80' : '#f1f5f9', fontWeight:700, fontSize:13, margin:0 }}>{action.label}</p>
                      <p style={{ color:'rgba(255,255,255,.4)', fontSize:11, margin:'3px 0 8px', lineHeight:1.4 }}>{action.desc}</p>
                      {!isConfirming && !isDone && !isPending && (
                        <button onClick={() => setConfirming(action.id)}
                          style={{ padding:'5px 14px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', background:`${action.color}22`, border:`1px solid ${action.color}55`, color:action.color }}>
                          ACTIVATE →
                        </button>
                      )}
                      {isConfirming && (
                        <div className="flex gap-2">
                          <button onClick={() => execute(action.id)}
                            style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer', background:'rgba(239,68,68,.2)', border:'1px solid rgba(239,68,68,.5)', color:'#f87171' }}>
                            CONFIRM
                          </button>
                          <button onClick={() => setConfirming(null)}
                            style={{ padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', background:'transparent', border:'1px solid rgba(255,255,255,.15)', color:'rgba(255,255,255,.5)' }}>
                            Cancel
                          </button>
                        </div>
                      )}
                      {isPending && (
                        <div className="flex items-center gap-2">
                          <div style={{ width:14, height:14, border:'2px solid rgba(255,255,255,.2)', borderTopColor:'#f59e0b', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
                          <span style={{ color:'#fbbf24', fontSize:11, fontWeight:700 }}>Activating…</span>
                        </div>
                      )}
                      {isDone && (
                        <span style={{ color:'#4ade80', fontSize:11, fontWeight:700 }}>✓ Initiated</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Escape-route map note */}
          <div style={{ marginTop:16, padding:'12px 16px', borderRadius:12, background:'rgba(59,130,246,.08)', border:'1px solid rgba(59,130,246,.25)' }}>
            <div className="flex items-start gap-3">
              <FiNavigation size={14} style={{ color:'#60a5fa', flexShrink:0, marginTop:2 }}/>
              <div>
                <p style={{ color:'#93c5fd', fontWeight:700, fontSize:12, margin:0 }}>Evacuation & Escape Routing</p>
                <p style={{ color:'rgba(255,255,255,.45)', fontSize:11, margin:'4px 0 8px', lineHeight:1.5 }}>
                  Live worker location tracking is <strong style={{ color:'rgba(255,255,255,.6)' }}>unavailable</strong> in this prototype — no GPS tracking devices are connected. Emergency escape routes use pre-loaded mine plan data. To view the mine map with designated escape routes, use the Mines &amp; GIS module.
                </p>
                <Link to="/mines" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700, background:'rgba(59,130,246,.15)', border:'1px solid rgba(59,130,246,.35)', color:'#60a5fa', textDecoration:'none' }}>
                  <FiNavigation size={11}/> Open Mine Map &amp; GIS
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SENSOR CARD (Gas / Environment / Structural)
═══════════════════════════════════════════════════════════════════ */
function SensorCard({ sensor }) {
  const sev  = SEV_CFG[sensor.severity] || SEV_CFG.LOW;
  const Icon = sensor.icon;
  const pct  = Math.min(100, Math.round((sensor.value / (sensor.threshold * 1.5)) * 100));
  return (
    <div style={{ backgroundColor:'var(--bg-card)', border:`1px solid ${sev.border}`, borderRadius:14, padding:'14px 16px', background:`linear-gradient(135deg, var(--bg-card), ${sev.bg})` }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div style={{ width:32, height:32, borderRadius:8, background:sev.bg, border:`1px solid ${sev.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Icon size={14} className={sev.textDark}/>
          </div>
          <div>
            <p className="text-xs font-bold" style={{ color:'var(--text-primary)' }}>{sensor.param}</p>
            <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{sensor.type}</p>
          </div>
        </div>
        <Badge color={sev.badge}>{sensor.severity}</Badge>
      </div>
      {/* Reading */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <span style={{ fontSize:24, fontWeight:900, color:'var(--text-primary)' }}>{sensor.value}</span>
          <span className="text-xs ml-1" style={{ color:'var(--text-muted)' }}>{sensor.unit}</span>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Safe: <strong>{sensor.safe} {sensor.unit}</strong></p>
          <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>Limit: <strong>{sensor.threshold} {sensor.unit}</strong></p>
        </div>
      </div>
      {/* Bar */}
      <div style={{ height:5, borderRadius:999, background:'var(--border)', overflow:'hidden', marginBottom:10 }}>
        <div style={{ height:'100%', width:`${pct}%`, borderRadius:999, background: sensor.severity==='CRITICAL'?'#ef4444': sensor.severity==='HIGH'?'#f97316':'#f59e0b', transition:'width .5s' }}/>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold" style={{ color:'var(--text-secondary)' }}>{sensor.mine}</p>
          <p className="text-[10px]" style={{ color:'var(--text-muted)' }}>{sensor.location} · {timeAgo(sensor.time)}</p>
        </div>
        {sensor.severity !== 'LOW' && (
          <div style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:sev.bg, border:`1px solid ${sev.border}`, color:'var(--text-secondary)', flexShrink:0 }}>
            ACTION NEEDED
          </div>
        )}
      </div>
      <div style={{ marginTop:8, padding:'7px 10px', borderRadius:8, background:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
        <p className="text-[10px]" style={{ color:'var(--text-secondary)' }}>⚡ {sensor.action}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ALERT CARD (from real API data)
═══════════════════════════════════════════════════════════════════ */
function AlertCard({ alert, onAcknowledge, onResolve, onViewDetails }) {
  const sev = SEV_CFG[alert.severity] || SEV_CFG.LOW;
  return (
    <div style={{ backgroundColor:'var(--bg-card)', border:`1px solid ${sev.border}`, borderRadius:14, padding:'14px 16px', transition:'all .15s', background:`linear-gradient(135deg, var(--bg-card), ${sev.bg})` }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow=''}>
      {/* Top row */}
      <div className="flex items-start gap-3 mb-3">
        <span style={{ fontSize:28, lineHeight:1, flexShrink:0 }}>{TYPE_EMOJI[alert.alert_type] || '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {alert.is_test && (
              <span style={{ padding:'1px 8px', borderRadius:999, fontSize:10, fontWeight:800, background:'rgba(245,158,11,.15)', color:'#d97706', border:'1px solid rgba(245,158,11,.3)' }}>🧪 DRILL</span>
            )}
            <Badge color={sev.badge}>{alert.severity}</Badge>
            <span className="text-[11px]" style={{ color:'var(--text-muted)' }}>{alert.alert_type}</span>
            {sev.pulse && alert.status === 'active' && (
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#ef4444', display:'inline-block', animation:'kn-pulse-dot 1.2s infinite' }}/>
            )}
          </div>
          <p className="text-sm font-bold leading-snug" style={{ color:'var(--text-primary)' }}>{alert.title}</p>
        </div>
        {/* Status chip */}
        <div style={{ flexShrink:0 }}>
          <Badge color={alert.status==='resolved'?'green':alert.status==='acknowledged'?'blue':'red'} dot>
            {alert.status}
          </Badge>
        </div>
      </div>
      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mb-2" style={{ color:'var(--text-muted)' }}>
        {alert.location_name && <span className="flex items-center gap-1"><FiMapPin size={10}/>{alert.location_name}</span>}
        <span className="flex items-center gap-1"><FiClock size={10}/>{timeAgo(alert.alert_time)}</span>
        <span className="flex items-center gap-1"><FiDatabase size={10}/>{alert.source}</span>
        {alert.magnitude && <span className="flex items-center gap-1"><FiActivity size={10}/>M{parseFloat(alert.magnitude).toFixed(1)}</span>}
      </div>
      {/* Affected mines */}
      {alert.affected_mines?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {alert.affected_mines.slice(0,3).map((m,i) => (
            <span key={i} style={{ padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:600, background:'var(--accent-bg)', color:'var(--accent)', border:'1px solid var(--accent-border)' }}>
              {m.name}{m.distance ? ` · ${m.distance}km` : ''}
            </span>
          ))}
          {alert.affected_mines.length > 3 && <span style={{ fontSize:10, color:'var(--text-muted)' }}>+{alert.affected_mines.length-3} more</span>}
        </div>
      )}
      {/* Action row */}
      <div className="flex gap-2">
        <button onClick={() => onViewDetails(alert)} className="btn-outline btn-xs flex-1 justify-center">
          <FiInfo size={11}/> Details
        </button>
        {alert.status === 'active' && (
          <button onClick={() => onAcknowledge(alert.id)} className="btn-xs flex-1 justify-center"
            style={{ background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.3)', color:'var(--accent)', fontWeight:700, borderRadius:8, fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', gap:4, cursor:'pointer' }}>
            <FiCheckCircle size={11}/> Acknowledge
          </button>
        )}
        {['active','acknowledged'].includes(alert.status) && (
          <button onClick={() => onResolve(alert.id)} className="btn-xs flex-1 justify-center"
            style={{ background:'rgba(34,197,94,.10)', border:'1px solid rgba(34,197,94,.3)', color:'#16a34a', fontWeight:700, borderRadius:8, fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', gap:4, cursor:'pointer' }}>
            <FiXCircle size={11}/> Resolve
          </button>
        )}
      </div>
      <style>{`@keyframes kn-pulse-dot{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ALERT DETAIL MODAL
═══════════════════════════════════════════════════════════════════ */
function AlertDetailModal({ alert, onClose, onAcknowledge, onResolve }) {
  if (!alert) return null;
  const sev  = SEV_CFG[alert.severity] || SEV_CFG.LOW;
  const evac = getEvacActions(alert.alert_type);

  const TIMELINE = [
    { label:'Alert Triggered',     time: alert.alert_time,        done: true  },
    { label:'Notification Sent',   time: alert.alert_time,        done: true  },
    { label:'Acknowledged',        time: alert.acknowledged_at,   done: !!alert.acknowledged_at },
    { label:'Response Initiated',  time: alert.acknowledged_at,   done: !!alert.acknowledged_at },
    { label:'Resolved',            time: alert.resolved_at,       done: !!alert.resolved_at  },
  ];

  return (
    <Modal isOpen={!!alert} onClose={onClose} title="Alert Details" size="lg">
      <div className="space-y-5">
        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          <Badge color={sev.badge}>{alert.severity}</Badge>
          <Badge color={alert.status==='resolved'?'green':alert.status==='acknowledged'?'blue':'red'} dot>{alert.status}</Badge>
          {alert.is_test && <span style={{ padding:'2px 10px', borderRadius:999, fontSize:10, fontWeight:800, background:'rgba(245,158,11,.15)', color:'#d97706', border:'1px solid rgba(245,158,11,.3)' }}>🧪 TEST DRILL</span>}
        </div>

        {/* Title + description */}
        <div style={{ padding:'14px 16px', borderRadius:12, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
          <p className="font-bold text-base mb-1" style={{ color:'var(--text-primary)' }}>{alert.title}</p>
          {alert.description && <p className="text-sm leading-relaxed" style={{ color:'var(--text-secondary)' }}>{alert.description}</p>}
        </div>

        {/* Key details grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['Alert Type',   alert.alert_type],
            ['Source',       alert.source],
            ['Location',     alert.location_name || '—'],
            ['Alert Time',   formatDateTime(alert.alert_time)],
            ['Coordinates',  alert.latitude ? `${parseFloat(alert.latitude).toFixed(4)}°N, ${parseFloat(alert.longitude).toFixed(4)}°E` : '—'],
            ['Magnitude',    alert.magnitude  ? `M${parseFloat(alert.magnitude).toFixed(1)}`              : '—'],
            ['Wind Speed',   alert.wind_speed ? `${parseFloat(alert.wind_speed).toFixed(0)} km/h`         : '—'],
            ['Rainfall',     alert.rainfall   ? `${parseFloat(alert.rainfall).toFixed(0)} mm`             : '—'],
            ['Resolution',   alert.resolution_notes || '—'],
          ].filter(([,v]) => v !== '—').map(([k,v]) => (
            <div key={k} style={{ padding:'10px 12px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
              <p style={{ color:'var(--text-muted)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 4px' }}>{k}</p>
              <p style={{ color:'var(--text-primary)', fontSize:13, fontWeight:600, margin:0 }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Sensor data (real fields only) */}
        <div style={{ padding:'12px 14px', borderRadius:12, backgroundColor:'var(--blue-bg)', border:'1px solid var(--blue-border)' }}>
          <p style={{ color:'var(--blue)', fontSize:11, fontWeight:700, textTransform:'uppercase', margin:'0 0 8px' }}>
            <FiDatabase size={11} style={{ display:'inline', marginRight:4 }}/>Sensor / Source Data
          </p>
          <p style={{ color:'var(--text-secondary)', fontSize:12, margin:0 }}>
            Data source: <strong>{alert.source}</strong>
            {alert.magnitude && <> · Magnitude: <strong>M{parseFloat(alert.magnitude).toFixed(1)}</strong></>}
            {alert.wind_speed && <> · Wind: <strong>{parseFloat(alert.wind_speed).toFixed(0)} km/h</strong></>}
            {alert.rainfall   && <> · Rainfall: <strong>{parseFloat(alert.rainfall).toFixed(0)} mm</strong></>}
          </p>
          <p style={{ color:'var(--text-muted)', fontSize:11, margin:'6px 0 0' }}>
            Worker tracking data: <strong>Live tracking unavailable</strong> — no IoT wearable devices connected in this prototype. Affected workers will be listed when live tracking is integrated.
          </p>
        </div>

        {/* Affected mines */}
        {alert.affected_mines?.length > 0 && (
          <div>
            <p style={{ color:'var(--text-muted)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 8px' }}>Affected Mines ({alert.affected_mines.length})</p>
            <div className="flex flex-wrap gap-2">
              {alert.affected_mines.map((m,i) => (
                <span key={i} style={{ padding:'4px 12px', borderRadius:999, fontSize:12, fontWeight:600, background:'rgba(239,68,68,.10)', color:'#dc2626', border:'1px solid rgba(239,68,68,.25)' }}>
                  {m.name}{m.distance ? ` — ${m.distance}km` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Response timeline */}
        <div>
          <p style={{ color:'var(--text-muted)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 12px' }}>Response Timeline</p>
          <div className="space-y-2">
            {TIMELINE.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  background: step.done ? 'rgba(34,197,94,.15)' : 'var(--bg-card-hover)',
                  border: `1px solid ${step.done ? 'rgba(34,197,94,.4)' : 'var(--border)'}` }}>
                  {step.done ? <FiCheck size={10} style={{ color:'#16a34a' }}/> : <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--border)', display:'block' }}/>}
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <span style={{ fontSize:12, fontWeight: step.done ? 600 : 400, color: step.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>{step.label}</span>
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>{step.time ? formatDateTime(step.time) : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended actions */}
        <div>
          <p style={{ color:'var(--text-muted)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 8px' }}>Recommended Emergency Actions</p>
          <div className="space-y-2">
            {evac.map((e,i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl" style={{ background:'var(--accent-bg)', border:'1px solid var(--accent-border)' }}>
                <span style={{ color:'var(--accent)', fontWeight:900, flexShrink:0, fontSize:12, minWidth:16 }}>{i+1}.</span>
                <span style={{ color:'var(--text-secondary)', fontSize:12, lineHeight:1.5 }}>{e}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        {['active','acknowledged'].includes(alert.status) && (
          <div className="flex gap-3 pt-3" style={{ borderTop:'1px solid var(--border)' }}>
            {alert.status === 'active' && (
              <button onClick={() => { onAcknowledge(alert.id); onClose(); }} className="btn-primary btn-sm flex-1 justify-center">
                <FiCheckCircle size={13}/> Acknowledge Alert
              </button>
            )}
            <button onClick={() => { onResolve(alert.id); onClose(); }} className="btn-success btn-sm flex-1 justify-center">
              <FiCheckSquare size={13}/> Mark Resolved
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   WORKER SAFETY PANEL
═══════════════════════════════════════════════════════════════════ */
function WorkerSafetyPanel() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div style={{ padding:'2px 10px', borderRadius:999, fontSize:10, fontWeight:800, background:'rgba(245,158,11,.12)', color:'#d97706', border:'1px solid rgba(245,158,11,.3)' }}>
          ⚠ DEMO / SIMULATED DATA
        </div>
        <p className="text-xs" style={{ color:'var(--text-muted)' }}>Live worker tracking requires IoT wearable devices</p>
      </div>
      <div className="space-y-3">
        {DEMO_WORKER_ALERTS.map(w => {
          const sev = SEV_CFG[w.severity] || SEV_CFG.MEDIUM;
          return (
            <div key={w.id} style={{ backgroundColor:'var(--bg-card)', border:`1px solid ${sev.border}`, borderRadius:12, padding:'12px 14px', background:`linear-gradient(135deg,var(--bg-card),${sev.bg})` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div style={{ width:36, height:36, borderRadius:999, background:sev.bg, border:`1px solid ${sev.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>
                    {w.type === 'SOS' ? '🆘' : w.type === 'Man-Down' ? '🚨' : '⚠️'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge color={sev.badge}>{w.severity}</Badge>
                      <span className="text-[11px] font-bold" style={{ color:'var(--text-primary)' }}>{w.type}</span>
                    </div>
                    <p className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{w.worker}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] mt-1" style={{ color:'var(--text-muted)' }}>
                      <span className="flex items-center gap-1"><FiMapPin size={10}/>{w.mine}</span>
                      <span className="flex items-center gap-1"><FiNavigation size={10}/>{w.location}</span>
                      <span className="flex items-center gap-1"><FiClock size={10}/>{timeAgo(w.time)}</span>
                    </div>
                  </div>
                </div>
                <Badge color={w.status==='Active'?'red':'blue'} dot>{w.status}</Badge>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop:12, padding:'10px 14px', borderRadius:10, background:'var(--blue-bg)', border:'1px solid var(--blue-border)' }}>
        <p style={{ color:'var(--blue)', fontSize:11, fontWeight:600, margin:0 }}>
          <FiInfo size={11} style={{ display:'inline', marginRight:4 }}/>
          Worker locations above are <strong>simulated for demonstration</strong>. A real deployment requires Smart Helmet SOS modules, RFID/UWB tags, and an IoT gateway connected to this system via the sensor API endpoint.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CONTROL ROOM LOG (History Tab)
═══════════════════════════════════════════════════════════════════ */
const STATUS_MAP = {
  active:             { label:'Active',             badge:'red'    },
  acknowledged:       { label:'Acknowledged',       badge:'blue'   },
  response_initiated: { label:'Response Initiated', badge:'orange' },
  evacuation:         { label:'Evacuation',         badge:'purple' },
  resolved:           { label:'Resolved',           badge:'green'  },
};
function getStatusBadge(status) {
  return STATUS_MAP[status] || { label: status, badge:'gray' };
}

function ControlRoomLog({ history, loading }) {
  const [search, setSearch]   = useState('');
  const [sevFilter, setSev]   = useState('all');

  const filtered = history.filter(a => {
    const q = search.toLowerCase();
    const matchQ = !q || a.title?.toLowerCase().includes(q) || a.alert_type?.toLowerCase().includes(q) || a.location_name?.toLowerCase().includes(q);
    const matchS = sevFilter === 'all' || a.severity === sevFilter;
    return matchQ && matchS;
  });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search alerts, mine, location…"
            className="input" style={{ paddingLeft:32, fontSize:12 }}/>
        </div>
        <select value={sevFilter} onChange={e => setSev(e.target.value)} className="select" style={{ width:'auto', fontSize:12 }}>
          <option value="all">All Severities</option>
          {['CRITICAL','HIGH','MEDIUM','LOW'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Alert ID</th>
              <th>Type</th>
              <th>Mine / Location</th>
              <th>Severity</th>
              <th>Source</th>
              <th>Triggered</th>
              <th>Acknowledged By</th>
              <th>Resolved</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} style={{ textAlign:'center', padding:'32px', color:'var(--text-muted)', fontSize:13 }}>Loading log…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign:'center', padding:'32px', color:'var(--text-muted)', fontSize:13 }}>No alerts match your filters</td></tr>
            )}
            {!loading && filtered.map(a => {
              const sb = getStatusBadge(a.status);
              const sev = SEV_CFG[a.severity] || SEV_CFG.LOW;
              return (
                <tr key={a.id}>
                  <td>
                    <span style={{ fontFamily:'monospace', fontSize:10, color:'var(--text-muted)', background:'var(--bg-card-hover)', padding:'2px 6px', borderRadius:4 }}>
                      {a.id?.slice(0,8).toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontSize:15 }}>{TYPE_EMOJI[a.alert_type]||'⚠️'}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>{a.alert_type}</span>
                      {a.is_test && <span style={{ fontSize:10, color:'#d97706', fontWeight:700 }}>TEST</span>}
                    </div>
                  </td>
                  <td>
                    <p style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', margin:0 }}>{a.affected_mines?.[0]?.name || '—'}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)', margin:'1px 0 0' }}>{a.location_name||'—'}</p>
                  </td>
                  <td><Badge color={sev.badge}>{a.severity}</Badge></td>
                  <td><span style={{ fontSize:11, color:'var(--text-muted)' }}>{a.source?.split('/')[0]?.trim()}</span></td>
                  <td><span style={{ fontSize:11, color:'var(--text-muted)' }}>{formatDateTime(a.alert_time)}</span></td>
                  <td><span style={{ fontSize:11, color:'var(--text-secondary)' }}>{a.acknowledged_by_name || '—'}</span></td>
                  <td><span style={{ fontSize:11, color:'var(--text-muted)' }}>{a.resolved_at ? formatDateTime(a.resolved_at) : '—'}</span></td>
                  <td><Badge color={sb.badge} dot>{sb.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize:11, color:'var(--text-muted)' }}>Showing {filtered.length} of {history.length} records (last 7 days)</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STATS PANEL
═══════════════════════════════════════════════════════════════════ */
function StatsPanel({ stats }) {
  if (!stats) return <div style={{ padding:'48px', textAlign:'center', color:'var(--text-muted)' }}>No statistics available yet</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="card">
        <h3 className="section-title">By Severity</h3>
        <div className="space-y-2">
          {(stats.by_severity||[]).map(s => {
            const sev = SEV_CFG[s.severity] || SEV_CFG.LOW;
            return (
              <div key={s.severity} className="flex items-center justify-between py-2" style={{ borderBottom:'1px solid var(--border)' }}>
                <Badge color={sev.badge}>{s.severity}</Badge>
                <span style={{ fontWeight:800, fontSize:18, color:'var(--text-primary)' }}>{s.count}</span>
              </div>
            );
          })}
          {!stats.by_severity?.length && <p style={{ color:'var(--text-muted)', fontSize:13 }}>No data</p>}
        </div>
      </div>
      <div className="card">
        <h3 className="section-title">By Alert Type</h3>
        <div className="space-y-2">
          {(stats.by_type||[]).map(t => (
            <div key={t.alert_type} className="flex items-center justify-between py-2" style={{ borderBottom:'1px solid var(--border)' }}>
              <span className="text-sm" style={{ color:'var(--text-secondary)' }}>{TYPE_EMOJI[t.alert_type]||'⚠️'} {t.alert_type}</span>
              <span style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)' }}>{t.count}</span>
            </div>
          ))}
          {!stats.by_type?.length && <p style={{ color:'var(--text-muted)', fontSize:13 }}>No data</p>}
        </div>
      </div>
      <div className="card">
        <h3 className="section-title">By Status</h3>
        <div className="space-y-2">
          {(stats.by_status||[]).map(s => {
            const sb = getStatusBadge(s.status);
            return (
              <div key={s.status} className="flex items-center justify-between py-2" style={{ borderBottom:'1px solid var(--border)' }}>
                <Badge color={sb.badge} dot>{sb.label}</Badge>
                <span style={{ fontWeight:800, fontSize:18, color:'var(--text-primary)' }}>{s.count}</span>
              </div>
            );
          })}
          {!stats.by_status?.length && <p style={{ color:'var(--text-muted)', fontSize:13 }}>No data</p>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE MANUAL ALERT MODAL
═══════════════════════════════════════════════════════════════════ */
const ALERT_TYPES = [
  'Gas Leak','Fire','Flood','Earthquake','Roof Collapse','Seismic',
  'Thunderstorm','Heavy Rainfall','Worker SOS','Machinery Failure',
  'Oxygen Deficiency','High Temperature','Explosion Risk','Other',
];

function CreateAlertModal({ onSubmit, onClose, availableMines = [] }) {
  const [form, setForm] = useState({
    alert_type:'Gas Leak', title:'', description:'', severity:'HIGH',
    mine_id:'', zone:'', location_name:'', sensor_value:'', sensor_unit:'', threshold_val:'',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]:v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { alert('Title is required'); return; }
    setSaving(true);
    try { await onSubmit(form); }
    finally { setSaving(false); }
  };

  const SEV_OPTIONS = [
    { value:'CRITICAL', label:'🔴 CRITICAL — Immediate evacuation required' },
    { value:'HIGH',     label:'🟠 HIGH — Urgent action needed' },
    { value:'MEDIUM',   label:'🟡 MEDIUM — Monitor closely' },
    { value:'LOW',      label:'🟢 LOW — Informational' },
  ];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(0,0,0,.8)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ maxWidth:600, width:'100%', borderRadius:18, overflow:'hidden',
        background:'var(--bg-card)', border:'2px solid rgba(239,68,68,.35)', boxShadow:'0 0 40px rgba(239,68,68,.2)' }}>
        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', background:'rgba(239,68,68,.08)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize:24 }}>🚨</span>
            <div>
              <h2 style={{ color:'var(--text-primary)', fontWeight:900, fontSize:18, margin:0 }}>Create Emergency Alert</h2>
              <p style={{ color:'var(--text-muted)', fontSize:12, margin:'2px 0 0' }}>Alert will be immediately visible to all mine officials</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-muted)', cursor:'pointer', padding:'6px 10px', fontSize:13 }}>✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding:'20px 24px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {/* Alert Type */}
            <div className="form-group mb-0 col-span-2">
              <label className="label">Alert Type *</label>
              <select value={form.alert_type} onChange={e => set('alert_type', e.target.value)} className="select">
                {ALERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Severity */}
            <div className="form-group mb-0 col-span-2">
              <label className="label">Severity *</label>
              <select value={form.severity} onChange={e => set('severity', e.target.value)} className="select"
                style={{ fontWeight:700, color: form.severity==='CRITICAL'?'#dc2626':form.severity==='HIGH'?'#ea580c':form.severity==='MEDIUM'?'#d97706':'#16a34a' }}>
                {SEV_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Title */}
            <div className="form-group mb-0 col-span-2">
              <label className="label">Alert Title *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} required
                className="input" placeholder="e.g. High Methane Level — Underground Section A"/>
            </div>

            {/* Mine + Zone */}
            <div className="form-group mb-0">
              <label className="label">Mine</label>
              <select value={form.mine_id} onChange={e => set('mine_id', e.target.value)} className="select">
                <option value="">All / General</option>
                {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="label">Zone / Section</label>
              <input value={form.zone} onChange={e => set('zone', e.target.value)} className="input" placeholder="Underground Level 3"/>
            </div>

            {/* Sensor value */}
            <div className="form-group mb-0">
              <label className="label">Detected Value</label>
              <input type="number" step="any" value={form.sensor_value} onChange={e => set('sensor_value', e.target.value)} className="input" placeholder="2.5"/>
            </div>
            <div className="form-group mb-0">
              <label className="label">Unit / Threshold</label>
              <div className="flex gap-2">
                <input value={form.sensor_unit} onChange={e => set('sensor_unit', e.target.value)} className="input" placeholder="%" style={{ width:'40%' }}/>
                <input type="number" step="any" value={form.threshold_val} onChange={e => set('threshold_val', e.target.value)} className="input" placeholder="0.5 (limit)" style={{ width:'60%' }}/>
              </div>
            </div>

            {/* Description */}
            <div className="form-group mb-0 col-span-2">
              <label className="label">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
                className="input resize-none" placeholder="Additional details about the alert…"/>
            </div>
          </div>

          {/* Severity warning */}
          {form.severity === 'CRITICAL' && (
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:10, background:'rgba(239,68,68,.10)', border:'1px solid rgba(239,68,68,.3)' }}>
              <p style={{ color:'#f87171', fontSize:12, fontWeight:700, margin:0 }}>
                ⚠ CRITICAL alert will trigger emergency overlay and alarm for all active users. Use only for genuine emergencies.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3" style={{ marginTop:18, paddingTop:14, borderTop:'1px solid var(--border)' }}>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving}
              style={{ padding:'8px 20px', borderRadius:10, fontWeight:800, fontSize:13, cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1,
                background: form.severity==='CRITICAL'?'rgba(239,68,68,.8)':'rgba(249,115,22,.7)',
                color:'white', border:'none', display:'flex', alignItems:'center', gap:6 }}>
              {saving ? '⏳ Creating…' : `🚨 Create ${form.severity} Alert`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function DisasterAlerts() {
  const { user } = useAuthStore();

  /* ── Data state ──────────────────────────────────────── */
  const [active,      setActive]      = useState([]);
  const [history,     setHistory]     = useState([]);
  const [stats,       setStats]       = useState(null);
  const [summary,     setSummary]     = useState({});
  const [loading,     setLoading]     = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [polling,     setPolling]     = useState(false);
  const [testing,     setTesting]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  /* ── UI state ────────────────────────────────────────── */
  const [tab,          setTab]          = useState('overview');
  const [categoryFilter,setCategoryFilter] = useState('all');
  const [search,       setSearch]       = useState('');
  const [sevFilter,    setSevFilter]    = useState('all');
  const [viewAlert,    setViewAlert]    = useState(null);
  const [emergency,    setEmergency]    = useState(null);
  const [sirenOn,      setSirenOn]      = useState(true);
  const [showResponse, setShowResponse] = useState(false);
  const [responseAlert,setResponseAlert]= useState(null);
  const [sensorTab,    setSensorTab]    = useState('gas');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const siren          = useSiren();
  const prevCritical   = useRef(0);

  /* ── Data loading ────────────────────────────────────── */
  const loadActive = useCallback(async () => {
    try {
      const r = await disasterApi.getActive();
      const data = r.data || [];
      setActive(data);
      setSummary(r.summary || {});
      setLastUpdated(new Date());
      // Emergency trigger for new critical alerts
      const criticalNow = data.filter(a => ['CRITICAL','HIGH'].includes(a.severity) && a.status === 'active');
      if (criticalNow.length > prevCritical.current) {
        const newest = criticalNow[0];
        setEmergency(newest);
        if (sirenOn) siren.play();
        if (Notification.permission === 'granted') {
          new Notification(`🚨 ${newest.severity} DISASTER ALERT`, { body: newest.title, icon:'/favicon.svg', requireInteraction:true });
        }
      }
      prevCritical.current = criticalNow.length;
    } catch (e) { console.warn('[Disaster] loadActive error:', e.message); }
  }, [sirenOn]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try { const r = await disasterApi.getHistory({ days:7, limit:100 }); setHistory(r.data || []); }
    catch {}
    finally { setHistLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try { const r = await disasterApi.getStats(); setStats(r.data); }
    catch {}
  }, []);

  useEffect(() => {
    if (Notification.permission === 'default') Notification.requestPermission();
    Promise.all([loadActive(), loadHistory(), loadStats()]).finally(() => setLoading(false));
    const interval = setInterval(loadActive, 60000);
    return () => clearInterval(interval);
  }, []);

  /* ── Handlers ────────────────────────────────────────── */
  const handleAcknowledge = async (id) => {
    try { await disasterApi.acknowledge(id); toast.success('Alert acknowledged'); loadActive(); loadHistory(); }
    catch { toast.error('Failed to acknowledge'); }
  };

  const handleResolve = async (id) => {
    try { await disasterApi.resolve(id, { resolution_notes:'Resolved via dashboard' }); toast.success('Alert resolved'); loadActive(); loadHistory(); }
    catch { toast.error('Failed to resolve'); }
  };

  const handlePollNow = async () => {
    setPolling(true);
    try {
      const r = await disasterApi.pollNow();
      const d = r.data;
      toast.success(`Sources checked: +${d.earthquakes} earthquakes, +${d.weather} weather alerts`);
      loadActive(); loadHistory();
    } catch { toast.error('Poll failed'); }
    finally { setPolling(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await disasterApi.createTest();
      toast('🧪 TEST alert created — for demonstration only', { icon:'🔔', duration:4000 });
      await loadActive();
      const r = await disasterApi.getActive();
      const testAlert = (r.data||[]).find(a => a.is_test && a.status==='active');
      if (testAlert) { setEmergency(testAlert); if (sirenOn) siren.play(); }
    } catch { toast.error('Test failed'); }
    finally { setTesting(false); }
  };

  /* Manual alert creation */
  const handleManualCreate = async (formData) => {
    try {
      const r = await disasterApi.createManual(formData);
      toast.success(`Alert created: ${formData.severity} — ${formData.alert_type}`);
      setShowCreateModal(false);
      await loadActive(); await loadHistory();
      // If CRITICAL, show emergency overlay
      if (formData.severity === 'CRITICAL') {
        const newAlert = r.data;
        if (newAlert) { setEmergency(newAlert); if (sirenOn) siren.play(); }
      }
    } catch (e) {
      const msg = e?.response?.data?.message || 'Failed to create alert';
      if (e?.response?.status === 409) toast.error(`Duplicate: ${msg}`);
      else toast.error(msg);
    }
  };

  const openResponseMode = (alert) => { setResponseAlert(alert); setShowResponse(true); };

  /* ── Derived values ──────────────────────────────────── */
  const criticalCount  = active.filter(a => a.severity === 'CRITICAL' && a.status === 'active').length;
  const warningCount   = active.filter(a => a.severity === 'HIGH'     && a.status === 'active').length;
  const resolvedCount  = history.filter(a => a.status === 'resolved').length;
  const affectedMines  = new Set(active.flatMap(a => (a.affected_mines||[]).map(m=>m.id))).size;
  const workersAtRisk  = criticalCount > 0 ? '⚠ Alert' : '—';

  const filteredActive = active.filter(a => {
    const matchCat = matchCategory(a, categoryFilter);
    const matchQ   = !search || a.title?.toLowerCase().includes(search.toLowerCase()) || a.alert_type?.toLowerCase().includes(search.toLowerCase());
    const matchSev = sevFilter === 'all' || a.severity === sevFilter;
    return matchCat && matchQ && matchSev;
  });

  const TABS = [
    { id:'overview', label:'Overview'           },
    { id:'sensors',  label:'Sensor Monitoring'  },
    { id:'workers',  label:'Worker Safety'      },
    { id:'log',      label:'Control Room Log'   },
    { id:'stats',    label:'Statistics'         },
  ];

  if (loading) return <PageLoader message="Loading disaster management system…"/>;

  return (
    <div className="space-y-5">
      <BackButton/>

      {/* ── Emergency overlay ──────────────────────────── */}
      {emergency && (
        <EmergencyOverlay alert={emergency} onDismiss={() => {
          siren.stop(); handleAcknowledge(emergency.id); setEmergency(null);
        }}/>
      )}
      {/* ── Emergency response panel ─────────────────── */}
      {showResponse && (
        <EmergencyResponsePanel alert={responseAlert} onClose={() => setShowResponse(false)}/>
      )}

      {/* ══════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiAlertTriangle style={{ color:'#ef4444' }}/>
            Mine Disaster &amp; Emergency Alert System
            {(criticalCount > 0 || warningCount > 0) && (
              <span style={{ padding:'2px 10px', borderRadius:999, fontSize:12, fontWeight:800, background:'rgba(239,68,68,.12)', color:'#dc2626', border:'1px solid rgba(239,68,68,.3)', animation:'kn-pulse-dot 1.2s infinite' }}>
                {criticalCount + warningCount} ACTIVE
              </span>
            )}
          </h1>
          <p className="page-subtitle">
            Real-time earthquake, weather &amp; mine safety monitoring — USGS · Open-Meteo · Sensor IoT
            {lastUpdated && <span style={{ color:'var(--text-muted)', marginLeft:8 }}>· Updated {timeAgo(lastUpdated)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSirenOn(v => !v)} className={clsx('btn-outline btn-sm', !sirenOn && 'opacity-50')}>
            {sirenOn ? <FiVolume2 size={13}/> : <FiVolumeX size={13}/>}
            {sirenOn ? 'Siren ON' : 'Siren OFF'}
          </button>
          <button onClick={handlePollNow} disabled={polling} className="btn-outline btn-sm">
            <FiRefreshCw size={13} className={polling ? 'animate-spin' : ''}/>
            {polling ? 'Checking…' : 'Check Now'}
          </button>
          {criticalCount > 0 && (
            <button onClick={() => openResponseMode(active.find(a=>a.severity==='CRITICAL'&&a.status==='active'))}
              style={{ padding:'6px 14px', borderRadius:10, fontSize:12, fontWeight:800, cursor:'pointer', background:'rgba(239,68,68,.15)', color:'#dc2626', border:'1px solid rgba(239,68,68,.4)', display:'flex', alignItems:'center', gap:6 }}>
              🚨 EMERGENCY RESPONSE MODE
            </button>
          )}
          {['admin','government_officer','safety_officer'].includes(user?.role) && (
            <button onClick={handleTest} disabled={testing}
              style={{ padding:'6px 14px', borderRadius:10, fontSize:12, fontWeight:700, cursor: testing?'not-allowed':'pointer', background:'rgba(245,158,11,.12)', color:'#d97706', border:'1px solid rgba(245,158,11,.3)', opacity: testing ? 0.6 : 1, display:'flex', alignItems:'center', gap:6 }}>
              {testing ? '⏳ Creating…' : '🧪 Test Alert'}
            </button>
          )}
          {['admin','government_officer','mine_manager','inspector','safety_officer'].includes(user?.role) && (
            <button onClick={() => setShowCreateModal(true)}
              style={{ padding:'6px 14px', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer', background:'rgba(239,68,68,.12)', color:'#dc2626', border:'1px solid rgba(239,68,68,.3)', display:'flex', alignItems:'center', gap:6 }}>
              🚨 Create Alert
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          KPI OVERVIEW CARDS
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label:'Critical Alerts',   value: criticalCount,          color:'#dc2626', bg:'rgba(239,68,68,.08)',   border:'rgba(239,68,68,.25)',   icon:FiAlertOctagon, pulse: criticalCount>0 },
          { label:'Active Warnings',   value: warningCount,           color:'#ea580c', bg:'rgba(249,115,22,.07)',  border:'rgba(249,115,22,.25)',  icon:FiAlertTriangle,pulse: warningCount>0  },
          { label:'Affected Mines',    value: affectedMines || '—',   color:'var(--text-primary)', bg:'var(--bg-card)', border:'var(--border)', icon:FiMapPin,    pulse:false },
          { label:'Workers at Risk',   value: workersAtRisk,          color: criticalCount>0?'#dc2626':'var(--text-muted)', bg:'var(--bg-card)', border:'var(--border)', icon:FiUsers, pulse:false },
          { label:'Sensors Demo',      value: DEMO_SENSORS.filter(s=>s.severity!=='LOW').length, color:'#d97706', bg:'rgba(245,158,11,.07)', border:'rgba(245,158,11,.25)', icon:FiCpu, pulse:false },
          { label:'Resolved (7d)',     value: resolvedCount,          color:'#16a34a', bg:'rgba(34,197,94,.07)',   border:'rgba(34,197,94,.25)',   icon:FiCheckCircle, pulse:false },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} style={{ backgroundColor:'var(--bg-card)', border:`1px solid ${kpi.border}`, borderRadius:12, padding:'12px 14px', background:`linear-gradient(135deg,var(--bg-card),${kpi.bg})` }}>
              <div className="flex items-center justify-between mb-2">
                <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', margin:0 }}>{kpi.label}</p>
                <Icon size={13} style={{ color:kpi.color, flexShrink:0 }}/>
              </div>
              <p style={{ fontSize:22, fontWeight:900, color:kpi.color, margin:0, display:'flex', alignItems:'center', gap:6 }}>
                {kpi.pulse && <span style={{ width:7, height:7, borderRadius:'50%', background:kpi.color, display:'inline-block', animation:'kn-pulse-dot 1.2s infinite' }}/>}
                {kpi.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Data source note */}
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background:'var(--blue-bg)', border:'1px solid var(--blue-border)' }}>
        <FiDatabase size={13} style={{ color:'var(--blue)', flexShrink:0 }}/>
        <p className="text-xs" style={{ color:'var(--text-secondary)' }}>
          <strong style={{ color:'var(--blue)' }}>Live data sources:</strong> USGS Real-Time Earthquake Feed (M4+, 24h) · Open-Meteo Weather Forecast (IMD-equivalent) · Alerts GPS-matched to mine coordinates · Auto-poll every 10 minutes
          &nbsp;·&nbsp;<span style={{ color:'#d97706', fontWeight:700 }}>⚠ Sensor panels below show DEMO / SIMULATED DATA</span>
        </p>
      </div>

      {/* ══════════════════════════════════════════════
          MAIN TABS
      ══════════════════════════════════════════════ */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={clsx('tab-item', tab===t.id && 'active')}>
            {t.label}
            {t.id === 'overview' && active.length > 0 && (
              <span style={{ marginLeft:6, padding:'0 6px', borderRadius:999, fontSize:10, fontWeight:800, background:'rgba(239,68,68,.15)', color:'#dc2626' }}>{active.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════
          OVERVIEW TAB — Active alerts with filters
      ══════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map(f => {
              const Icon = f.icon;
              const isActive = categoryFilter === f.id;
              return (
                <button key={f.id} onClick={() => setCategoryFilter(f.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: isActive ? 'var(--accent-bg)' : 'var(--bg-card)',
                    border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border)'}`,
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  }}>
                  <Icon size={11}/>{f.label}
                </button>
              );
            })}
          </div>

          {/* Search + severity filter */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-52">
              <FiSearch size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by mine, type, location…"
                className="input" style={{ paddingLeft:32 }}/>
            </div>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} className="select" style={{ width:'auto' }}>
              <option value="all">All Severities</option>
              {['CRITICAL','HIGH','MEDIUM','LOW'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <p style={{ fontSize:12, color:'var(--text-muted)' }}>{filteredActive.length} alert{filteredActive.length!==1?'s':''}</p>
          </div>

          {/* Alert cards */}
          {filteredActive.length === 0 ? (
            <div className="card text-center py-14">
              <FiCheckCircle size={36} style={{ color:'#16a34a', margin:'0 auto 12px' }}/>
              <p style={{ fontWeight:700, fontSize:16, color:'var(--text-primary)', margin:'0 0 6px' }}>
                {active.length === 0 ? 'No active disaster alerts' : 'No alerts match your filters'}
              </p>
              <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 16px' }}>
                {active.length === 0 ? 'All monitored mines are currently safe. Auto-refreshes every 60 seconds.' : 'Try changing your category or severity filter.'}
              </p>
              {active.length === 0 && (
                <button onClick={handlePollNow} disabled={polling} className="btn-outline btn-sm">
                  <FiRefreshCw size={13} className={polling?'animate-spin':''}/> Check Sources Now
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredActive.map(a => (
                <AlertCard key={a.id} alert={a}
                  onAcknowledge={handleAcknowledge}
                  onResolve={handleResolve}
                  onViewDetails={setViewAlert}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          SENSOR MONITORING TAB
      ══════════════════════════════════════════════ */}
      {tab === 'sensors' && (
        <div className="space-y-4">
          {/* DEMO banner */}
          <div style={{ padding:'10px 16px', borderRadius:10, background:'rgba(245,158,11,.10)', border:'1px solid rgba(245,158,11,.30)' }}>
            <p style={{ margin:0, fontWeight:800, fontSize:12, color:'#d97706' }}>
              ⚠ DEMO / SIMULATED SENSOR DATA — These readings are generated for demonstration purposes.
              In a live deployment, this panel receives data from IoT sensors installed in mine galleries via the sensor API gateway.
              Connect real sensors by posting to <code style={{ background:'rgba(0,0,0,.08)', padding:'1px 5px', borderRadius:4, fontSize:11 }}>/api/v1/disaster/alerts</code> with your sensor payload.
            </p>
          </div>

          {/* Sensor category tabs */}
          <div className="tab-bar">
            {[
              { id:'gas',         label:'Gas & Air Quality'    },
              { id:'Environment', label:'Environment & Climate' },
              { id:'Structural',  label:'Structural & Seismic'  },
            ].map(t => (
              <button key={t.id} onClick={() => setSensorTab(t.id)} className={clsx('tab-item', sensorTab===t.id && 'active')}>{t.label}</button>
            ))}
          </div>

          {/* Sensor cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DEMO_SENSORS.filter(s => {
              if (sensorTab === 'gas') return s.type === 'Gas';
              return s.type === sensorTab;
            }).map(s => <SensorCard key={s.id} sensor={s}/>)}
          </div>

          {/* Integration note */}
          <div className="card">
            <h3 className="section-title flex items-center gap-2"><FiDatabase size={15}/> Real Sensor Integration</h3>
            <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:12 }}>
              To connect real IoT sensors to this system, POST sensor readings to the disaster alerts API. The system will automatically classify severity and trigger notifications.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label:'Gas Sensors',      desc:'CH₄, CO, O₂, dust monitors', icon:FiWind    },
                { label:'Seismic Monitors', desc:'Vibration & strata movement', icon:FiActivity},
                { label:'Env Sensors',      desc:'Temp, humidity, water level', icon:FiDroplet },
                { label:'Worker Wearables', desc:'SOS, man-down, RFID location',icon:FiUsers   },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.label} style={{ padding:'12px 14px', borderRadius:10, backgroundColor:'var(--bg-card-hover)', border:'1px solid var(--border)' }}>
                    <Icon size={16} style={{ color:'var(--accent)', marginBottom:8 }}/>
                    <p style={{ fontWeight:700, fontSize:12, color:'var(--text-primary)', margin:'0 0 3px' }}>{item.label}</p>
                    <p style={{ fontSize:11, color:'var(--text-muted)', margin:0 }}>{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          WORKER SAFETY TAB
      ══════════════════════════════════════════════ */}
      {tab === 'workers' && (
        <div className="space-y-4">
          <WorkerSafetyPanel/>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          CONTROL ROOM LOG TAB
      ══════════════════════════════════════════════ */}
      {tab === 'log' && (
        <ControlRoomLog history={history} loading={histLoading}/>
      )}

      {/* ══════════════════════════════════════════════
          STATISTICS TAB
      ══════════════════════════════════════════════ */}
      {tab === 'stats' && (
        <StatsPanel stats={stats}/>
      )}

      {/* ── Alert Detail Modal ── */}
      <AlertDetailModal
        alert={viewAlert}
        onClose={() => setViewAlert(null)}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
      />

      {/* ── Create Manual Alert Modal ── */}
      {showCreateModal && (
        <CreateAlertModal
          onSubmit={handleManualCreate}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
