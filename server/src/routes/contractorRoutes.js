'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/contractorController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const writers = authorize('admin','government_officer','mine_manager','inspector');

router.get('/',                     ctrl.getAll);
router.get('/stats',                ctrl.getStats);
router.get('/expiry-alerts',        ctrl.getExpiryAlerts);
router.get('/:id',                  ctrl.getById);
router.get('/:id/workers',          ctrl.getWorkers);
router.post('/',                    writers, ctrl.create);
router.put('/:id',                  writers, ctrl.update);
router.post('/:id/recalculate',     writers, ctrl.recalculateScores);
router.delete('/:id',               authorize('admin','government_officer'), ctrl.delete);

module.exports = router;
