const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/dashboard',              ctrl.getDashboard);
router.get('/compliance-trend',       ctrl.getComplianceTrend);
router.get('/mine-ranking',           ctrl.getMineRanking);
router.get('/violations',             ctrl.getViolationAnalytics);
router.get('/production',             ctrl.getProductionAnalytics);
router.get('/audit-logs',             ctrl.getAuditLogs);

// New real-data endpoints
router.get('/recurring-violations',   ctrl.getRecurringViolations);
router.get('/anomalies',              ctrl.getAnomalies);
router.get('/extras',                 ctrl.getDashboardExtras);

module.exports = router;
