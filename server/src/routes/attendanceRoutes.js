'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

const writers = authorize('admin','government_officer','mine_manager','inspector','safety_officer');

router.use(authenticate);

// ── Read ─────────────────────────────────────────────────────────────────────
router.get('/',          ctrl.getAll);
router.get('/summary',   ctrl.getDailySummary);
// Daily session: load workers + merged attendance for a mine/date/shift
router.get('/session',   ctrl.getDailySession);
router.get('/:id',       ctrl.getById);

// ── Write ────────────────────────────────────────────────────────────────────
// Single record (original flow + offline sync)
router.post('/',            writers, ctrl.create);
router.put('/:id',          writers, ctrl.update);
// Bulk save a full daily session at once
router.post('/bulk',        writers, ctrl.bulkSave);
// Mark all workers in a session to the same status (Mark All Present / Absent)
router.post('/mark-all',    writers, ctrl.markAll);

module.exports = router;
