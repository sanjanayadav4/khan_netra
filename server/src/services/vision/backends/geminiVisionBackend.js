/**
 * KhanNetra PPE Vision — Gemini Vision Backend
 *
 * Uses Google Gemini Vision to analyse mine-worker images for PPE compliance.
 * Returns a normalised DetectionResult.
 *
 * To swap for a local YOLO model: set MODEL_BACKEND=yolo_onnx in .env.
 */

'use strict';

const https = require('https');
const { PPE_ITEMS } = require('../ppeConfig');

/* ── Model fallback list (newest capable → stable) ───────────────────────── */
// Order: try most capable first, fall back to stable if unavailable.
// Model names come from Gemini's own deprecation messages (Sep 2026).
const FALLBACK_MODELS = [
  'gemini-3.6-flash',       // latest recommended by Gemini API deprecation notice
  'gemini-2.5-flash',       // still available via v1beta
  'gemini-2.5-flash-lite',  // lite variant
  'gemini-3.5-flash-lite',  // recommended replacement for 2.0-flash-lite
];

/* ── System instruction ───────────────────────────────────────────────────── */
const SYSTEM_INSTRUCTION = `You are an AI safety compliance system for Indian coal mines, built for the Directorate General of Mines Safety (DGMS). You analyse images and return ONLY valid JSON with no extra text.`;

/* ── Detection prompt ─────────────────────────────────────────────────────── */
const buildPrompt = () => `Analyse the image and identify all mine workers and their PPE (Personal Protective Equipment).

PPE item IDs to detect (use EXACTLY these IDs, lowercase):
  helmet            = hard hat / mining helmet
  safety_vest       = hi-vis vest or reflective jacket
  safety_boots      = safety boots / gumboots
  goggles           = safety goggles / face shield / eye protection
  gloves            = safety gloves (any colour)
  ear_protection    = earmuffs or earplugs
  respiratory_mask  = dust mask / N95 / respirator
  safety_lamp       = mine cap lamp or hand-held safety lamp

Rules:
- DO NOT identify faces, identities, race, gender or age.
- Return ONLY valid JSON. No markdown fences, no prose, no explanation.
- If no workers visible, return an empty workers array.
- Confidence scores must be 0.0–1.0.
- Only list a PPE item in detected_ppe if confidence > 0.40.

Respond with this exact JSON structure (no other text before or after):
{
  "scene_description": "one sentence about the scene, no identity details",
  "lighting_quality": "good",
  "worker_count": 1,
  "workers": [
    {
      "worker_id": 1,
      "position_in_frame": "center",
      "visibility": "full",
      "detected_ppe": ["helmet", "safety_vest"],
      "confidence_scores": {
        "helmet": 0.95,
        "safety_vest": 0.88,
        "safety_boots": 0.0,
        "goggles": 0.0,
        "gloves": 0.0,
        "ear_protection": 0.0,
        "respiratory_mask": 0.0,
        "safety_lamp": 0.0
      }
    }
  ]
}`;

