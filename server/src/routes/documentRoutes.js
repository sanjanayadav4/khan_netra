const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/documentController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/expiry-alerts', ctrl.getExpiryAlerts);
router.get('/:id', ctrl.getById);
router.post('/', upload.single('file'), ctrl.upload);
router.put('/:id', ctrl.update);
router.delete('/:id', authorize('admin', 'government_officer', 'mine_manager'), ctrl.delete);
router.post('/:id/analyze', ctrl.analyzeDocument);

module.exports = router;
