'use strict';
/**
 * KhanNetra OCR Routes
 * All routes require authentication.
 * POST /extract and POST /save have rate limits.
 */
const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/ocrController');
const { authenticate } = require('../middleware/auth');
const ocrUpload  = require('../middleware/ocrUpload');
const rateLimit  = require('express-rate-limit');

// 20 extractions per 10 minutes per IP
const extractLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many OCR requests. Please wait 10 minutes.' },
});

router.use(authenticate);

/* ── Status ──────────────────────────────────────────────────── */
router.get('/health',  ctrl.health);

/* ── Core OCR flow ───────────────────────────────────────────── */
// 1. Upload document → extract text + structured fields
router.post(
  '/extract',
  extractLimiter,
  ocrUpload.single('document'),
  ctrl.extractDocument
);

// 2. Save structured (possibly edited) fields into target module
router.post('/save', ctrl.saveExtraction);

/* ── History ─────────────────────────────────────────────────── */
router.get('/history',     ctrl.getHistory);
router.get('/history/:id', ctrl.getExtractionById);
router.delete('/history/:id', ctrl.deleteExtraction);

module.exports = router;
