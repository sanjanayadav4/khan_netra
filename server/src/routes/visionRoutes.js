/**
 * KhanNetra AI Safety Vision — Routes
 *
 * All routes require JWT authentication.
 * Detection route is rate-limited to prevent abuse.
 *
 * Routes:
 *   GET  /api/v1/vision/health         → system health (any authenticated user)
 *   GET  /api/v1/vision/ppe-reference  → PPE catalogue & regulations
 *   POST /api/v1/vision/detect         → detect PPE in an image
 */

'use strict';

const express      = require('express');
const rateLimit    = require('express-rate-limit');
const router       = express.Router();
const ctrl         = require('../controllers/visionController');
const { authenticate, authorize } = require('../middleware/auth');
const visionUpload = require('../middleware/visionUpload');

/* ── Per-route rate limiter: max 30 scans / 10 min per IP ─────────────────── */
const detectLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max:      30,
  message:  { success: false, message: 'Too many scan requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

/* ── All vision routes require authentication ─────────────────────────────── */
router.use(authenticate);

/**
 * @route  GET /api/v1/vision/health
 * @access Any authenticated user
 * @desc   Check vision service status, configured model backend, API keys
 */
router.get('/health', ctrl.health);

/**
 * @route  GET /api/v1/vision/ppe-reference
 * @access Any authenticated user
 * @desc   Returns the complete PPE catalogue: all items, regulations, thresholds
 */
router.get('/ppe-reference', ctrl.getPpeReference);

/**
 * @route  POST /api/v1/vision/detect
 * @access All authenticated roles
 * @desc   Detect PPE compliance in an uploaded image
 *
 * Body (multipart/form-data):
 *   image           {File}    JPEG / PNG / WebP – max 10 MB
 *   mine_type       {string}  underground | opencast | default
 *   mine_id         {string}  Optional – UUID of the mine
 *   location        {string}  Optional – Location description
 *   min_confidence  {number}  Optional – Minimum confidence threshold (default 0.45)
 *
 * Response: See visionController.detect for full schema
 */
router.post(
  '/detect',
  detectLimiter,
  visionUpload.single('image'),
  ctrl.detect,
);

module.exports = router;
