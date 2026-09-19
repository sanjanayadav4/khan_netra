'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/inspectionController');
const { authenticate, authorize } = require('../middleware/auth');
const upload  = require('../middleware/upload');

router.use(authenticate);

/* ── Read ─────────────────────────────────────────────────────────── */
router.get('/',           ctrl.getAll);
router.get('/schedule',   ctrl.getSchedule);
router.get('/stats',      ctrl.getStats);
router.get('/:id',        ctrl.getById);
router.get('/:id/corrective-actions', ctrl.getCorrectiveActions);

/* ── Write ────────────────────────────────────────────────────────── */
router.post('/',
  authorize('admin','government_officer','inspector'),
  ctrl.create);

router.put('/:id',
  authorize('admin','government_officer','inspector'),
  ctrl.update);

router.post('/checklist',
  authorize('admin','government_officer','inspector','safety_officer','mine_manager'),
  ctrl.saveChecklist);

router.post('/:id/photo',
  authorize('admin','government_officer','inspector','safety_officer','mine_manager'),
  upload.single('photo'),
  ctrl.uploadPhoto);

router.post('/:id/corrective-actions',
  authorize('admin','government_officer','inspector','safety_officer','mine_manager'),
  ctrl.createCorrectiveAction);

router.put('/corrective-actions/:caId',
  authorize('admin','government_officer','inspector','safety_officer','mine_manager'),
  ctrl.updateCorrectiveAction);

module.exports = router;
