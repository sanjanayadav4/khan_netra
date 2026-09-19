'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/complianceController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

/* ── Read ─────────────────────────────────────────────────────────── */
router.get('/records',            ctrl.getRecords);
router.get('/dashboard',          ctrl.getDashboard);
router.get('/deadlines',          ctrl.getDeadlines);
router.get('/regulations',        ctrl.getRegulations);
router.get('/mine/:id/score',     ctrl.getMineComplianceScore);

/* ── Write ────────────────────────────────────────────────────────── */
router.post('/records',
  authorize('admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'),
  ctrl.create);

router.put('/records/:id',
  authorize('admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'),
  ctrl.update);

/* ── Workflow transitions ─────────────────────────────────────────── */
router.post('/records/:id/submit',
  authorize('admin','government_officer','mine_manager','inspector','safety_officer','environment_officer'),
  ctrl.submitRecord);

router.post('/records/:id/start-verification',
  authorize('admin','government_officer','inspector'),
  ctrl.startVerification);

router.post('/records/:id/approve',
  authorize('admin','government_officer','inspector'),
  ctrl.approveRecord);

router.post('/records/:id/reject',
  authorize('admin','government_officer','inspector'),
  ctrl.rejectRecord);

/* ── AI + Regulations ─────────────────────────────────────────────── */
router.post('/mine/:mine_id/ai-assessment', ctrl.runAiAssessment);
router.post('/regulations', authorize('admin','government_officer'), ctrl.createRegulation);

module.exports = router;
