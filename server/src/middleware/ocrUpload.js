/**
 * Multer upload middleware for OCR document uploads.
 * Accepts: JPEG, PNG, WebP, PDF
 * Max size: 15 MB
 * Files are written to disk and deleted by the controller after processing.
 */
'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = path.join(
  process.env.UPLOAD_PATH || './uploads',
  'ocr', 'tmp'
);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, _file, cb) => {
    const ext = path.extname(_file.originalname).toLowerCase() || '.tmp';
    cb(null, `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const ALLOWED = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'application/pdf',
];

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, PDF.`),
        { status: 415 }
      ),
      false
    );
  }
};

const ocrUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
    files: 1,
  },
});

module.exports = ocrUpload;
