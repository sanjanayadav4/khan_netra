const express = require('express');
const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/mines', require('./mineRoutes'));
router.use('/violations', require('./violationRoutes'));
router.use('/incidents', require('./incidentRoutes'));
router.use('/safety', require('./safetyRoutes'));
router.use('/environment', require('./environmentRoutes'));
router.use('/inspections', require('./inspectionRoutes'));
router.use('/documents', require('./documentRoutes'));
router.use('/notifications', require('./notificationRoutes'));
router.use('/analytics', require('./analyticsRoutes'));
router.use('/compliance', require('./complianceRoutes'));
router.use('/reports', require('./reportRoutes'));
router.use('/ai',           require('./aiRoutes'));
router.use('/vision',       require('./visionRoutes'));
router.use('/contractors',  require('./contractorRoutes'));
router.use('/field-reports',require('./fieldReportRoutes'));
router.use('/deadlines',    require('./deadlineRoutes'));
router.use('/risk',         require('./riskDashboardRoutes'));
router.use('/ocr',          require('./ocrRoutes'));
router.use('/disaster',     require('./disasterRoutes'));
router.use('/attendance',   require('./attendanceRoutes'));
router.use('/workers',      require('./workerRoutes'));
router.use('/mine-plans',   require('./minePlanRoutes'));
router.use('/production',   require('./productionRoutes'));
router.use('/search',       require('./searchRoutes'));

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'KhanNetra API is running', timestamp: new Date(), version: '1.0.0' });
});

module.exports = router;
