/**
 * KhanNetra OCR Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoints:
 *   GET  /ocr/health         — service status
 *   POST /ocr/extract        — upload doc → extract text + structured fields
 *   POST /ocr/save           — save structured data into target module DB
 *   GET  /ocr/history        — list previous extractions for this user
 *   GET  /ocr/history/:id    — get one extraction record
 *   DELETE /ocr/history/:id  — discard an extraction record
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { query } = require('../config/database');
const {
  extractDocument,
  mapToInspection,
  mapToComplianceRecord,
  mapToSafetyObservation,
  mapToViolation,
  saveAsInspection,
  saveAsCompliance,
  saveAsSafetyObservation,
  saveAsViolation,
  saveOcrExtraction,
  suggestTargetModule,
} = require('../services/ocrService');

/* ─────────────────────────────────────────────────────────────────────────
   GET /ocr/health
──────────────────────────────────────────────────────────────────────── */
exports.health = (req, res) => {
  const hasKey = !!(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  );
  res.json({
    success:   true,
    service:   'KhanNetra OCR Document Digitization',
    backend:   'Gemini Vision + pdf-parse',
    configured: hasKey,
    supported_input: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    supported_output: ['inspection', 'compliance', 'safety_observation', 'violation'],
    max_file_size_mb: 15,
  });
};

