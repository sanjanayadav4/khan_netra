const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/violationController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/corrective-actions', ctrl.getCorrectiveActions);
router.get('/:id', ctrl.getById);
router.post('/', authorize('admin', 'government_officer', 'inspector', 'safety_officer'), ctrl.create);
router.put('/:id', authorize('admin', 'government_officer', 'inspector', 'safety_officer'), ctrl.update);
router.delete('/:id', authorize('admin'), ctrl.delete);
router.post('/corrective-actions', authorize('admin', 'government_officer', 'inspector'), ctrl.createCorrectiveAction);
router.put('/corrective-actions/:id', ctrl.updateCorrectiveAction);

module.exports = router;
