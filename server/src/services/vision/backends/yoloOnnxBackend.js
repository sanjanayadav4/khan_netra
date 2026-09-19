/**
 * KhanNetra PPE Vision — YOLO ONNX Backend (Stub)
 *
 * This file is ready to receive a properly trained PPE YOLO model.
 *
 * HOW TO ACTIVATE:
 * 1. Install: npm install onnxruntime-node
 * 2. Place your YOLO PPE model at the path in .env: YOLO_MODEL_PATH=./models/ppe_yolo.onnx
 * 3. Set in .env: MODEL_BACKEND=yolo_onnx
 * 4. Map your model's class IDs to PPE item IDs in CLASS_MAP below.
 * 5. Restart the server — no other changes needed.
 *
 * Model requirements:
 * - Input:  [1, 3, 640, 640]  NCHW float32 normalised (0–1)
 * - Output: [1, N, 13]        (x_c, y_c, w, h, obj_conf, class_0..7)
 * - Trained on 8 PPE classes matching PPE_ITEMS in ppeConfig.js
 *
 * Training dataset recommendation: PPE-Detection-v2 on Roboflow Universe
 */

'use strict';

const path = require('path');
const { PPE_ITEMS } = require('../ppeConfig');

/** Map YOLO class index → PPE item ID */
const CLASS_MAP = {
  0: 'helmet',
  1: 'safety_vest',
  2: 'safety_boots',
  3: 'goggles',
  4: 'gloves',
  5: 'ear_protection',
  6: 'respiratory_mask',
  7: 'safety_lamp',
};

const CONF_THRESHOLD = parseFloat(process.env.YOLO_CONF_THRESHOLD || '0.45');
const NMS_IOU        = parseFloat(process.env.YOLO_NMS_IOU        || '0.45');
const INPUT_SIZE     = 640;

let _session = null;

async function getSession() {
  if (_session) return _session;
  let ort;
  try { ort = require('onnxruntime-node'); }
  catch { throw new Error('onnxruntime-node not installed. Run: npm install onnxruntime-node'); }

  const modelPath = process.env.YOLO_MODEL_PATH;
  if (!modelPath) throw new Error('YOLO_MODEL_PATH not set in .env');

  const absPath = path.resolve(modelPath);
  const fs = require('fs');
  if (!fs.existsSync(absPath)) {
    throw new Error(`YOLO model file not found at: ${absPath}`);
  }

  _session = await ort.InferenceSession.create(absPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });
  console.log('[PPE Vision] YOLO ONNX model loaded from:', absPath);
  return _session;
}

/**
 * @param {Buffer} imageBuffer – JPEG buffer (640×640 after preprocessing)
 * @param {string} mimeType
 * @param {object} options
 */
async function detect(imageBuffer, mimeType, options = {}) {
  // ── This will throw if onnxruntime-node isn't installed ──
  const session = await getSession();

  const sharp = require('sharp');
  // Resize to INPUT_SIZE x INPUT_SIZE
  const { data: pixels } = await sharp(imageBuffer)
    .resize(INPUT_SIZE, INPUT_SIZE)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert HWC uint8 → CHW float32 normalised
  const float32 = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    float32[i]                             = pixels[i * 3 + 0] / 255.0; // R
    float32[i + INPUT_SIZE * INPUT_SIZE]   = pixels[i * 3 + 1] / 255.0; // G
    float32[i + 2 * INPUT_SIZE * INPUT_SIZE] = pixels[i * 3 + 2] / 255.0; // B
  }

  const ort = require('onnxruntime-node');
  const tensor  = new ort.Tensor('float32', float32, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds    = { images: tensor };
  const results  = await session.run(feeds);

  // Parse detections (YOLO v8 format)
  // Output shape: [1, num_classes+4, num_anchors]
  const output    = results[Object.keys(results)[0]].data;
  const numAnchors = results[Object.keys(results)[0]].dims[2];
  const numFields  = results[Object.keys(results)[0]].dims[1];

  const detections = [];
  for (let i = 0; i < numAnchors; i++) {
    let maxConf  = 0;
    let maxClass = -1;
    for (let c = 4; c < numFields; c++) {
      const conf = output[c * numAnchors + i];
      if (conf > maxConf) { maxConf = conf; maxClass = c - 4; }
    }
    if (maxConf >= CONF_THRESHOLD && CLASS_MAP[maxClass]) {
      detections.push({ class_id: maxClass, confidence: maxConf, ppe_id: CLASS_MAP[maxClass] });
    }
  }

  // Group by PPE item (take highest confidence per item)
  const ppeMap = {};
  for (const d of detections) {
    if (!ppeMap[d.ppe_id] || ppeMap[d.ppe_id] < d.confidence) {
      ppeMap[d.ppe_id] = d.confidence;
    }
  }

  // Treat all detections as a single "worker" (scene-level)
  const detectedPpe      = Object.keys(ppeMap);
  const confidenceScores = {};
  for (const id of Object.keys(PPE_ITEMS)) {
    confidenceScores[id] = ppeMap[id] ? Math.round(ppeMap[id] * 100) / 100 : 0;
  }

  return {
    workers: [{
      worker_id:         1,
      position_in_frame: 'full_frame',
      visibility:        'full',
      detected_ppe:      detectedPpe,
      confidence_scores: confidenceScores,
      raw_detections:    ppeMap,
    }],
    scene_info: {
      description:  'Analysed with YOLO ONNX model',
      lighting:     'unknown',
      worker_count: 1,
    },
    model_info: {
      name:    'YOLO-PPE-Custom',
      version: process.env.YOLO_MODEL_VERSION || '1.0',
      backend: 'yolo_onnx',
    },
  };
}

module.exports = { detect };
