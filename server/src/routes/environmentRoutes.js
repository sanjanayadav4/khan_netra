'use strict';
const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/environmentController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const writers = authorize(
  'admin','government_officer','mine_manager','inspector',
  'safety_officer','environment_officer'
);

/* ── Read ─────────────────────────────────────────────────────── */
router.get('/',                      ctrl.getReadings);
router.get('/stats',                 ctrl.getStats);
router.get('/dashboard',             ctrl.getDashboardSummary);
router.get('/alerts',                ctrl.getAlerts);
router.get('/trends',                ctrl.getTrends);
router.get('/parameters',            ctrl.getParameters);
router.get('/mine/:id/latest',       ctrl.getLatestByMine);

/* ── Write ────────────────────────────────────────────────────── */
router.post('/',                     writers, ctrl.createReading);
router.put('/:id',                   writers, ctrl.updateReading);
router.delete('/:id',                authorize('admin','government_officer','environment_officer'), ctrl.deleteReading);

/* ── Sensor ingest ─ can be called by IoT systems ──────────────── */
router.post('/sensor-ingest',        writers, ctrl.sensorIngest);

/* ── Alerts ────────────────────────────────────────────────────── */
router.post('/alerts/:id/acknowledge', writers, ctrl.acknowledgeAlert);

module.exports = router;
