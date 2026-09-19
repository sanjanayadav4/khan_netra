const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/deadlineController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/',          ctrl.getAll);
router.get('/overdue',   ctrl.getOverdue);
router.get('/upcoming',  ctrl.getUpcoming);
router.post('/',         authorize('admin','government_officer','inspector','safety_officer'), ctrl.create);
router.put('/:id',       ctrl.update);

module.exports = router;