/* ─────────────────────────────────────────────────────────────────────────
   POST /ocr/extract
   multipart/form-data: document (file), doc_type (string), mine_id (opt)
──────────────────────────────────────────────────────────────────────── */
exports.extractDocument = async (req, res, next) => {
  let tempPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Send a JPEG, PNG, WebP, or PDF in the "document" field.',
      });
    }

    tempPath              = req.file.path;
    const docType         = req.body.doc_type  || 'Unknown';
    const mineId          = req.body.mine_id   || null;
    const mimeType        = req.file.mimetype;
    const originalName    = req.file.originalname || 'document';

    // ── Run extraction ────────────────────────────────────────────────
    let structured, rawText, modelUsed;
    try {
      const result = await extractDocument(tempPath, docType, mimeType);
      structured = result.structured;
      rawText    = result.raw_text || '';
      modelUsed  = result.model   || 'gemini';
    } catch (extractErr) {
      // Return a partial result so the UI can still show what went wrong
      return res.status(422).json({
        success: false,
        message: extractErr.message,
        hint:    mimeType === 'application/pdf'
          ? 'For scanned PDFs (image-only), please convert to JPEG/PNG first.'
          : 'Ensure the image is clear, well-lit, and shows document text.',
      });
    }

    // ── Auto-detect best save target ──────────────────────────────────
    const suggestedModule = suggestTargetModule(structured);

    // ── Pre-compute field previews for each save target ───────────────
    const previews = {
      inspection:        mapToInspection(structured, mineId, req.user.id),
      compliance:        mapToComplianceRecord(structured, mineId, req.user.id),
      safety_observation:mapToSafetyObservation(structured, mineId, req.user.id),
      violation:         mapToViolation(structured, mineId, req.user.id),
    };

    // ── Persist extraction to DB ──────────────────────────────────────
    const extractionId = await saveOcrExtraction({
      userId:    req.user.id,
      mineId,
      filename:  originalName,
      fileType:  mimeType === 'application/pdf' ? 'pdf' : 'image',
      docType,
      rawText,
      structured,
      confidence: structured.confidence || null,
      model:     modelUsed,
      targetModule: suggestedModule,
      status:    'extracted',
    });

    // ── Audit log ─────────────────────────────────────────────────────
    await query(
      `INSERT INTO audit_logs
         (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuid(), req.user.id, 'OCR_EXTRACT', 'ocr_extraction', extractionId,
        `OCR: ${originalName} → ${structured.title || docType} (${Math.round((structured.confidence||0)*100)}% conf)`,
        mineId, req.ip,
      ]
    );

    res.json({
      success:          true,
      extraction_id:    extractionId,
      model_used:       modelUsed,
      file_type:        mimeType === 'application/pdf' ? 'pdf' : 'image',
      suggested_module: suggestedModule,
      data:             structured,
      raw_text:         rawText.substring(0, 5000), // cap for client
      previews,         // pre-mapped fields per module
    });
  } catch (err) {
    next(err);
  } finally {
    if (tempPath) { try { fs.unlinkSync(tempPath); } catch {} }
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   POST /ocr/save
   Body JSON: {
     extraction_id, target_module,
     fields (overridden/edited fields),
     mine_id
   }
──────────────────────────────────────────────────────────────────────── */
exports.saveExtraction = async (req, res, next) => {
  try {
    const { extraction_id, target_module, fields, mine_id } = req.body;

    if (!extraction_id || !target_module || !fields) {
      return res.status(400).json({
        success: false,
        message: 'extraction_id, target_module, and fields are required.',
      });
    }

    const validModules = ['inspection', 'compliance', 'safety_observation', 'violation'];
    if (!validModules.includes(target_module)) {
      return res.status(400).json({
        success: false,
        message: `Invalid target_module. Must be one of: ${validModules.join(', ')}`,
      });
    }

    // Ensure the extraction record exists and belongs to this user
    const extraction = (await query(
      `SELECT * FROM ocr_extractions WHERE id=? AND user_id=?`,
      [extraction_id, req.user.id]
    )).rows[0];

    if (!extraction) {
      return res.status(404).json({ success: false, message: 'Extraction record not found.' });
    }
    if (extraction.status === 'saved') {
      return res.status(409).json({
        success: false,
        message: 'This extraction has already been saved.',
        saved_record_id: extraction.saved_record_id,
        target_module:   extraction.target_module,
      });
    }

    // Inject mine_id from request if not already in fields
    const mId = mine_id || fields.mine_id || extraction.mine_id;
    if (!mId) {
      return res.status(400).json({
        success: false,
        message: 'mine_id is required to save records. Select a mine first.',
      });
    }
    fields.mine_id = mId;

    // ── Save to target module ─────────────────────────────────────────
    let savedId;
    let moduleName;
    switch (target_module) {
      case 'inspection':
        // Merge user edits with inspector_id
        fields.inspector_id = fields.inspector_id || req.user.id;
        savedId = await saveAsInspection(fields, fields._checklist_items || []);
        moduleName = 'Inspection';
        break;

      case 'compliance':
        savedId = await saveAsCompliance(fields);
        moduleName = 'Compliance Record';
        break;

      case 'safety_observation':
        fields.reported_by = fields.reported_by || req.user.id;
        savedId = await saveAsSafetyObservation(fields);
        moduleName = 'Safety Observation';
        break;

      case 'violation':
        fields.detected_by = fields.detected_by || req.user.id;
        savedId = await saveAsViolation(fields);
        moduleName = 'Violation';
        break;
    }

    // ── Update ocr_extractions record ─────────────────────────────────
    await query(
      `UPDATE ocr_extractions
         SET status='saved', target_module=?, saved_record_id=?, updated_at=datetime('now')
       WHERE id=?`,
      [target_module, savedId, extraction_id]
    );

    // ── Audit log ─────────────────────────────────────────────────────
    await query(
      `INSERT INTO audit_logs
         (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuid(), req.user.id, 'OCR_SAVE', target_module, savedId,
        `OCR save → ${moduleName} (from extraction ${extraction_id.slice(0,8)})`,
        mId, req.ip,
      ]
    );

    res.json({
      success:        true,
      message:        `Successfully saved as ${moduleName}.`,
      target_module,
      saved_record_id: savedId,
      extraction_id,
      navigate_to:    {
        inspection:         `/inspections`,
        compliance:         `/compliance`,
        safety_observation: `/safety-hub`,
        violation:          `/violations`,
      }[target_module],
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   GET /ocr/history
   Query params: page, limit, status, mine_id
──────────────────────────────────────────────────────────────────────── */
exports.getHistory = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    // Admins see all; others see only their own
    const isAdmin = ['admin', 'government_officer'].includes(req.user.role);
    const userFilter = isAdmin ? '' : `AND o.user_id = '${req.user.id}'`;
    const mineFilter = req.query.mine_id ? `AND o.mine_id = '${req.query.mine_id}'` : '';
    const statusFilter = req.query.status ? `AND o.status = '${req.query.status}'` : '';

    const rows = (await query(
      `SELECT o.id, o.original_filename, o.file_type, o.doc_type,
              o.confidence, o.model_used, o.target_module, o.saved_record_id,
              o.status, o.created_at,
              u.full_name as uploaded_by,
              m.name as mine_name,
              json_extract(o.structured_data, '$.title') as doc_title,
              json_extract(o.structured_data, '$.document_type') as doc_type_extracted,
              json_extract(o.structured_data, '$.summary') as summary
       FROM ocr_extractions o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN mines m ON o.mine_id = m.id
       WHERE 1=1 ${userFilter} ${mineFilter} ${statusFilter}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    )).rows;

    const total = (await query(
      `SELECT COUNT(*) as cnt FROM ocr_extractions o
       WHERE 1=1 ${userFilter} ${mineFilter} ${statusFilter}`
    )).rows[0]?.cnt || 0;

    res.json({
      success: true,
      data:    rows,
      meta:    { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────────────────────
   GET /ocr/history/:id
──────────────────────────────────────────────────────────────────────── */
exports.getExtractionById = async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'government_officer'].includes(req.user.role);
    const row = (await query(
      `SELECT o.*, u.full_name as uploaded_by, m.name as mine_name
       FROM ocr_extractions o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN mines m ON o.mine_id = m.id
       WHERE o.id=? ${isAdmin ? '' : `AND o.user_id='${req.user.id}'`}`,
      [req.params.id]
    )).rows[0];

    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });

    // Parse JSON fields
    try { row.structured_data = JSON.parse(row.structured_data); } catch {}

    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ─────────────────────────────────────────────────────────────────────────
   DELETE /ocr/history/:id
──────────────────────────────────────────────────────────────────────── */
exports.deleteExtraction = async (req, res, next) => {
  try {
    const row = (await query(
      `SELECT id FROM ocr_extractions WHERE id=? AND user_id=?`,
      [req.params.id, req.user.id]
    )).rows[0];

    if (!row) return res.status(404).json({ success: false, message: 'Not found.' });

    await query(
      `UPDATE ocr_extractions SET status='discarded', updated_at=datetime('now') WHERE id=?`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Extraction discarded.' });
  } catch (err) { next(err); }
};
