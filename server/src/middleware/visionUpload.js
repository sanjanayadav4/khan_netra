/**
 * Multer upload middleware specifically for vision/PPE detection.
 * Stores uploads in memory (temp) — images are deleted after processing.
 * Uses diskStorage so we can read the buffer from disk and then delete.
 */

'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = path.join(process.env.UPLOAD_PATH || './uploads', 'vision', 'tmp');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, _file, cb) => cb(null, `ppe_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`),
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { status: 415 }), false);
};

const visionUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  10 * 1024 * 1024, // 10 MB
    files:     1,
  },
});

module.exports = visionUpload;
