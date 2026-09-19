'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/productionController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const writers = authorize(
  'admin','government_officer','mine_manager','inspector',
  'safety_officer','mining_engineer','corporate_management'
);

router.get('/dashboard',          ctrl.getDashboard);
router.get('/stats',              ctrl.getStats);
router.get('/records',            ctrl.getRecords);
router.post('/records',           writers, ctrl.createRecord);
router.put('/records/:id',        writers, ctrl.updateRecord);
router.get('/trends',             ctrl.getTrends);
router.get('/targets',            ctrl.getTargets);
router.post('/targets',           writers, ctrl.setTarget);
router.get('/machinery',          ctrl.getMachinery);
router.post('/machinery',         writers, ctrl.addMachine);
router.put('/machinery/:id',      writers, ctrl.updateMachine);
router.get('/analysis',           ctrl.getAnalysis);

module.exports = router;
