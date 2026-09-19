/**
 * KhanNetra AI Safety Vision — Detection Engine Adapter
 *
 * This module is the SINGLE SWAP POINT for the underlying detection model.
 * Current backend: Google Gemini Vision (no local model needed).
 * Future: Drop in a YOLO ONNX model by setting MODEL_BACKEND=yolo_onnx
 *         and placing the model file at the path in YOLO_MODEL_PATH.
 *
 * Contract: every backend must export a function with signature
 *   detect(imageBuffer, mimeType, options) → Promise<DetectionResult>
 *
 * DetectionResult shape:
 * {
 *   workers: [{
 *     worker_id: number,
 *     detected_ppe: string[],    // PPE item IDs present
 *     confidence_scores: { [itemId]: number },  // 0–1
 *     raw_detections: any        // backend-specific raw output
 *   }],
 *   image_meta: { width, height, format },
 *   model_info: { name, version, backend }
 * }
 */

'use strict';

const path  = require('path');
const sharp = require('sharp');

/* ── Load the correct backend ─────────────────────────────────────────────── */
const BACKEND = (process.env.MODEL_BACKEND || 'gemini').toLowerCase();

let _engine = null;

function getEngine() {
  if (_engine) return _engine;

  switch (BACKEND) {
    case 'yolo_onnx':
      _engine = require('./backends/yoloOnnxBackend');
      break;
    case 'openai_vision':
      _engine = require('./backends/openAiVisionBackend');
      break;
    case 'gemini':
    default:
      _engine = require('./backends/geminiVisionBackend');
  }

  console.log(`[PPE Vision] Detection engine loaded: ${BACKEND}`);
  return _engine;
}

/**
 * Pre-process the image before sending to the detection model.
 * Resizes to max 1024px on the longest side, converts to JPEG.
 * @param {Buffer} rawBuffer
 * @returns {Promise<{ buffer: Buffer, meta: object }>}
 */
async function preprocessImage(rawBuffer) {
  const processed = await sharp(rawBuffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, progressive: false })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processed.data,
    meta:   {
      width:  processed.info.width,
      height: processed.info.height,
      format: 'jpeg',
      size:   processed.info.size,
    },
  };
}

/**
 * Main entry point — detect PPE in an image.
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {object} options  – { mine_type, min_confidence }
 */
async function detectPPE(imageBuffer, mimeType, options = {}) {
  const { buffer: processedBuffer, meta } = await preprocessImage(imageBuffer);
  const engine = getEngine();
  const result = await engine.detect(processedBuffer, 'image/jpeg', options);
  result.image_meta = meta;
  return result;
}

module.exports = { detectPPE, preprocessImage, BACKEND };