/* ── Gemini API call ──────────────────────────────────────────────────────── */
async function callGeminiVision(imageBase64, modelName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length < 10) {
    throw Object.assign(new Error('GEMINI_API_KEY not configured in server/.env'), { status: 503 });
  }

  const body = JSON.stringify({
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [{
      parts: [
        { text: buildPrompt() },
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data:      imageBase64,
          },
        },
      ],
    }],
    generationConfig: {
      temperature:     0.1,    // low = more deterministic JSON output
      maxOutputTokens: 2048,
      topP:            0.8,
      topK:            20,
      // Ask Gemini to return JSON directly when supported
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  });

  const apiPath = `/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path:     apiPath,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    let data = '';
    const req = https.request(options, (res) => {
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const msg       = json.error.message || 'Unknown Gemini error';
            const code      = json.error.code || 0;
            const retryable = /not found|not supported|no longer available|high demand|quota|overload/i.test(msg) || code === 404 || code === 429 || code === 503;
            return reject(Object.assign(new Error(msg), { retryable, geminiCode: code }));
          }
          json._model_used = modelName;
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed to parse Gemini API response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(Object.assign(new Error('Gemini API request timed out'), { retryable: true }));
    });
    req.write(body);
    req.end();
  });
}

/* ── Call with automatic model fallback ──────────────────────────────────── */
async function callWithFallback(imageBase64) {
  let lastError = null;

  for (const modelName of FALLBACK_MODELS) {
    try {
      console.log(`[PPE Vision] Trying model: ${modelName}`);
      const result = await callGeminiVision(imageBase64, modelName);
      console.log(`[PPE Vision] Success with model: ${modelName}`);
      return result;
    } catch (err) {
      lastError = err;
      if (err.retryable) {
        console.log(`[PPE Vision] Model ${modelName} unavailable (${err.message}), trying next...`);
        continue;
      }
      // Non-retryable error (bad API key, billing, etc.) — fail immediately
      throw err;
    }
  }

  // All models exhausted
  throw Object.assign(
    new Error(`Vision service unavailable. All Gemini models failed. Last error: ${lastError?.message}`),
    { status: 503 }
  );
}

/* ── Robust JSON extractor ────────────────────────────────────────────────── */
/**
 * Handles all the ways Gemini might wrap its response:
 *  1. Pure JSON (ideal, what responseMimeType: 'application/json' gives)
 *  2. ```json ... ``` markdown fence
 *  3. ``` ... ``` fence
 *  4. JSON embedded inside prose ("Here is the result: {...}")
 *  5. JSON with trailing commentary
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty response from Gemini Vision — no text returned');
  }

  let text = raw.trim();

  // 1. Direct parse (handles responseMimeType=application/json path)
  try {
    return JSON.parse(text);
  } catch { /* fall through */ }

  // 2. Strip markdown code fences  ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]); } catch { /* fall through */ }
  }

  // 3. Find the outermost { ... } block robustly (handles leading/trailing prose)
  const firstBrace = text.indexOf('{');
  const lastBrace  = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(candidate); } catch { /* fall through */ }
  }

  // 4. Try to find any JSON-like fragment with a regex (last resort)
  const regexMatch = text.match(/\{[\s\S]+\}/);
  if (regexMatch) {
    try { return JSON.parse(regexMatch[0]); } catch { /* fall through */ }
  }

  // Nothing worked — throw a useful error with a snippet of what was received
  const snippet = text.slice(0, 200).replace(/\n/g, ' ');
  throw new Error(
    `Could not parse Gemini Vision response as JSON. ` +
    `Model may have returned plain text instead of JSON. ` +
    `First 200 chars: "${snippet}"`
  );
}

/* ── Normalise a single worker record ────────────────────────────────────── */
function normaliseWorker(raw, workerId) {
  const validIds  = Object.keys(PPE_ITEMS);
  const rawScores = raw.confidence_scores || {};

  // Only keep IDs that are in our PPE catalogue
  const detectedPpe = (raw.detected_ppe || []).filter(id => validIds.includes(id));

  // Build a complete scores map for every PPE item
  const confidenceScores = {};
  for (const id of validIds) {
    const raw_score = rawScores[id];
    confidenceScores[id] = detectedPpe.includes(id)
      ? Math.round(Math.min(1, Math.max(0, parseFloat(raw_score) || 0.7)) * 100) / 100
      : 0;
  }

  return {
    worker_id:         workerId,
    position_in_frame: raw.position_in_frame || 'unknown',
    visibility:        raw.visibility        || 'full',
    detected_ppe:      detectedPpe,
    confidence_scores: confidenceScores,
    raw_detections:    raw,
  };
}

/* ── Main export ──────────────────────────────────────────────────────────── */
/**
 * Detect PPE in an image buffer.
 * @param {Buffer} imageBuffer  – JPEG buffer (pre-processed by detectionEngine)
 * @param {string} mimeType     – always 'image/jpeg' after preprocessing
 * @param {object} options      – { mine_type, min_confidence }
 * @returns {Promise<DetectionResult>}
 */
async function detect(imageBuffer, mimeType, options = {}) {
  const imageBase64 = imageBuffer.toString('base64');

  // Call Gemini with automatic model fallback
  let geminiResponse;
  try {
    geminiResponse = await callWithFallback(imageBase64);
  } catch (err) {
    // Surface a clean, user-facing message for service unavailability
    if (err.status === 503 || /unavailable|timeout|all gemini/i.test(err.message)) {
      throw Object.assign(
        new Error('Vision service unavailable. Please check your GEMINI_API_KEY and try again.'),
        { status: 503 }
      );
    }
    throw err;
  }

  const actualModel = geminiResponse._model_used || FALLBACK_MODELS[0];
  const candidate   = geminiResponse?.candidates?.[0];

  if (!candidate) {
    console.error('[PPE Vision] No candidate in Gemini response:', JSON.stringify(geminiResponse).slice(0, 300));
    throw new Error('Vision service returned no result. The image may be blocked by safety filters.');
  }

  // Blocked by safety filters?
  if (candidate.finishReason === 'SAFETY') {
    throw Object.assign(
      new Error('This image was blocked by content safety filters. Please use a clear, appropriate mine site photo.'),
      { status: 422 }
    );
  }

  const rawText = candidate?.content?.parts?.[0]?.text || '';
  console.log(`[PPE Vision] Model: ${actualModel} | Response length: ${rawText.length} chars`);

  // Parse — robust extraction handles all Gemini output formats
  let parsed;
  try {
    parsed = extractJSON(rawText);
  } catch (parseErr) {
    console.error('[PPE Vision] JSON parse failed:', parseErr.message);
    console.error('[PPE Vision] Raw text (first 500):', rawText.slice(0, 500));
    // Graceful fallback: treat as "no workers detected" rather than crashing
    parsed = {
      scene_description: 'Unable to parse detailed analysis.',
      lighting_quality:  'unknown',
      worker_count:      0,
      workers:           [],
    };
  }

  // Normalise each worker
  const minConf = parseFloat(options.min_confidence) || 0.40;
  const workers = (parsed.workers || []).map((w, i) => {
    const normalised = normaliseWorker(w, i + 1);
    // Apply min_confidence threshold — remove items below threshold
    normalised.detected_ppe = normalised.detected_ppe.filter(
      id => (normalised.confidence_scores[id] || 0) >= minConf
    );
    return normalised;
  });

  return {
    workers,
    scene_info: {
      description:  parsed.scene_description || 'Mine site image',
      lighting:     parsed.lighting_quality  || 'unknown',
      worker_count: parsed.worker_count      ?? workers.length,
    },
    model_info: {
      name:    actualModel,
      version: actualModel,
      backend: 'gemini_vision',
    },
  };
}

module.exports = { detect };
