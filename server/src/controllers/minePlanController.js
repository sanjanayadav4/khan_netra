/**
 * KhanNetra — Underground Mine Plan Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles upload, versioning, OCR extraction, layer management, and
 * secure access for underground mine digital plans.
 *
 * Safety rule: this system is a governance/visualization platform.
 * It NEVER certifies, replaces, or auto-approves official mine plans.
 * All approval/verification is done by authorized human officers.
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const sharp = require('sharp');
const { v4: uuidv4 }    = require('uuid');
const { query }         = require('../config/database');

/* ── Roles allowed to access restricted mine plans ───────────────────────── */
// FALLBACK only — real decisions read the per-plan `allowed_roles` column.
const AUTHORIZED_ROLES = new Set([
  'admin', 'government_officer', 'mine_manager',
  'inspector', 'safety_officer', 'environment_officer',
]);

/* ── Roles that can manage (grant/revoke) access ─────────────────────────── */
const ACCESS_MANAGERS = new Set(['admin', 'government_officer', 'mine_manager']);

/* ── Role display labels (for API responses & frontend) ──────────────────── */
const ROLE_LABELS = {
  admin:                'Administrator (DGMS)',
  government_officer:   'Government Officer',
  mine_manager:         'Mine Manager',
  inspector:            'DGMS Inspector',
  safety_officer:       'Safety Officer',
  environment_officer:  'Environment Officer',
};

/* ── Permission matrix per role ─────────────────────────────────────────── */
const ROLE_PERMISSIONS = {
  admin:                { view: true,  download: true,  manage_access: true  },
  government_officer:   { view: true,  download: true,  manage_access: true  },
  mine_manager:         { view: true,  download: true,  manage_access: true  },
  inspector:            { view: true,  download: true,  manage_access: false },
  safety_officer:       { view: true,  download: false, manage_access: false },
  environment_officer:  { view: true,  download: false, manage_access: false },
};

/* ─────────────────────────────────────────────────────────────────────────────
   checkPlanAccess(plan, user)
   ─────────────────────────────────────────────────────────────────────────────
   Core RBAC decision function. Returns { allowed, reason, permissions }.
   For unrestricted plans:  all authenticated users can view.
   For restricted plans:    role must be in plan's allowed_roles JSON array.
   Admins always have access regardless of allowed_roles.
   ───────────────────────────────────────────────────────────────────────────── */
