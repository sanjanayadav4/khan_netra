'use strict';
const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/safetyController');
const { authenticate, authorize } = require('../middleware/auth');
const upload   = require('../middleware/upload');

router.use(authenticate);

/* ── Safety Observations ──────────────────────────────────────────── */
router.get ('/observations',              ctrl.getAllObservations);
router.get ('/observations/stats',        ctrl.getObservationStats);
router.get ('/observations/:id',          ctrl.getObservationById);
router.post('/observations',
  upload.array('photos', 5),
  ctrl.createObservation);
router.put ('/observations/:id',          ctrl.updateObservation);
router.post('/observations/:id/photo',
  upload.single('photo'),
  ctrl.uploadObservationPhoto);

/* ── Incidents (enhanced) ─────────────────────────────────────────── */
router.post('/incidents',
  upload.array('evidence', 5),
  ctrl.createIncident);

/* ── Corrective Actions ───────────────────────────────────────────── */
router.get ('/corrective-actions',        ctrl.getAllCAs);
router.get ('/corrective-actions/stats',  ctrl.getCAStats);
router.post('/corrective-actions',
  authorize('admin','government_officer','mine_manager','inspector','safety_officer'),
  ctrl.createCA);
router.put ('/corrective-actions/:id',
  authorize('admin','government_officer','mine_manager','inspector','safety_officer'),
  ctrl.updateCA);
router.post('/corrective-actions/mark-overdue',
  authorize('admin','government_officer'),
  ctrl.markOverdue);

/* ── Combined dashboard ───────────────────────────────────────────── */
router.get ('/dashboard',                 ctrl.getSafetyDashboard);

module.exports = router;
