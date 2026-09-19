'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/preview', ctrl.getPreview);
router.get('/pdf',     ctrl.generatePDF);
router.get('/excel',   ctrl.generateExcel);

module.exports = router;
