'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/workerController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const writers = authorize('admin','government_officer','mine_manager','inspector','safety_officer');

/* ── Registry ─────────────────────────────────────────────────────────── */
router.get('/',              ctrl.getAll);
router.get('/stats',         ctrl.getStats);
router.get('/expiring-certs',ctrl.getExpiringCerts);
router.get('/cert-types',    ctrl.getCertTypes);
router.get('/:id',           ctrl.getById);
router.get('/:id/history',   ctrl.getAttendanceHistory);
router.post('/',             writers, ctrl.create);
router.put('/:id',           writers, ctrl.update);

/* ── Certifications ───────────────────────────────────────────────────── */
router.get('/:id/certifications',           ctrl.getCertifications);
router.post('/:id/certifications',          writers, ctrl.addCertification);
router.put('/:id/certifications/:certId',   writers, ctrl.updateCertification);
router.delete('/:id/certifications/:certId',writers, ctrl.deleteCertification);

module.exports = router;
