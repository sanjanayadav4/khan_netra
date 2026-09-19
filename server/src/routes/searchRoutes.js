'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/searchController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.search);

module.exports = router;
