const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/incidentController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/stats', ctrl.getStats);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', authorize('admin', 'government_officer', 'inspector', 'safety_officer'), ctrl.update);

module.exports = router;
