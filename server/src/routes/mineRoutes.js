const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mineController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/search',    ctrl.searchMines);         // autocomplete — must be before /:id
router.get('/',          ctrl.getAllMines);
router.get('/:id',       ctrl.getMineById);
router.get('/:id/stats', ctrl.getMineStats);
router.post('/', authorize('admin', 'government_officer'), ctrl.createMine);
router.put('/:id', authorize('admin', 'government_officer', 'mine_manager'), ctrl.updateMine);
router.delete('/:id', authorize('admin'), ctrl.deleteMine);

module.exports = router;