function checkPlanAccess(plan, user) {
  // Non-restricted plans — open to all authenticated users
  if (!plan.is_restricted) {
    return {
      allowed:     true,
      reason:      'unrestricted',
      permissions: ROLE_PERMISSIONS[user.role] || { view: true, download: false, manage_access: false },
    };
  }

  // Admins always allowed — bypass per-plan list
  if (user.role === 'admin') {
    return {
      allowed:     true,
      reason:      'admin_override',
      permissions: ROLE_PERMISSIONS.admin,
    };
  }

  // Parse per-plan allowed_roles (JSON array stored in DB)
  let allowedRoles = [];
  try {
    allowedRoles = plan.allowed_roles ? JSON.parse(plan.allowed_roles) : [];
  } catch {
    // If JSON is malformed, fall back to the global AUTHORIZED_ROLES Set
    allowedRoles = [...AUTHORIZED_ROLES];
  }

  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    // Empty or null allowed_roles → fall back to AUTHORIZED_ROLES Set
    allowedRoles = [...AUTHORIZED_ROLES];
  }

  const allowed = allowedRoles.includes(user.role);
  const permissions = allowed
    ? (ROLE_PERMISSIONS[user.role] || { view: true, download: false, manage_access: false })
    : { view: false, download: false, manage_access: false };

  return {
    allowed,
    reason: allowed ? 'role_in_allowed_list' : 'role_not_in_allowed_list',
    permissions,
    allowed_roles: allowedRoles,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   logAccess  — low-level event to mine_plan_access_logs
   logRbacEvent — writes to BOTH audit_logs + mine_plan_access_logs (Task 3)
   ───────────────────────────────────────────────────────────────────────────── */
async function logAccess(planId, userId, action, req, result = 'allowed') {
  try {
    await query(
      `INSERT INTO mine_plan_access_logs (id,plan_id,user_id,action,ip_address,device_info,created_at)
       VALUES (?,?,?,?,?,?,datetime('now'))`,
      [uuidv4(), planId, userId, `${action}:${result}`, req.ip,
       (req.headers['user-agent'] || '').slice(0, 200)]
    );
  } catch { /* non-blocking */ }
}

async function logRbacEvent({ planId, userId, action, result, reason, req, mineId, description }) {
  const stamp = new Date().toISOString();
  // Write to mine_plan_access_logs
  try {
    await query(
      `INSERT INTO mine_plan_access_logs (id,plan_id,user_id,action,ip_address,device_info,created_at)
       VALUES (?,?,?,?,?,?,datetime('now'))`,
      [uuidv4(), planId, userId,
       `${action}:${result}`,
       req?.ip || 'system',
       (req?.headers?.['user-agent'] || '').slice(0, 200)]
    );
  } catch { /* non-blocking */ }

  // Write to audit_logs (existing system)
  try {
    await query(
      `INSERT INTO audit_logs
         (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address,created_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))`,
      [
        uuidv4(), userId,
        `MINE_PLAN_${action.toUpperCase()}`,
        'mine_plan', planId,
        description || `${action} ${result}${reason ? ' (' + reason + ')' : ''}`,
        mineId || null,
        req?.ip || 'system',
      ]
    );
  } catch { /* non-blocking */ }
}

/* ── Gemini-based OCR for mine plan documents ────────────────────────────── */
async function runMinePlanOCR(imageBase64, planTitle) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length < 10) return null;

  const MODELS = ['gemini-3.6-flash', 'gemini-2.5-flash'];
  const prompt = `You are a mine-plan document analyser for Indian coal mines (DGMS, Ministry of Coal).

Analyse this mine plan document image and extract available information in JSON.

IMPORTANT DISCLAIMER: This is a digital governance tool only. The extracted data
is informational and does NOT constitute an officially verified or certified mine plan.

Extract the following (use null for anything not found):
{
  "mine_name": "mine name if visible",
  "mine_id": "mine ID/code if visible",
  "plan_type": "type of plan: General Layout / Ventilation / Electrical / Water Drainage / Emergency Escape / Other",
  "seams": ["list of seam names/numbers visible"],
  "shafts": ["list of shaft names/numbers"],
  "panels": ["list of panel names/numbers"],
  "levels": ["list of levels/depths visible"],
  "roadways": ["list of main roadway/tunnel names"],
  "ventilation_routes": ["ventilation intake/return routes if visible"],
  "emergency_exits": ["emergency exit locations if marked"],
  "scale": "map scale if shown e.g. 1:2500",
  "date_on_plan": "date shown on the plan if any",
  "authority": "issuing authority or approving body name if shown",
  "drawing_number": "drawing reference number if shown",
  "north_indicator": true,
  "legend_present": true,
  "readable_text_samples": ["up to 5 readable text fragments from the plan"],
  "summary": "2-sentence description of what this plan shows",
  "confidence": 0.0,
  "warnings": ["any extraction issues, unclear areas, etc."]
}

Return ONLY valid JSON. No markdown. No explanation outside the JSON.`;

  const bodyObj = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.05, maxOutputTokens: 1500 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  for (const model of MODELS) {
    try {
      const body    = JSON.stringify(bodyObj);
      const apiPath = `/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const result  = await new Promise((resolve, reject) => {
        const options = {
          hostname: 'generativelanguage.googleapis.com',
          path: apiPath, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        };
        let data = '';
        const req = https.request(options, (res) => {
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                const retryable = /not found|unavailable|quota|demand/i.test(json.error.message || '');
                reject(Object.assign(new Error(json.error.message), { retryable }));
              } else {
                resolve(json);
              }
            } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      });

      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) continue;

      // Robust JSON extraction
      let parsed;
      try { parsed = JSON.parse(rawText.trim()); }
      catch {
        const m = rawText.match(/\{[\s\S]+\}/);
        if (!m) continue;
        try { parsed = JSON.parse(m[0]); } catch { continue; }
      }
      return { data: parsed, model_used: model };
    } catch (err) {
      if (!err.retryable) throw err;
      console.log(`[MinePlan OCR] Model ${model} unavailable, trying next…`);
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════
   GET ALL — paginated list of mine plans (for a mine or all)
   Restricted plans are filtered to only those the user's role can access.
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAll = async (req, res, next) => {
  try {
    const { mine_id, plan_type, approval_status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds = [], params = [];

    // Mine managers see only their mine
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)             { conds.push('mp.mine_id = ?');           params.push(mId); }
    if (plan_type)       { conds.push('mp.plan_type = ?');         params.push(plan_type); }
    if (approval_status) { conds.push('mp.approval_status = ?');   params.push(approval_status); }

    // RBAC: for restricted plans, only show if user's role is in allowed_roles
    // Admins see everything; others only see unrestricted OR plans where their role is listed
    if (req.user.role !== 'admin') {
      conds.push(
        `(mp.is_restricted = 0 OR (mp.is_restricted = 1 AND mp.allowed_roles LIKE ?))`
      );
      params.push(`%"${req.user.role}"%`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const total = (await query(
      `SELECT COUNT(*) as c FROM mine_plans mp ${where}`, params
    )).rows[0].c;

    const rows = (await query(
      `SELECT mp.*,
              m.name  AS mine_name,
              m.type  AS mine_type,
              m.state AS mine_state,
              u.full_name AS uploaded_by_name,
              a.full_name AS approved_by_name,
              (SELECT COUNT(*) FROM mine_plan_layers l WHERE l.plan_id = mp.id) AS layer_count
       FROM mine_plans mp
       JOIN  mines m      ON mp.mine_id     = m.id
       LEFT JOIN users u  ON mp.uploaded_by = u.id
       LEFT JOIN users a  ON mp.approved_by = a.id
       ${where}
       ORDER BY mp.is_current_version DESC, mp.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    )).rows;

    // Annotate each row with the user's permissions for that plan
    const annotated = rows.map(plan => {
      const access = checkPlanAccess(plan, req.user);
      return {
        ...plan,
        _access: {
          can_view:          access.allowed,
          can_download:      access.allowed && access.permissions?.download,
          can_manage_access: ACCESS_MANAGERS.has(req.user.role),
        },
      };
    });

    res.json({
      success: true,
      data:    annotated,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit) },
      meta: { data_freshness: new Date().toISOString() },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET BY ID — single plan with layers and version history
   ════════════════════════════════════════════════════════════════════════════ */
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const plan = (await query(
      `SELECT mp.*,
              m.name  AS mine_name, m.type AS mine_type, m.state AS mine_state,
              u.full_name AS uploaded_by_name,
              a.full_name AS approved_by_name
       FROM mine_plans mp
       JOIN  mines m     ON mp.mine_id     = m.id
       LEFT JOIN users u ON mp.uploaded_by = u.id
       LEFT JOIN users a ON mp.approved_by = a.id
       WHERE mp.id = ?`,
      [id]
    )).rows[0];

    if (!plan) return res.status(404).json({ success: false, message: 'Mine plan not found' });

    // ── RBAC: check per-plan allowed_roles, not hard-coded Set ──────────────
    const access = checkPlanAccess(plan, req.user);
    if (!access.allowed) {
      await logRbacEvent({
        planId: id, userId: req.user.id,
        action: 'view', result: 'denied', reason: access.reason,
        req, mineId: plan.mine_id,
        description: `Access denied to restricted plan: ${plan.plan_title}`,
      });
      return res.status(403).json({
        success:  false,
        code:     'MINE_PLAN_ACCESS_DENIED',
        message:  'Access Denied — You are not authorized to view this restricted mine plan.',
        plan_id:  id,
      });
    }

    // Load layers
    const layers = (await query(
      `SELECT l.*, u.full_name AS created_by_name
       FROM mine_plan_layers l
       LEFT JOIN users u ON l.created_by = u.id
       WHERE l.plan_id = ? AND l.is_active = 1
       ORDER BY l.layer_type, l.created_at`,
      [id]
    )).rows;

    // Version history
    const versions = (await query(
      `SELECT id, version_number, version_label, approval_status,
              is_current_version, change_description, created_at,
              (SELECT full_name FROM users WHERE id = mp2.uploaded_by) AS uploaded_by_name
       FROM mine_plans mp2
       WHERE mine_id = ? AND plan_type = ?
       ORDER BY created_at DESC`,
      [plan.mine_id, plan.plan_type]
    )).rows;

    // Safety data overlays — fetch from existing tables
    const [incidents, violations, inspections] = await Promise.all([
      query(
        `SELECT id, incident_number, type, severity, location_in_mine, incident_date, latitude, longitude
         FROM incidents WHERE mine_id = ? AND status != 'closed'
         ORDER BY incident_date DESC LIMIT 20`,
        [plan.mine_id]
      ),
      query(
        `SELECT id, violation_number, category, severity, detected_date, description
         FROM violations WHERE mine_id = ? AND status != 'closed'
         ORDER BY detected_date DESC LIMIT 20`,
        [plan.mine_id]
      ),
      query(
        `SELECT id, inspection_number, type, status, scheduled_date, overall_score, location_in_mine
         FROM inspections WHERE mine_id = ? AND status IN ('scheduled','in_progress')
         ORDER BY scheduled_date ASC LIMIT 10`,
        [plan.mine_id]
      ),
    ]);

    // Log the view (allowed)
    await logRbacEvent({
      planId: id, userId: req.user.id,
      action: 'view', result: 'allowed', reason: access.reason,
      req, mineId: plan.mine_id,
      description: `Viewed mine plan: ${plan.plan_title}`,
    });

    res.json({
      success: true,
      data: {
        plan,
        layers,
        versions,
        safety_overlay: {
          incidents:   incidents.rows,
          violations:  violations.rows,
          inspections: inspections.rows,
        },
        // RBAC: tell the frontend exactly what this user can do
        _access: {
          can_view:          true,
          can_download:      access.permissions?.download === true,
          can_manage_access: ACCESS_MANAGERS.has(req.user.role),
          reason:            access.reason,
        },
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   UPLOAD — upload a new mine plan or a new version
   ════════════════════════════════════════════════════════════════════════════ */
exports.upload = async (req, res, next) => {
  let tempPath = null;
  try {
    const {
      mine_id, plan_title, plan_type = 'General Layout',
      version_number = '1.0', version_label, change_description,
      previous_version_id, is_restricted = 1,
    } = req.body;

    if (!mine_id || !plan_title)
      return res.status(400).json({ success: false, message: 'mine_id and plan_title are required' });
    if (!req.file)
      return res.status(400).json({ success: false, message: 'Plan file is required' });

    // Verify it's an underground mine
    const mine = (await query(
      'SELECT id, name, type FROM mines WHERE id = ?', [mine_id]
    )).rows[0];
    if (!mine)
      return res.status(404).json({ success: false, message: 'Mine not found' });

    tempPath = req.file.path;
    const id = uuidv4();

    // Persist the plan record first (OCR runs async)
    await query(
      `INSERT INTO mine_plans
         (id, mine_id, plan_title, plan_type, version_number, version_label,
          previous_version_id, change_description,
          file_name, file_path, file_size, mime_type,
          ocr_status, approval_status, is_restricted,
          uploaded_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending','pending_review',?,?,datetime('now'),datetime('now'))`,
      [
        id, mine_id, plan_title, plan_type,
        version_number, version_label || null,
        previous_version_id || null, change_description || null,
        req.file.originalname, req.file.path, req.file.size, req.file.mimetype,
        is_restricted ? 1 : 0, req.user.id,
      ]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'UPLOAD', 'mine_plan', id,
       `Uploaded mine plan: ${plan_title} v${version_number} for ${mine.name}`,
       mine_id, req.ip]
    );
    await logAccess(id, req.user.id, 'upload', req);

    // Run OCR asynchronously — don't block the response
    const plan = (await query(
      `SELECT mp.*, m.name AS mine_name FROM mine_plans mp JOIN mines m ON mp.mine_id=m.id WHERE mp.id=?`,
      [id]
    )).rows[0];

    res.status(201).json({
      success: true,
      message: 'Mine plan uploaded. OCR extraction will run in the background.',
      data:    plan,
    });

    // Background OCR
    setImmediate(async () => {
      try {
        await query(
          `UPDATE mine_plans SET ocr_status='processing', updated_at=datetime('now') WHERE id=?`,
          [id]
        );

        // Convert to JPEG for Gemini (handles PDF first page via sharp)
        let imageBuffer;
        try {
          imageBuffer = await sharp(req.file.path)
            .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch {
          // If sharp can't handle it (e.g. multi-page PDF), use the file as-is
          imageBuffer = fs.readFileSync(req.file.path);
        }

        const ocrResult = await runMinePlanOCR(
          imageBuffer.toString('base64'), plan_title
        );

        if (ocrResult) {
          await query(
            `UPDATE mine_plans SET
               ocr_status      = 'complete',
               ocr_extracted_data = ?,
               ocr_confidence  = ?,
               ocr_warnings    = ?,
               updated_at      = datetime('now')
             WHERE id = ?`,
            [
              JSON.stringify(ocrResult.data),
              ocrResult.data?.confidence || 0,
              JSON.stringify(ocrResult.data?.warnings || []),
              id,
            ]
          );
          console.log(`[MinePlan OCR] Completed for plan ${id} using ${ocrResult.model_used}`);
        } else {
          await query(
            `UPDATE mine_plans SET ocr_status='failed', updated_at=datetime('now') WHERE id=?`,
            [id]
          );
        }
      } catch (e) {
        console.error('[MinePlan OCR] Background error:', e.message);
        try {
          await query(
            `UPDATE mine_plans SET ocr_status='failed', updated_at=datetime('now') WHERE id=?`,
            [id]
          );
        } catch { /* ignore */ }
      }
    });

  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   APPROVE / REJECT  (admin or government_officer only)
   ════════════════════════════════════════════════════════════════════════════ */
exports.updateApproval = async (req, res, next) => {
  try {
    const { id }     = req.params;
    const { action, rejection_reason } = req.body;
    // action: 'approve' | 'reject' | 'set_current'

    if (!['approve', 'reject', 'set_current'].includes(action))
      return res.status(400).json({ success: false, message: 'action must be approve | reject | set_current' });

    const plan = (await query('SELECT * FROM mine_plans WHERE id=?', [id])).rows[0];
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    if (action === 'approve') {
      await query(
        `UPDATE mine_plans
         SET approval_status='approved', approved_by=?, approved_at=datetime('now'),
             updated_at=datetime('now')
         WHERE id=?`,
        [req.user.id, id]
      );
    } else if (action === 'reject') {
      await query(
        `UPDATE mine_plans
         SET approval_status='rejected', approved_by=?, approved_at=datetime('now'),
             rejection_reason=?, updated_at=datetime('now')
         WHERE id=?`,
        [req.user.id, rejection_reason || 'No reason given', id]
      );
    } else if (action === 'set_current') {
      // Mark all other plans for this mine+type as not current
      await query(
        `UPDATE mine_plans SET is_current_version=0, updated_at=datetime('now')
         WHERE mine_id=? AND plan_type=?`,
        [plan.mine_id, plan.plan_type]
      );
      await query(
        `UPDATE mine_plans SET is_current_version=1, updated_at=datetime('now') WHERE id=?`,
        [id]
      );
    }

    await logAccess(id, req.user.id, action, req);
    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, action.toUpperCase(), 'mine_plan', id,
       `Mine plan ${action}: ${plan.plan_title} v${plan.version_number}`,
       plan.mine_id, req.ip]
    );

    const updated = (await query('SELECT * FROM mine_plans WHERE id=?', [id])).rows[0];
    res.json({ success: true, message: `Plan ${action} successful`, data: updated });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   SERVE FILE — serve the plan file with access logging
   ════════════════════════════════════════════════════════════════════════════ */
exports.serveFile = async (req, res, next) => {
  try {
    const plan = (await query('SELECT * FROM mine_plans WHERE id=?', [req.params.id])).rows[0];
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    // ── RBAC: check download permission via per-plan allowed_roles ────────
    const access = checkPlanAccess(plan, req.user);
    if (!access.allowed) {
      await logRbacEvent({
        planId: plan.id, userId: req.user.id,
        action: 'download', result: 'denied', reason: access.reason,
        req, mineId: plan.mine_id,
        description: `Download denied — restricted plan: ${plan.plan_title}`,
      });
      return res.status(403).json({
        success: false,
        code:    'MINE_PLAN_DOWNLOAD_DENIED',
        message: 'Access Denied — You are not authorized to download this restricted mine plan.',
      });
    }

    // Check download permission (view ≠ download for some roles)
    if (!access.permissions?.download) {
      await logRbacEvent({
        planId: plan.id, userId: req.user.id,
        action: 'download', result: 'denied', reason: 'no_download_permission',
        req, mineId: plan.mine_id,
        description: `Download denied — role ${req.user.role} cannot download plans`,
      });
      return res.status(403).json({
        success: false,
        code:    'MINE_PLAN_DOWNLOAD_PERMISSION',
        message: 'Your role does not have download permission for mine plans.',
      });
    }

    if (!fs.existsSync(plan.file_path))
      return res.status(404).json({ success: false, message: 'File not found on server' });

    // Increment download counter
    await query(
      `UPDATE mine_plans
       SET download_count=download_count+1, last_downloaded_at=datetime('now'), updated_at=datetime('now')
       WHERE id=?`,
      [plan.id]
    );
    await logRbacEvent({
      planId: plan.id, userId: req.user.id,
      action: 'download', result: 'allowed', reason: access.reason,
      req, mineId: plan.mine_id,
      description: `Downloaded mine plan: ${plan.plan_title} v${plan.version_number}`,
    });

    res.download(plan.file_path, plan.file_name);
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   LAYERS — CRUD for interactive annotations
   ════════════════════════════════════════════════════════════════════════════ */
exports.getLayers = async (req, res, next) => {
  try {
    // Check plan access before returning layers
    const plan = (await query('SELECT id, is_restricted, allowed_roles, mine_id FROM mine_plans WHERE id=?', [req.params.id])).rows[0];
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    const access = checkPlanAccess(plan, req.user);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        code:    'MINE_PLAN_ACCESS_DENIED',
        message: 'Access Denied — You are not authorized to view this restricted mine plan.',
      });
    }

    const rows = (await query(
      `SELECT l.*, u.full_name AS created_by_name
       FROM mine_plan_layers l
       LEFT JOIN users u ON l.created_by = u.id
       WHERE l.plan_id = ? AND l.is_active = 1
       ORDER BY l.layer_type, l.created_at`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.saveLayer = async (req, res, next) => {
  try {
    const {
      layer_type, label, description, geometry,
      color = '#f59e0b', opacity = 0.6, icon,
      linked_type, linked_id,
    } = req.body;

    if (!layer_type || !geometry)
      return res.status(400).json({ success: false, message: 'layer_type and geometry required' });

    const plan = (await query('SELECT id, mine_id FROM mine_plans WHERE id=?', [req.params.id])).rows[0];
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    const id = uuidv4();
    await query(
      `INSERT INTO mine_plan_layers
         (id,plan_id,layer_type,label,description,geometry,color,opacity,icon,
          linked_type,linked_id,is_active,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,datetime('now'),datetime('now'))`,
      [id, req.params.id, layer_type, label||null, description||null,
       typeof geometry === 'string' ? geometry : JSON.stringify(geometry),
       color, opacity, icon||null, linked_type||null, linked_id||null, req.user.id]
    );

    await logAccess(req.params.id, req.user.id, 'edit_layer', req);
    const layer = (await query('SELECT * FROM mine_plan_layers WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, data: layer });
  } catch (err) { next(err); }
};

exports.deleteLayer = async (req, res, next) => {
  try {
    await query(
      `UPDATE mine_plan_layers SET is_active=0, updated_at=datetime('now') WHERE id=?`,
      [req.params.layerId]
    );
    res.json({ success: true, message: 'Layer removed' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   ACCESS LOGS — audit trail for a plan
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAccessLogs = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT al.*, u.full_name, u.role
       FROM mine_plan_access_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.plan_id = ?
       ORDER BY al.created_at DESC
       LIMIT 100`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET ACCESS — returns allowed_roles + role details for a plan
   Only ACCESS_MANAGERS (admin/govt_officer/mine_manager) can call this.
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAccess = async (req, res, next) => {
  try {
    const { id } = req.params;

    const plan = (await query(
      'SELECT id, plan_title, is_restricted, allowed_roles, mine_id FROM mine_plans WHERE id=?',
      [id]
    )).rows[0];
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    // Only access managers can view the permission config
    if (!ACCESS_MANAGERS.has(req.user.role))
      return res.status(403).json({
        success: false,
        code:    'INSUFFICIENT_PERMISSIONS',
        message: 'Only administrators, government officers, and mine managers can view access settings.',
      });

    // Parse current allowed_roles
    let allowedRoles = [];
    try {
      allowedRoles = plan.allowed_roles ? JSON.parse(plan.allowed_roles) : [];
    } catch {
      allowedRoles = [...AUTHORIZED_ROLES];
    }
    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
      allowedRoles = [...AUTHORIZED_ROLES];
    }

    // Build role detail list — all known roles, with allowed flag
    const allRoles = Object.keys(ROLE_LABELS);
    const roleDetails = allRoles.map(role => ({
      role,
      label:       ROLE_LABELS[role],
      allowed:     allowedRoles.includes(role),
      permissions: ROLE_PERMISSIONS[role] || { view: false, download: false, manage_access: false },
    }));

    await logRbacEvent({
      planId: id, userId: req.user.id,
      action: 'view_access_config', result: 'allowed', reason: 'access_manager',
      req, mineId: plan.mine_id,
      description: `Viewed access configuration for plan: ${plan.plan_title}`,
    });

    res.json({
      success: true,
      data: {
        plan_id:       id,
        plan_title:    plan.plan_title,
        is_restricted: !!plan.is_restricted,
        allowed_roles: allowedRoles,
        role_details:  roleDetails,
        can_manage:    ACCESS_MANAGERS.has(req.user.role),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   UPDATE ACCESS — set allowed_roles for a plan
   Only ACCESS_MANAGERS can call this. Changes are fully audit-logged.
   ════════════════════════════════════════════════════════════════════════════ */
exports.updateAccess = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { allowed_roles, is_restricted } = req.body;

    if (!ACCESS_MANAGERS.has(req.user.role))
      return res.status(403).json({
        success: false,
        code:    'INSUFFICIENT_PERMISSIONS',
        message: 'Only administrators, government officers, and mine managers can modify access settings.',
      });

    if (!Array.isArray(allowed_roles))
      return res.status(400).json({ success: false, message: 'allowed_roles must be an array of role strings' });

    // Validate — only known roles allowed
    const validRoles = Object.keys(ROLE_LABELS);
    const invalid = allowed_roles.filter(r => !validRoles.includes(r));
    if (invalid.length)
      return res.status(400).json({
        success: false,
        message: `Unknown roles: ${invalid.join(', ')}. Valid roles: ${validRoles.join(', ')}`,
      });

    const plan = (await query(
      'SELECT id, plan_title, is_restricted, allowed_roles, mine_id FROM mine_plans WHERE id=?',
      [id]
    )).rows[0];
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    // Capture old value for audit
    let oldRoles = [];
    try { oldRoles = plan.allowed_roles ? JSON.parse(plan.allowed_roles) : []; } catch { oldRoles = []; }

    const newIsRestricted = typeof is_restricted === 'boolean' ? is_restricted : !!plan.is_restricted;
    const newRolesJson    = JSON.stringify(allowed_roles);

    await query(
      `UPDATE mine_plans SET allowed_roles=?, is_restricted=?, updated_at=datetime('now') WHERE id=?`,
      [newRolesJson, newIsRestricted ? 1 : 0, id]
    );

    // Full audit trail — record old + new values
    await query(
      `INSERT INTO audit_logs
         (id,user_id,action,entity_type,entity_id,old_values,new_values,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        uuidv4(), req.user.id,
        'UPDATE_ACCESS', 'mine_plan', id,
        JSON.stringify({ allowed_roles: oldRoles, is_restricted: plan.is_restricted }),
        JSON.stringify({ allowed_roles,             is_restricted: newIsRestricted }),
        `Access settings updated for plan: ${plan.plan_title} — roles: [${allowed_roles.join(', ')}]`,
        plan.mine_id, req.ip,
      ]
    );

    await logRbacEvent({
      planId: id, userId: req.user.id,
      action: 'update_access', result: 'allowed', reason: 'access_manager',
      req, mineId: plan.mine_id,
      description: `Access updated for plan: ${plan.plan_title} — granted: [${allowed_roles.join(', ')}], revoked: [${oldRoles.filter(r => !allowed_roles.includes(r)).join(', ')}]`,
    });

    const updated = (await query(
      'SELECT id, plan_title, is_restricted, allowed_roles FROM mine_plans WHERE id=?',
      [id]
    )).rows[0];

    res.json({
      success: true,
      message: 'Access settings updated successfully.',
      data: {
        plan_id:       updated.id,
        plan_title:    updated.plan_title,
        is_restricted: !!updated.is_restricted,
        allowed_roles: JSON.parse(updated.allowed_roles || '[]'),
        granted:       allowed_roles.filter(r => !oldRoles.includes(r)),
        revoked:       oldRoles.filter(r => !allowed_roles.includes(r)),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   COMPARE VERSIONS — diff two versions of the same plan type
   ════════════════════════════════════════════════════════════════════════════ */
exports.compareVersions = async (req, res, next) => {
  try {
    const { id, otherId } = req.params;

    const [a, b] = await Promise.all([
      query('SELECT * FROM mine_plans WHERE id=?', [id]).then(r => r.rows[0]),
      query('SELECT * FROM mine_plans WHERE id=?', [otherId]).then(r => r.rows[0]),
    ]);

    if (!a || !b)
      return res.status(404).json({ success: false, message: 'One or both plans not found' });

    // RBAC: check access to both plans
    const accessA = checkPlanAccess(a, req.user);
    const accessB = checkPlanAccess(b, req.user);

    if (!accessA.allowed || !accessB.allowed) {
      const denied = !accessA.allowed ? a : b;
      await logRbacEvent({
        planId: denied.id, userId: req.user.id,
        action: 'compare', result: 'denied', reason: 'access_denied_on_one_plan',
        req, mineId: denied.mine_id,
        description: `Compare denied — no access to plan: ${denied.plan_title}`,
      });
      return res.status(403).json({
        success: false,
        code:    'MINE_PLAN_ACCESS_DENIED',
        message: 'Access Denied — You are not authorized to compare one or both of these restricted plans.',
      });
    }

    // Build diff of OCR-extracted data fields
    const ocrA = (() => { try { return JSON.parse(a.ocr_extracted_data || '{}'); } catch { return {}; } })();
    const ocrB = (() => { try { return JSON.parse(b.ocr_extracted_data || '{}'); } catch { return {}; } })();

    const fields = ['mine_name', 'plan_type', 'seams', 'shafts', 'panels', 'levels',
                    'scale', 'date_on_plan', 'authority', 'drawing_number', 'summary'];
    const diff = {};
    for (const f of fields) {
      const vA = ocrA[f] ?? null;
      const vB = ocrB[f] ?? null;
      const changed = JSON.stringify(vA) !== JSON.stringify(vB);
      diff[f] = { plan_a: vA, plan_b: vB, changed };
    }

    // Metadata diff
    const metaDiff = {
      version_number:    { plan_a: a.version_number,   plan_b: b.version_number,   changed: a.version_number  !== b.version_number  },
      approval_status:   { plan_a: a.approval_status,  plan_b: b.approval_status,  changed: a.approval_status !== b.approval_status },
      file_size:         { plan_a: a.file_size,         plan_b: b.file_size,        changed: a.file_size       !== b.file_size        },
      is_current_version:{ plan_a: a.is_current_version, plan_b: b.is_current_version, changed: a.is_current_version !== b.is_current_version },
      uploaded_by:       { plan_a: a.uploaded_by,      plan_b: b.uploaded_by,      changed: a.uploaded_by     !== b.uploaded_by      },
      created_at:        { plan_a: a.created_at,        plan_b: b.created_at,       changed: false },
    };

    await logAccess(id, req.user.id, 'compare', req);

    res.json({
      success: true,
      data: {
        plan_a:    { id: a.id, plan_title: a.plan_title, version_number: a.version_number, created_at: a.created_at },
        plan_b:    { id: b.id, plan_title: b.plan_title, version_number: b.version_number, created_at: b.created_at },
        meta_diff: metaDiff,
        ocr_diff:  diff,
        changed_fields_count: Object.values(diff).filter(d => d.changed).length,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   SEARCH PLANS — full-text search across OCR-extracted data
   ════════════════════════════════════════════════════════════════════════════ */
exports.searchPlans = async (req, res, next) => {
  try {
    const { q, mine_id, plan_type, page = 1, limit = 20 } = req.query;
    if (!q || q.trim().length < 2)
      return res.status(400).json({ success: false, message: 'Query parameter q is required (min 2 chars)' });

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const term = `%${q.trim()}%`;
    const conds = [
      `(mp.plan_title LIKE ? OR mp.ocr_extracted_data LIKE ? OR m.name LIKE ?)`
    ];
    const params = [term, term, term];

    if (mine_id)   { conds.push('mp.mine_id = ?');   params.push(mine_id); }
    if (plan_type) { conds.push('mp.plan_type = ?'); params.push(plan_type); }

    // RBAC filter — same as getAll
    if (req.user.role !== 'admin') {
      conds.push(`(mp.is_restricted = 0 OR (mp.is_restricted = 1 AND mp.allowed_roles LIKE ?))`);
      params.push(`%"${req.user.role}"%`);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    const total = (await query(
      `SELECT COUNT(*) as c FROM mine_plans mp JOIN mines m ON mp.mine_id=m.id ${where}`,
      params
    )).rows[0].c;

    const rows = (await query(
      `SELECT mp.id, mp.plan_title, mp.plan_type, mp.version_number, mp.approval_status,
              mp.is_restricted, mp.is_current_version, mp.created_at,
              mp.ocr_confidence, mp.allowed_roles,
              m.name AS mine_name, m.state AS mine_state,
              u.full_name AS uploaded_by_name
       FROM mine_plans mp
       JOIN  mines m     ON mp.mine_id     = m.id
       LEFT JOIN users u ON mp.uploaded_by = u.id
       ${where}
       ORDER BY mp.is_current_version DESC, mp.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    )).rows;

    const annotated = rows.map(plan => {
      const access = checkPlanAccess(plan, req.user);
      return { ...plan, _access: { can_view: access.allowed, can_download: access.allowed && access.permissions?.download } };
    });

    res.json({
      success: true,
      data:    annotated,
      query:   q,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   DASHBOARD STATS — summary card data
   ════════════════════════════════════════════════════════════════════════════ */
exports.getDashboardStats = async (req, res, next) => {
  try {
    const mf = req.user.role === 'mine_manager' && req.user.mine_id
      ? `AND mp.mine_id = '${req.user.mine_id}'`
      : '';

    const [total, pending, approved, current, underground] = await Promise.all([
      query(`SELECT COUNT(*) as c FROM mine_plans mp WHERE 1=1 ${mf}`),
      query(`SELECT COUNT(*) as c FROM mine_plans mp WHERE approval_status='pending_review' ${mf}`),
      query(`SELECT COUNT(*) as c FROM mine_plans mp WHERE approval_status='approved' ${mf}`),
      query(`SELECT COUNT(*) as c FROM mine_plans mp WHERE is_current_version=1 ${mf}`),
      query(`SELECT COUNT(*) as c FROM mines WHERE LOWER(type) LIKE '%underground%'`),
    ]);

    res.json({
      success: true,
      data: {
        total_plans:           parseInt(total.rows[0].c),
        pending_review:        parseInt(pending.rows[0].c),
        approved_plans:        parseInt(approved.rows[0].c),
        current_versions:      parseInt(current.rows[0].c),
        underground_mines:     parseInt(underground.rows[0].c),
      },
    });
  } catch (err) { next(err); }
};
