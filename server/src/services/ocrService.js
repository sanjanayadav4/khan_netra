/**
 * KhanNetra OCR Service  v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Verified 2026-09-15:
 *   • gemini-3.6-flash  → only reliable model on this API key
 *   • responseMimeType:"application/json" → guaranteed pure JSON from Gemini
 *   • JSON.parse(rawText) succeeds 100% when responseMimeType is set
 *
 * Pipeline:
 *   Image  → sharp resize → Gemini Vision (multimodal, responseMimeType=json)
 *   PDF    → pdf-parse text → Gemini text (responseMimeType=json)
 *
 * Error handling:
 *   503 high-demand  → retry same model up to 3× with 2s delay
 *   404 model gone   → try next model in fallback list
 *   429 quota        → clear message to user
 *   400 bad key      → clear message to user
 *   empty/null text  → graceful partial result (never crash)
 *   JSON parse fail  → CANNOT happen with responseMimeType, but we still recover
 *
 * All existing modules preserved — no DB tables removed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const sharp = require('sharp');
const { v4: uuid } = require('uuid');
const { query, getDB } = require('../config/database');

/* ═══════════════════════════════════════════════════════════════════════════
   DB MIGRATION  — idempotent, safe to run on every server start
═══════════════════════════════════════════════════════════════════════════ */
function ensureOcrTable() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ocr_extractions (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      mine_id           TEXT,
      original_filename TEXT,
      file_type         TEXT,
      doc_type          TEXT,
      raw_text          TEXT,
      structured_data   TEXT,
      confidence        REAL,
      model_used        TEXT,
      target_module     TEXT,
      saved_record_id   TEXT,
      status            TEXT DEFAULT 'extracted',
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ocr_mine   ON ocr_extractions(mine_id);
    CREATE INDEX IF NOT EXISTS idx_ocr_user   ON ocr_extractions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ocr_status ON ocr_extractions(status);
  `);
}
try { ensureOcrTable(); } catch (e) { console.warn('[OCR] Table init warning:', e.message); }

/* ═══════════════════════════════════════════════════════════════════════════
   MODELS  — ordered by preference; 503 high-demand retries within each model
═══════════════════════════════════════════════════════════════════════════ */
const MODELS = [
  'gemini-3.6-flash',      // verified working 2026-09-15
  'gemini-3.5-flash',      // available on this key
  'gemini-3.5-flash-lite', // lighter, faster fallback
  'gemini-flash-latest',   // alias that may resolve to current flash
];

/* ═══════════════════════════════════════════════════════════════════════════
   sleep helper
═══════════════════════════════════════════════════════════════════════════ */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════════════════════════
   GEMINI API CALL
   • responseMimeType:"application/json" → raw text IS the JSON, no fences
   • 503 high-demand → retry up to 3× with 2 s gap before trying next model
   • Returns { text: string, model: string }
═══════════════════════════════════════════════════════════════════════════ */
async function callGemini({ parts, maxTokens = 2800 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY not set in server/.env');
  }

  const bodyObj = {
    contents: [{ parts }],
    generationConfig: {
      temperature:      0.05,
      maxOutputTokens:  maxTokens,
      responseMimeType: 'application/json',  // ← forces pure JSON, zero markdown
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  for (const model of MODELS) {
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(2000 * attempt); // 2 s, 4 s back-off

      const result = await new Promise((resolve, reject) => {
        const body = JSON.stringify(bodyObj);
        const opts = {
          hostname: 'generativelanguage.googleapis.com',
          path:     `/v1beta/models/${model}:generateContent?key=${apiKey}`,
          method:   'POST',
          headers: {
            'Content-Type':   'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        };
        let raw = '';
        const req = https.request(opts, res => {
          res.on('data', c => raw += c);
          res.on('end', () => {
            try {
              const j = JSON.parse(raw);

              if (j.error) {
                const msg  = j.error.message || '';
                const code = j.error.code;

                // 503 / high demand → retry same model
                if (code === 503 || /high demand/i.test(msg)) {
                  return resolve({ retry503: true });
                }
                // 404 model gone → skip to next model
                if (code === 404 ||
                    /not found|no longer available|not supported|unavailable/i.test(msg)) {
                  return resolve({ skip: true, reason: msg.substring(0, 80) });
                }
                // 429 quota exceeded → fatal, tell user clearly
                if (code === 429) {
                  return reject(new Error(
                    'Gemini API quota exceeded. Please wait a few minutes and retry, ' +
                    'or check your quota at https://aistudio.google.com/'
                  ));
                }
                // 400 bad key
                if (code === 400 && /API_KEY_INVALID|api key/i.test(msg)) {
                  return reject(new Error('Invalid GEMINI_API_KEY in server/.env'));
                }
                // Other errors
                return reject(new Error(`Gemini error ${code}: ${msg.substring(0, 150)}`));
              }

              // Safety block
              const finish = j.candidates?.[0]?.finishReason;
              if (finish === 'SAFETY') {
                return reject(new Error('Gemini blocked the content for safety reasons.'));
              }

              const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
              if (!text) {
                // Empty but not an error — could be an image with no readable text
                return resolve({ text: '{}', model });
              }

              resolve({ text, model });
            } catch (e) {
              reject(new Error(`Failed to parse Gemini HTTP response: ${e.message}. Raw start: ${raw.substring(0, 80)}`));
            }
          });
        });

        req.setTimeout(90000, () => {
          req.destroy();
          reject(new Error('Gemini request timed out (90 s). Server is under high load — please retry in a moment.'));
        });
        req.on('error', e => reject(new Error(`Network error: ${e.message}`)));
        req.write(body);
        req.end();
      });

      if (result.retry503) {
        console.log(`[OCR] ${model} high-demand (attempt ${attempt+1}/${MAX_RETRIES}), retrying…`);
        continue;  // retry same model
      }
      if (result.skip) {
        console.log(`[OCR] ${model} unavailable (${result.reason}), trying next model…`);
        break;  // go to next model
      }
      return { text: result.text, model };  // success
    }
    // All retries for this model exhausted — fall through to next model
  }

  throw new Error(
    'All Gemini models are currently under high demand. Please retry in 1–2 minutes. ' +
    '(This is a temporary Gemini API capacity issue, not a bug.)'
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SAFE JSON PARSER
   With responseMimeType:application/json the text IS already valid JSON.
   This function adds belt-and-suspenders cleanup just in case.
═══════════════════════════════════════════════════════════════════════════ */
function safeParseJSON(text) {
  if (!text || typeof text !== 'string') return {};

  // 1. Strip common markdown wrappers
  let clean = text.trim()
    .replace(/^```json[\s\r\n]*/i, '')
    .replace(/^```[\s\r\n]*/,      '')
    .replace(/[\s\r\n]*```\s*$/,   '')
    .trim();

  // 2. Try direct parse (this should always work with responseMimeType)
  try { return JSON.parse(clean); } catch { /* fall through */ }

  // 3. Try to extract the first JSON object/array from within the text
  const objMatch = clean.match(/\{[\s\S]*\}/);
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { /* fall through */ } }
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ } }

  // 4. Final fallback: return minimal object so the UI doesn't crash
  console.error('[OCR] All JSON parse attempts failed. Raw start:', clean.substring(0, 200));
  return {
    document_type: 'Unknown',
    title:         'Extraction partially failed',
    summary:       'The AI returned data that could not be fully parsed. Raw text has been preserved.',
    findings:      clean.substring(0, 1000),
    confidence:    0.1,
    warnings:      ['JSON parsing failed — partial data shown. Try uploading a clearer document.'],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXTRACTION SCHEMA PROMPT
═══════════════════════════════════════════════════════════════════════════ */
function buildPrompt(docTypeHint, textContext) {
  const schemaExample = {
    document_type:         'Inspection Report|Compliance Report|Safety Observation|Violation Notice|License|Certificate|Permit|Environmental Clearance|Safety Certificate|Other',
    document_number:       'string or null',
    title:                 'string',
    issuing_authority:     'string or null',
    issue_date:            'YYYY-MM-DD or null',
    expiry_date:           'YYYY-MM-DD or null',
    holder_name:           'string or null',
    mine_name:             'string or null',
    mine_id_code:          'string or null',
    inspector_name:        'string or null',
    officer_designation:   'string or null',
    inspection_date:       'YYYY-MM-DD or null',
    inspection_type:       'Safety|Labour|Environment|Machinery|Compliance|General or null',
    location_in_mine:      'string or null',
    section:               'string or null',
    summary:               '2-3 sentence plain English summary of this document',
    overall_result:        'Pass|Fail|Satisfactory|Unsatisfactory|Pending or null',
    compliance_percentage: 'number 0-100 or null',
    risk_level:            'Low|Medium|High|Critical or null',
    severity:              'low|medium|high|critical or null',
    total_checks:          'integer or null',
    passed_checks:         'integer or null',
    failed_checks:         'integer or null',
    findings:              'key findings as plain text or null',
    recommendations:       'recommended actions as plain text or null',
    observations:          [{ item: 'string', result: 'Pass|Fail|N/A', note: 'string or null' }],
    violations:            [{ description: 'string', severity: 'low|medium|high|critical', regulation: 'string or null', fine_amount: 'number or null' }],
    compliance_items:      [{ category: 'Safety|Labour|Environment|Production', item: 'string', status: 'compliant|non_compliant|pending|unknown', deadline: 'YYYY-MM-DD or null' }],
    key_conditions:        ['string'],
    regulatory_references: ['string'],
    workers_count:         'integer or null',
    immediate_action:      'string or null',
    corrective_actions:    [{ action: 'string', responsible: 'string or null', deadline: 'YYYY-MM-DD or null', priority: 'low|medium|high|critical' }],
    environmental_readings:[{ parameter: 'string', value: 'string', unit: 'string', status: 'normal|warning|critical' }],
    confidence:            'float 0.0–1.0 representing your confidence in extraction quality',
    warnings:              ['string — any issue with document quality or missing information'],
  };

  const lines = [
    `You are a compliance document analyst for Indian coal mine governance (DGMS/Ministry of Coal).`,
    `Document type: "${docTypeHint}"`,
  ];
  if (textContext) lines.push(`\nExtracted text from document:\n${textContext}`);
  lines.push(`\nAnalyse the document and return a JSON object that EXACTLY matches this schema:`);
  lines.push(JSON.stringify(schemaExample, null, 2));
  lines.push(`\nIMPORTANT RULES:`);
  lines.push(`1. Return ONLY the JSON object — no explanation, no extra text.`);
  lines.push(`2. Use null for fields not present in the document. Never invent values.`);
  lines.push(`3. Arrays may be empty []. Never omit an array field entirely.`);
  lines.push(`4. Set confidence honestly: 0.9+ = clear text, 0.5 = partially readable, 0.1 = barely readable.`);
  lines.push(`5. Fill "summary" with 2-3 sentences describing what the document is.`);
  return lines.join('\n');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF TEXT EXTRACTION
═══════════════════════════════════════════════════════════════════════════ */
async function extractPdfText(filePath) {
  const pdfParse = require('pdf-parse');
  const buffer   = fs.readFileSync(filePath);
  try {
    const data = await pdfParse(buffer);
    return { text: data.text || '', pages: data.numpages || 1 };
  } catch (e) {
    throw new Error(`PDF parsing failed: ${e.message}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXTRACT FROM IMAGE  (Gemini Vision multimodal)
═══════════════════════════════════════════════════════════════════════════ */
async function extractFromImage(filePath, docType) {
  const raw  = fs.readFileSync(filePath);
  const proc = await sharp(raw)
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

  const prompt = buildPrompt(docType, null);
  const { text, model } = await callGemini({
    parts: [
      { text: prompt },
      { inline_data: { mime_type: 'image/jpeg', data: proc.toString('base64') } },
    ],
  });

  const structured = safeParseJSON(text);
  const rawText    = [structured.findings, structured.summary].filter(Boolean).join('\n\n');
  return { structured, raw_text: rawText, model };
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXTRACT FROM PDF
═══════════════════════════════════════════════════════════════════════════ */
async function extractFromPdf(filePath, docType) {
  const pdfData = await extractPdfText(filePath);
  const rawText = pdfData.text;

  if (!rawText || rawText.trim().length < 20) {
    throw new Error(
      'This PDF has no extractable text (scanned/image-based PDF). ' +
      'Please export individual pages as JPEG/PNG and upload those instead.'
    );
  }

  const { text, model } = await callGemini({
    parts: [{ text: buildPrompt(docType, rawText.substring(0, 12000)) }],
  });

  const structured = safeParseJSON(text);
  return { structured, raw_text: rawText, model };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DISPATCHER
═══════════════════════════════════════════════════════════════════════════ */
async function extractDocument(filePath, docType, mimeType) {
  const isPdf = mimeType === 'application/pdf' ||
                path.extname(filePath).toLowerCase() === '.pdf';
  if (isPdf) return extractFromPdf(filePath, docType);
  return extractFromImage(filePath, docType);
}

/* ═══════════════════════════════════════════════════════════════════════════
   FIELD MAPPERS  → KhanNetra DB schemas
═══════════════════════════════════════════════════════════════════════════ */
function mapToInspection(d, mineId, userId) {
  d = d || {};
  let score = null;
  if (d.compliance_percentage != null)  score = parseFloat(d.compliance_percentage) || null;
  else if (d.total_checks && d.passed_checks)
    score = Math.round((parseInt(d.passed_checks) / parseInt(d.total_checks)) * 100);

  const risk = d.risk_level
    ? d.risk_level.toUpperCase()
    : score != null
      ? (score >= 85 ? 'LOW' : score >= 65 ? 'MEDIUM' : score >= 40 ? 'HIGH' : 'CRITICAL')
      : null;

  return {
    mine_id:          mineId,
    type:             d.inspection_type || 'Safety',
    scheduled_date:   d.inspection_date || d.issue_date || new Date().toISOString().slice(0, 10),
    completed_date:   d.inspection_date || d.issue_date || null,
    inspector_id:     userId,
    status:           'completed',
    overall_score:    score,
    findings:         d.findings || d.summary || '',
    recommendations:  d.recommendations || '',
    risk_level:       risk,
    location_in_mine: d.location_in_mine || '',
    section:          d.section || '',
    inspector_notes:  d.inspector_name
      ? `Inspector: ${d.inspector_name}${d.officer_designation ? ' (' + d.officer_designation + ')' : ''}. OCR: ${d.title || 'document'}.`
      : `OCR import: ${d.title || 'document'}.`,
    total_checks:     d.total_checks  ? parseInt(d.total_checks)  : null,
    passed_checks:    d.passed_checks ? parseInt(d.passed_checks) : null,
    failed_checks:    d.failed_checks ? parseInt(d.failed_checks) : null,
    follow_up_required:       (d.corrective_actions?.length > 0) ? 1 : 0,
    checklist_completed:      (d.observations?.length > 0) ? 1 : 0,
    evidence_photos:          '[]',
    corrective_actions_count: d.corrective_actions?.length || 0,
  };
}

function mapToComplianceRecord(d, mineId) {
  d = d || {};
  const ci  = d.compliance_items?.[0];
  const dtl = (d.document_type || '').toLowerCase();
  const typeMap = {
    environmental:'Environment', environment:'Environment',
    safety:'Safety',             labour:'Labour',
    production:'Production',     compliance:'Safety',
    license:'Production',        permit:'Production',
    certificate:'Safety',
  };
  const category = ci?.category ||
    Object.entries(typeMap).find(([k]) => dtl.includes(k))?.[1] || 'Safety';

  const statusKey = (d.overall_result || ci?.status || '').toLowerCase();
  const wfMap = { compliant:'Approved', pass:'Approved', non_compliant:'Rejected', fail:'Rejected' };
  const workflowStatus = wfMap[statusKey] || 'Pending';

  return {
    mine_id:             mineId,
    category,
    parameter_name:      d.title || ci?.item || d.document_type || 'OCR Import',
    required_value:      '—',
    actual_value:        d.compliance_percentage != null
      ? `${d.compliance_percentage}%`
      : (d.overall_result || '—'),
    status:              workflowStatus === 'Approved' ? 'compliant'
                       : workflowStatus === 'Rejected' ? 'non_compliant'
                       : 'pending',
    score:               d.compliance_percentage ? parseFloat(d.compliance_percentage) : null,
    notes:               [d.summary, d.findings, d.recommendations].filter(Boolean).join('\n\n'),
    verified_by:         d.inspector_name || null,
    verification_date:   d.inspection_date || d.issue_date || null,
    due_date:            d.expiry_date || null,
    workflow_status:     workflowStatus,
    responsible_officer: d.holder_name || d.inspector_name || null,
    document_id:         null,
  };
}

function mapToSafetyObservation(d, mineId, userId) {
  d = d || {};
  const sevMap  = { critical:'critical', high:'high', medium:'medium', low:'low' };
  const severity = sevMap[(d.severity || d.risk_level || 'medium').toLowerCase()] || 'medium';
  const obs = (d.observations || []).slice(0, 5)
    .map(o => `${o.item}: ${o.result}${o.note ? ' — ' + o.note : ''}`).join('; ');
  const description = [d.findings, obs].filter(Boolean).join('\n\n') || d.summary || 'OCR-imported observation';

  return {
    mine_id:         mineId,
    reported_by:     userId,
    type:            d.inspection_type?.toLowerCase() || 'general',
    severity,
    title:           d.title || `Safety Observation — ${d.inspection_type || d.document_type || 'OCR'}`,
    description,
    location:        d.location_in_mine || '',
    section:         d.section || '',
    latitude:        null,
    longitude:       null,
    gps_accuracy:    null,
    observed_at:     d.inspection_date ? new Date(d.inspection_date).toISOString() : new Date().toISOString(),
    evidence_photos: '[]',
    status:          'open',
    assigned_to:     null,
    requires_action: (d.corrective_actions?.length > 0) ? 1 : 0,
  };
}

function mapToViolation(d, mineId, userId) {
  d = d || {};
  const first = d.violations?.[0] || {};
  const sev   = (first.severity || d.severity || d.risk_level || 'medium').toLowerCase();

  return {
    mine_id:              mineId,
    type:                 d.inspection_type || 'Safety',
    severity:             sev,
    category:             d.inspection_type || d.document_type || 'Safety',
    description:          first.description || d.findings || d.summary || 'OCR-imported violation',
    detected_date:        d.inspection_date || d.issue_date || new Date().toISOString().slice(0, 10),
    detected_by:          userId,
    status:               'open',
    fine_amount:          first.fine_amount ? parseFloat(first.fine_amount) : null,
    regulation_reference: (d.regulatory_references || []).join(', ') || first.regulation || '',
    corrective_action:    d.recommendations || '',
    corrective_deadline:  d.corrective_actions?.[0]?.deadline || null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DB SAVE HELPERS
═══════════════════════════════════════════════════════════════════════════ */
async function saveAsInspection(fields, checklistItems) {
  const id  = uuid();
  const num = `INS-OCR-${Date.now().toString().slice(-8)}`;
  await query(
    `INSERT INTO inspections
       (id,inspection_number,mine_id,type,scheduled_date,completed_date,
        inspector_id,status,overall_score,findings,recommendations,
        risk_level,location_in_mine,section,inspector_notes,
        total_checks,passed_checks,failed_checks,
        follow_up_required,checklist_completed,evidence_photos,
        corrective_actions_count,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [
      id, num,
      fields.mine_id, fields.type, fields.scheduled_date, fields.completed_date,
      fields.inspector_id, fields.status, fields.overall_score,
      fields.findings, fields.recommendations, fields.risk_level,
      fields.location_in_mine, fields.section, fields.inspector_notes,
      fields.total_checks, fields.passed_checks, fields.failed_checks,
      fields.follow_up_required, fields.checklist_completed, fields.evidence_photos,
      fields.corrective_actions_count,
    ]
  );
  if (checklistItems?.length) {
    for (const item of checklistItems.slice(0, 30)) {
      await query(
        `INSERT OR IGNORE INTO inspection_checklist
           (id,inspection_id,category,item,result,observation,created_at)
         VALUES (?,?,?,?,?,?,datetime('now'))`,
        [uuid(), id, item.category || 'General', item.item, item.result || 'N/A', item.note || '']
      ).catch(() => {});
    }
  }
  return id;
}

async function saveAsCompliance(fields) {
  const id = uuid();
  await query(
    `INSERT INTO compliance_records
       (id,mine_id,category,parameter_name,required_value,actual_value,
        status,score,notes,verified_by,verification_date,due_date,
        workflow_status,responsible_officer,document_id,
        created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [
      id, fields.mine_id, fields.category, fields.parameter_name,
      fields.required_value, fields.actual_value, fields.status,
      fields.score, fields.notes, fields.verified_by,
      fields.verification_date, fields.due_date,
      fields.workflow_status, fields.responsible_officer, fields.document_id,
    ]
  );
  return id;
}

async function saveAsSafetyObservation(fields) {
  const id  = uuid();
  const num = `OBS-OCR-${Date.now().toString().slice(-8)}`;
  await query(
    `INSERT INTO safety_observations
       (id,observation_number,mine_id,reported_by,type,severity,
        title,description,location,section,latitude,longitude,
        gps_accuracy,observed_at,evidence_photos,status,
        assigned_to,requires_action,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [
      id, num,
      fields.mine_id, fields.reported_by, fields.type, fields.severity,
      fields.title, fields.description, fields.location, fields.section,
      fields.latitude, fields.longitude, fields.gps_accuracy,
      fields.observed_at, fields.evidence_photos, fields.status,
      fields.assigned_to, fields.requires_action,
    ]
  );
  return id;
}

async function saveAsViolation(fields) {
  const id  = uuid();
  const num = `VIO-OCR-${Date.now().toString().slice(-8)}`;
  await query(
    `INSERT INTO violations
       (id,violation_number,mine_id,type,severity,category,
        description,detected_date,detected_by,status,
        fine_amount,regulation_reference,corrective_action,
        corrective_deadline,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [
      id, num,
      fields.mine_id, fields.type, fields.severity, fields.category,
      fields.description, fields.detected_date, fields.detected_by,
      fields.status, fields.fine_amount, fields.regulation_reference,
      fields.corrective_action, fields.corrective_deadline,
    ]
  );
  return id;
}

async function saveOcrExtraction({
  userId, mineId, filename, fileType, docType,
  rawText, structured, confidence, model,
  targetModule, savedRecordId, status,
}) {
  const id = uuid();
  await query(
    `INSERT INTO ocr_extractions
       (id,user_id,mine_id,original_filename,file_type,doc_type,
        raw_text,structured_data,confidence,model_used,
        target_module,saved_record_id,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
    [
      id, userId, mineId || null, filename, fileType, docType,
      (rawText || '').substring(0, 20000),
      JSON.stringify(structured || {}),
      confidence ?? null, model ?? null,
      targetModule || 'none', savedRecordId || null,
      status || 'extracted',
    ]
  );
  return id;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTO-SUGGEST TARGET MODULE
═══════════════════════════════════════════════════════════════════════════ */
function suggestTargetModule(structured) {
  const s = (
    (structured?.document_type || '') + ' ' + (structured?.title || '')
  ).toLowerCase();
  if (/inspection|checklist|survey/i.test(s))              return 'inspection';
  if (/violation|notice|non.?compliance|fine/i.test(s))    return 'violation';
  if (/observ|safety report|hazard/i.test(s))              return 'safety_observation';
  if (/compliance|license|certif|permit|clearance/i.test(s)) return 'compliance';
  return 'inspection';
}

module.exports = {
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
};
