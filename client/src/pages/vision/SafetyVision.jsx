/**
 * KhanNetra — AI Safety Vision
 * PPE Detection from camera / uploaded images.
 * No facial recognition — workers are never identified.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import BackButton from '../../components/ui/BackButton';
import {
  FiCamera, FiUpload, FiShield, FiAlertTriangle, FiCheckCircle,
  FiXCircle, FiInfo, FiRefreshCw, FiEye, FiCpu, FiMapPin,
  FiAlertCircle, FiZap, FiUser,
} from 'react-icons/fi';
import { visionApi, minesApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import clsx from 'clsx';
import toast from 'react-hot-toast';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const STATUS_STYLE = {
  COMPLIANT:     { bg:'bg-success-600/15 border-success-500/30', text:'text-success-400', icon: FiCheckCircle,  label:'Compliant'     },
  WARNING:       { bg:'bg-amber-500/15  border-amber-500/30',   text:'text-amber-400',   icon: FiAlertTriangle, label:'Warning'       },
  NON_COMPLIANT: { bg:'bg-danger-600/15 border-danger-500/30',  text:'text-danger-400',  icon: FiXCircle,       label:'Non-Compliant' },
};

const RISK_BADGE = { LOW:'green', MEDIUM:'yellow', HIGH:'red' };

const PPE_ICONS = {
  helmet:           '⛑️',
  safety_vest:      '🦺',
  safety_boots:     '👢',
  goggles:          '🥽',
  gloves:           '🧤',
  ear_protection:   '🎧',
  respiratory_mask: '😷',
  safety_lamp:      '🔦',
};

function ScoreRing({ score, size = 100 }) {
  const r      = (size - 12) / 2;
  const circ   = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const color  = score >= 85 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#343a40" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round" style={{ transition:'stroke-dasharray .7s ease' }} />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        className="rotate-90" fill={color} fontSize={size > 80 ? 18 : 13} fontWeight="900"
        style={{ transform:`rotate(90deg) translateY(0)`, transformOrigin:'center' }}>
        {score}%
      </text>
    </svg>
  );
}

function WorkerCard({ worker, index }) {
  const style = STATUS_STYLE[worker.status] || STATUS_STYLE.WARNING;
  const Icon  = style.icon;
  const [open, setOpen] = useState(true);

  return (
    <div className={clsx('rounded-2xl border p-5 transition-all', style.bg)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-coal-800 border border-coal-600 flex items-center justify-center">
            <FiUser size={18} className="text-coal-400" />
          </div>
          <div>
            <p className="font-bold text-coal-100 text-sm">Worker #{worker.worker_id}</p>
            <p className="text-[11px] text-coal-500 capitalize">
              {worker.position_in_frame?.replace('_',' ')} · {worker.visibility}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ScoreRing score={worker.compliance_score} size={72} />
          <div className="text-right">
            <div className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold', style.bg, style.text)}>
              <Icon size={13} /> {style.label}
            </div>
            <p className="text-[10px] text-coal-600 mt-1">
              <Badge color={RISK_BADGE[worker.risk_level]}>Risk: {worker.risk_level}</Badge>
            </p>
          </div>
        </div>
      </div>

      {/* PPE grid */}
      <button onClick={() => setOpen(o => !o)} className="text-[10px] text-coal-500 uppercase tracking-widest mb-3 flex items-center gap-1 hover:text-coal-300 transition-colors">
        <FiEye size={11}/> {open ? 'Hide' : 'Show'} PPE Details ({worker.ppe_details?.length || 0} items)
      </button>

      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(worker.ppe_details || []).map(item => (
            <div key={item.id}
              className={clsx(
                'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all',
                item.detected
                  ? 'bg-success-600/10 border-success-500/25'
                  : item.mandatory
                  ? 'bg-danger-600/10  border-danger-500/30'
                  : 'bg-coal-800/40    border-coal-700/40',
              )}>
              <span className="text-2xl">{PPE_ICONS[item.id] || '🔧'}</span>
              <p className={clsx('text-[10px] font-bold leading-tight',
                item.detected ? 'text-success-400' : item.mandatory ? 'text-danger-400' : 'text-coal-500')}>
                {item.short_label}
              </p>
              {item.detected ? (
                <span className="text-[10px] text-success-500 font-semibold">
                  {Math.round(item.confidence * 100)}%
                </span>
              ) : (
                <span className={clsx('text-[10px] font-bold uppercase', item.mandatory ? 'text-danger-400' : 'text-coal-700')}>
                  {item.mandatory ? 'MISSING*' : 'Not found'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Missing mandatory */}
      {worker.mandatory_missing?.length > 0 && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-danger-600/10 border border-danger-500/25">
          <FiAlertCircle size={14} className="text-danger-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-danger-300 mb-0.5">⚠️ Mandatory PPE Missing</p>
            <p className="text-xs text-danger-400">
              {worker.mandatory_missing.map(id => id.replace(/_/g,' ')).join(', ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SiteSummaryBar({ summary }) {
  if (!summary || summary.total_workers === 0) return null;
  const style = STATUS_STYLE[summary.site_status] || STATUS_STYLE.WARNING;
  const Icon  = style.icon;

  return (
    <div className={clsx('rounded-2xl border p-5', style.bg)}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Icon size={22} className={style.text} />
          <div>
            <p className={clsx('text-lg font-black', style.text)}>Site: {summary.site_status.replace('_',' ')}</p>
            <p className="text-xs text-coal-500">Overall compliance across {summary.total_workers} worker{summary.total_workers !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={clsx('text-4xl font-black tabular-nums', style.text)}>{summary.site_compliance_score}%</p>
          <p className="text-[11px] text-coal-500">Compliance Score</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Compliant',     value: summary.compliant_count,     color:'text-success-400', bg:'bg-success-600/15 border-success-500/25' },
          { label:'Warning',       value: summary.warning_count,       color:'text-amber-400',   bg:'bg-amber-500/15 border-amber-500/25' },
          { label:'Non-Compliant', value: summary.non_compliant_count, color:'text-danger-400',  bg:'bg-danger-600/15 border-danger-500/25' },
        ].map(s => (
          <div key={s.label} className={clsx('rounded-xl border p-3 text-center', s.bg)}>
            <p className={clsx('text-2xl font-black', s.color)}>{s.value}</p>
            <p className="text-[10px] text-coal-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {summary.critical_missing_ppe?.length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-danger-600/10 border border-danger-500/25">
          <p className="text-xs font-bold text-danger-300 mb-1">Critical Missing Across Workers:</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.critical_missing_ppe.map(id => (
              <span key={id} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-danger-600/20 text-danger-400 border border-danger-500/30">
                {PPE_ICONS[id]} {id.replace(/_/g,' ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export default function SafetyVision() {
  const [mode,         setMode]         = useState('upload');  // 'upload' | 'webcam'
  const [mines,        setMines]        = useState([]);
  const [mineId,       setMineId]       = useState('');
  const [mineType,     setMineType]     = useState('default');
  const [location,     setLocation]     = useState('');
  const [imgSrc,       setImgSrc]       = useState(null);   // preview
  const [imgFile,      setImgFile]      = useState(null);   // File for upload mode
  const [imgBlob,      setImgBlob]      = useState(null);   // Blob for webcam mode
  const [result,       setResult]       = useState(null);
  const [scanning,     setScanning]     = useState(false);
  const [healthInfo,   setHealthInfo]   = useState(null);
  const [ppeRef,       setPpeRef]       = useState(null);
  const [webcamReady,  setWebcamReady]  = useState(false);
  const [webcamError,  setWebcamError]  = useState(null);

  const fileInputRef   = useRef();
  const videoRef       = useRef();
  const canvasRef      = useRef();
  const streamRef      = useRef(null);

  /* load mines + health on mount */
  useEffect(() => {
    minesApi.getAll({ limit: 100 }).then(r => setMines(r.data || [])).catch(() => {});
    visionApi.health().then(r => setHealthInfo(r)).catch(() => {});
    visionApi.ppeReference().then(r => setPpeRef(r.data)).catch(() => {});
    return () => stopWebcam();
  }, []);

  /* start webcam */
  const startWebcam = async () => {
    setWebcamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      });
      streamRef.current      = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setWebcamReady(true);
    } catch (err) {
      setWebcamError(`Camera access denied: ${err.message}`);
      setWebcamReady(false);
    }
  };

  /* stop webcam */
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setWebcamReady(false);
  };

  /* capture frame from webcam */
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      setImgBlob(blob);
      setImgSrc(URL.createObjectURL(blob));
      setResult(null);
      toast.success('Frame captured — ready to scan');
    }, 'image/jpeg', 0.9);
  }, []);

  /* file drag-n-drop handler */
  const onFileDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
    if (file.size > 10 * 1024 * 1024)   { toast.error('Image must be under 10 MB');   return; }
    setImgFile(file);
    setImgSrc(URL.createObjectURL(file));
    setResult(null);
  }, []);

  /* switch mode */
  const switchMode = (m) => {
    setMode(m);
    setImgSrc(null); setImgFile(null); setImgBlob(null); setResult(null);
    if (m === 'webcam') startWebcam();
    else stopWebcam();
  };

  /* run scan */
  const runScan = async () => {
    const fileToSend = mode === 'webcam'
      ? (imgBlob ? new File([imgBlob], 'webcam.jpg', { type: 'image/jpeg' }) : null)
      : imgFile;

    if (!fileToSend) { toast.error('No image selected'); return; }

    setScanning(true);
    setResult(null);
    try {
      const res = await visionApi.detect(fileToSend, {
        mine_id:  mineId    || undefined,
        mine_type: mineType || 'default',
        location: location  || undefined,
      });
      setResult(res);
      if (res.site_summary?.total_workers === 0) {
        toast('No workers detected in the image', { icon: 'ℹ️' });
      } else {
        const s = res.site_summary;
        if (s.site_status === 'COMPLIANT')
          toast.success(`✅ Site COMPLIANT — ${s.compliant_count}/${s.total_workers} workers`);
        else if (s.site_status === 'WARNING')
          toast(`⚠️ WARNING — ${s.warning_count} worker(s) need attention`, { icon: '⚠️' });
        else
          toast.error(`🚫 NON-COMPLIANT — ${s.non_compliant_count} worker(s) violating PPE rules`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const reset = () => {
    setImgSrc(null); setImgFile(null); setImgBlob(null); setResult(null);
  };

  return (
    <div className="space-y-6"><BackButton className="mb-1"/>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FiShield className="text-amber-400" /> AI Safety Vision
          </h1>
          <p className="page-subtitle">
            Real-time PPE detection for mine workers — helmet, vest, boots, gloves and more
          </p>
        </div>

        {/* Status pill */}
        {healthInfo && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-coal-800/60 border border-coal-700/50">
            <span className={clsx('w-2 h-2 rounded-full', healthInfo.status === 'operational' ? 'bg-success-500 shadow-[0_0_6px_rgba(34,197,94,.6)]' : 'bg-amber-500')} />
            <span className="text-xs text-coal-400 font-medium">
              {healthInfo.service} · {healthInfo.model_backend}
            </span>
          </div>
        )}
      </div>

      {/* ── Config row ─────────────────────────────────────────────────── */}
      <div className="card-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="form-group">
          <label className="label">Mine (optional)</label>
          <select value={mineId} onChange={e => setMineId(e.target.value)} className="select">
            <option value="">Select Mine</option>
            {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Mine Type</label>
          <select value={mineType} onChange={e => setMineType(e.target.value)} className="select">
            <option value="default">Default</option>
            <option value="underground">Underground</option>
            <option value="opencast">Opencast</option>
          </select>
        </div>
        <div className="form-group">
          <label className="label">Location</label>
          <input value={location} onChange={e => setLocation(e.target.value)}
            className="input" placeholder="e.g. Entry Gate, Level 3…" />
        </div>
      </div>

      {/* ── Mode tabs ──────────────────────────────────────────────────── */}
      <div className="tab-bar">
        <button onClick={() => switchMode('upload')}
          className={clsx('tab-item flex items-center gap-2', mode === 'upload' && 'active')}>
          <FiUpload size={14} /> Upload Image
        </button>
        <button onClick={() => switchMode('webcam')}
          className={clsx('tab-item flex items-center gap-2', mode === 'webcam' && 'active')}>
          <FiCamera size={14} /> Live Webcam
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Left: Input panel ───────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Upload mode */}
          {mode === 'upload' && (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onFileDrop}
              onClick={() => !imgSrc && fileInputRef.current?.click()}
              className={clsx(
                'relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden',
                imgSrc
                  ? 'border-amber-500/40 cursor-default'
                  : 'border-coal-700 hover:border-amber-500/50 hover:bg-amber-500/3 cursor-pointer',
                'bg-coal-900/60',
              )}
              style={{ minHeight: '340px' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onFileDrop}
              />

              {imgSrc ? (
                <div className="relative">
                  <img src={imgSrc} alt="Preview" className="w-full rounded-2xl object-contain max-h-[420px]" />
                  <button onClick={(e) => { e.stopPropagation(); reset(); }}
                    className="absolute top-3 right-3 p-2 rounded-xl bg-coal-900/80 border border-coal-700 text-coal-400 hover:text-danger-400 transition-colors">
                    <FiXCircle size={16}/>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-coal-800 border border-coal-700 flex items-center justify-center mb-4">
                    <FiUpload size={28} className="text-coal-500" />
                  </div>
                  <p className="font-bold text-coal-300 mb-1">Drop image here or click to browse</p>
                  <p className="text-xs text-coal-600">JPEG, PNG, WebP · Max 10 MB</p>
                  <p className="text-xs text-coal-700 mt-3">
                    Upload a photo of mine workers to detect their PPE compliance
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Webcam mode */}
          {mode === 'webcam' && (
            <div className="rounded-2xl overflow-hidden border border-coal-700/60 bg-coal-900/60" style={{ minHeight:'340px' }}>
              {webcamError ? (
                <div className="flex flex-col items-center justify-center h-80 text-center px-6">
                  <FiAlertCircle size={36} className="text-danger-400 mb-3" />
                  <p className="font-bold text-danger-300 mb-1">Camera Error</p>
                  <p className="text-xs text-danger-500 mb-4">{webcamError}</p>
                  <button onClick={startWebcam} className="btn-outline btn-sm"><FiRefreshCw size={13}/> Retry</button>
                </div>
              ) : (
                <div className="relative">
                  <video ref={videoRef} className="w-full rounded-2xl" playsInline muted />
                  {/* Crosshair overlay */}
                  {webcamReady && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-amber-400/60 rounded-tl-md" />
                      <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-amber-400/60 rounded-tr-md" />
                      <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-amber-400/60 rounded-bl-md" />
                      <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-amber-400/60 rounded-br-md" />
                    </div>
                  )}
                  {!webcamReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-coal-900/80">
                      <div className="w-8 h-8 border-2 border-coal-700 border-t-amber-400 rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Hidden canvas for webcam capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Action buttons */}
          <div className="flex gap-3">
            {mode === 'webcam' && webcamReady && (
              <button onClick={captureFrame} className="btn-outline flex-1 justify-center">
                <FiCamera size={16} /> Capture Frame
              </button>
            )}
            <button
              onClick={runScan}
              disabled={scanning || (!imgFile && !imgBlob)}
              className={clsx(
                'btn-primary flex-1 justify-center',
                mode === 'webcam' && !imgBlob && 'opacity-40 cursor-not-allowed',
              )}
            >
              {scanning ? (
                <><div className="w-4 h-4 border-2 border-coal-900/30 border-t-coal-900 rounded-full animate-spin" /> Analysing…</>
              ) : (
                <><FiCpu size={16} /> Scan for PPE</>
              )}
            </button>
          </div>

          {scanning && (
            <div className="p-4 rounded-xl bg-amber-500/8 border border-amber-500/20 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Gemini Vision is analysing…</p>
                <p className="text-xs text-amber-600 mt-0.5">Detecting PPE items — this takes 5–15 seconds</p>
              </div>
            </div>
          )}

          {/* Captured webcam preview */}
          {mode === 'webcam' && imgSrc && !scanning && (
            <div>
              <p className="text-[10px] text-coal-600 uppercase tracking-widest mb-2">Captured Frame</p>
              <img src={imgSrc} alt="Captured" className="w-full rounded-xl border border-coal-700/60 object-contain max-h-48" />
            </div>
          )}
        </div>

        {/* ── Right: Results panel ─────────────────────────────────────── */}
        <div className="space-y-4">

          {!result && !scanning && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center py-12 rounded-2xl border border-dashed border-coal-700/60 bg-coal-900/40">
              <div className="w-16 h-16 rounded-2xl bg-coal-800 border border-coal-700 flex items-center justify-center mb-4">
                <FiShield size={28} className="text-coal-600" />
              </div>
              <p className="font-bold text-coal-500 text-base mb-1">No scan yet</p>
              <p className="text-xs text-coal-700 max-w-xs">
                Upload an image or use your webcam, then click "Scan for PPE" to detect compliance.
              </p>
            </div>
          )}

          {scanning && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
              <PageLoader message="Gemini Vision analysing image…" />
            </div>
          )}

          {result && !scanning && (
            <div className="space-y-4 animate-fade-in">
              {/* Meta */}
              <div className="flex items-center justify-between text-[11px] text-coal-600">
                <span>Scan ID: <span className="font-mono text-coal-500">{result.scan_id?.slice(0, 8)}…</span></span>
                <span>{result.model_info?.name} · {result.processing_ms}ms</span>
              </div>

              {/* Site summary */}
              <SiteSummaryBar summary={result.site_summary} />

              {/* No workers */}
              {result.site_summary?.total_workers === 0 && (
                <div className="p-5 rounded-2xl border border-coal-700/60 bg-coal-800/40 text-center">
                  <FiInfo size={32} className="text-coal-600 mx-auto mb-3" />
                  <p className="font-bold text-coal-400 mb-1">No Workers Detected</p>
                  <p className="text-xs text-coal-600">
                    {result.scene_info?.description}
                  </p>
                  <p className="text-xs text-coal-700 mt-2">
                    Lighting: {result.scene_info?.lighting} · Workers visible: 0
                  </p>
                </div>
              )}

              {/* Per-worker cards */}
              {(result.workers || []).map((w, i) => (
                <WorkerCard key={w.worker_id} worker={w} index={i} />
              ))}

              {/* Scan again */}
              <button onClick={reset} className="btn-outline w-full justify-center">
                <FiRefreshCw size={14} /> Scan Another Image
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── PPE Reference table ─────────────────────────────────────────── */}
      {ppeRef && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <FiInfo size={16} className="text-amber-400" /> PPE Compliance Reference
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(ppeRef.ppe_items).map(([id, item]) => (
              <div key={id}
                className={clsx(
                  'p-3 rounded-xl border',
                  item.mandatory
                    ? 'bg-amber-500/8 border-amber-500/20'
                    : 'bg-coal-800/40 border-coal-700/40',
                )}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{PPE_ICONS[id] || '🔧'}</span>
                  <div>
                    <p className="text-xs font-bold text-coal-200">{item.shortLabel}</p>
                    {item.mandatory && <span className="text-[9px] font-black text-amber-400 uppercase">Mandatory</span>}
                  </div>
                </div>
                <p className="text-[10px] text-coal-600 leading-snug">{item.regulation}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-coal-700 mt-3">
            * Mandatory PPE missing = NON-COMPLIANT regardless of score.
            Thresholds: ≥{ppeRef.thresholds?.COMPLIANT}% = Compliant · ≥{ppeRef.thresholds?.WARNING}% = Warning · below = Non-Compliant
          </p>
        </div>
      )}
    </div>
  );
}
