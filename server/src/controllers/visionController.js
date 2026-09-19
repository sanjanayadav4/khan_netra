/**
 * KhanNetra AI Safety Vision — Controller
 *
 * Handles PPE detection from camera/webcam images.
 * Does NOT perform facial recognition or worker identification.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query }      = require('../config/database');
const { detectPPE, BACKEND } = require('../services/vision/detectionEngine');
const { PPE_ITEMS, calculateCompliance, THRESHOLDS } = require('../services/vision/ppeConfig');

/* ── helpers ──────────────────────────────────────────────────────────────── */
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES    = 10 * 1024 * 1024; // 10 MB

function validateImage(file) {
  if (!file)           throw Object.assign(new Error('No image file provided'), { status: 400 });
  if (!ALLOWED_MIME.has(file.mimetype))
    throw Object.assign(new Error(`Unsupported image type: ${file.mimetype}. Use JPEG, PNG or WebP.`), { status: 415 });
  if (file.size > MAX_BYTES)
    throw Object.assign(new Error(`Image too large (${(file.size/1e6).toFixed(1)} MB). Maximum is 10 MB.`), { status: 413 });
}

async function logAudit(userId, action, meta, req) {
  try {
    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), userId, action, 'vision', uuidv4(), JSON.stringify(meta), req.ip]
    );
  } catch { /* non-blocking */ }
}

function buildWorkerResult(worker, mineType) {
  const compliance  = calculateCompliance(worker.detected_ppe, mineType);
  const ppeDetails  = Object.entries(PPE_ITEMS).map(([id, info]) => ({
    id,
    label:       info.label,
    short_label: info.shortLabel,
    mandatory:   info.mandatory,
    detected:    worker.detected_ppe.includes(id),
    confidence:  worker.confidence_scores[id] || 0,
    regulation:  info.regulation,
  }));

  return {
    worker_id:          worker.worker_id,
    position_in_frame:  worker.position_in_frame,
    visibility:         worker.visibility,
    ppe_detected:       worker.detected_ppe,
    ppe_missing:        compliance.missing,
    mandatory_missing:  compliance.mandatory_missing,
    ppe_details:        ppeDetails,
    compliance_score:   compliance.score,
    status:             compliance.status,
    confidence_scores:  worker.confidence_scores,
    risk_level: (
      compliance.status === 'NON_COMPLIANT' ? 'HIGH' :
      compliance.status === 'WARNING'       ? 'MEDIUM' : 'LOW'
    ),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   POST /api/v1/vision/detect
   Analyse an uploaded image for PPE compliance.
   ════════════════════════════════════════════════════════════════════════════ */
exports.detect = async (req, res, next) => {
  const startTime = Date.now();
  let   tempPath  = null;

  try {
    validateImage(req.file);
    tempPath = req.file.path;

    const mineType   = (req.body.mine_type   || 'default').toLowerCase();
    const minConf    = parseFloat(req.body.min_confidence || 0.45);
    const mineId     = req.body.mine_id || null;
    const locationId = req.body.location || 'Unknown';

    // Read image buffer
    const imageBuffer = fs.readFileSync(tempPath);

    // Run detection
    const raw = await detectPPE(imageBuffer, req.file.mimetype, { mine_type: mineType, min_confidence: minConf });

    // Build per-worker results
    const workerResults = raw.workers.map(w => buildWorkerResult(w, mineType));

    // Site-level summary
    const total        = workerResults.length;
    const compliant    = workerResults.filter(w => w.status === 'COMPLIANT').length;
    const warning      = workerResults.filter(w => w.status === 'WARNING').length;
    const nonCompliant = workerResults.filter(w => w.status === 'NON_COMPLIANT').length;
    const avgScore     = total > 0
      ? Math.round(workerResults.reduce((s, w) => s + w.compliance_score, 0) / total)
      : 0;

    // Aggregate missing PPE across all workers
    const allMissing = [...new Set(workerResults.flatMap(w => w.mandatory_missing))];

    const siteSummary = {
      total_workers:    total,
      compliant_count:  compliant,
      warning_count:    warning,
      non_compliant_count: nonCompliant,
      site_compliance_score: avgScore,
      site_status: (
        nonCompliant > 0                ? 'NON_COMPLIANT' :
        warning      > 0                ? 'WARNING'       : 'COMPLIANT'
      ),
      critical_missing_ppe: allMissing,
    };

    const processingMs = Date.now() - startTime;

    // Audit log
    await logAudit(req.user.id, 'PPE_DETECTION', {
      mine_id:       mineId,
      worker_count:  total,
      site_status:   siteSummary.site_status,
      avg_score:     avgScore,
    }, req);

    const response = {
      success:        true,
      scan_id:        uuidv4(),
      timestamp:      new Date().toISOString(),
      location:       locationId,
      mine_id:        mineId,
      mine_type:      mineType,
      processing_ms:  processingMs,
      image_meta:     raw.image_meta,
      scene_info:     raw.scene_info,
      model_info:     raw.model_info,
      site_summary:   siteSummary,
      workers:        workerResults,
      ppe_reference:  Object.fromEntries(
        Object.entries(PPE_ITEMS).map(([id, info]) => [
          id,
          { label: info.label, mandatory: info.mandatory, regulation: info.regulation },
        ])
      ),
      thresholds: THRESHOLDS,
    };

    res.json(response);

  } catch (err) {
    await logAudit(req.user?.id, 'PPE_DETECTION_ERROR', { error: err.message }, req);
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message, ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }) });
  } finally {
    // Always clean up temp file
    if (tempPath) try { fs.unlinkSync(tempPath); } catch {}
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/v1/vision/ppe-reference
   Returns the full PPE catalogue (items, regulations, thresholds).
   ════════════════════════════════════════════════════════════════════════════ */
exports.getPpeReference = (req, res) => {
  res.json({
    success: true,
    data: {
      ppe_items:   PPE_ITEMS,
      thresholds:  THRESHOLDS,
      mine_types:  ['underground', 'opencast', 'default'],
      model_backend: BACKEND,
      compliance_formula: 'Weighted score based on PPE item importance. Mandatory items missing → NON_COMPLIANT regardless of score.',
    },
  });
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/v1/vision/health
   Quick health check for the vision subsystem.
   ════════════════════════════════════════════════════════════════════════════ */
exports.health = (req, res) => {
  const geminiConfigured = !!(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  );
  const openaiConfigured = !!(
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY.startsWith('sk-')
  );

  res.json({
    success:         true,
    service:         'KhanNetra AI Safety Vision',
    status:          'operational',
    model_backend:   BACKEND,
    capabilities:    Object.keys(PPE_ITEMS),
    api_key_status: {
      gemini: geminiConfigured ? 'configured' : 'missing',
      openai: openaiConfigured ? 'configured' : 'missing',
    },
    version:         '1.0.0',
    timestamp:       new Date().toISOString(),
  });
};
