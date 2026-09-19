const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/fieldReportController');
const { authenticate } = require('../middleware/auth');
const upload  = require('../middleware/upload');

router.use(authenticate);
router.get('/',         ctrl.getAll);
router.get('/map',      ctrl.getMapData);
router.get('/:id',      ctrl.getById);
router.post('/',        upload.array('images', 5), ctrl.create);
router.put('/:id',      ctrl.update);

module.exports = router;
