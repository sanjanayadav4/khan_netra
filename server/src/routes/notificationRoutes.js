const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/unread-count', ctrl.getUnreadCount);
router.post('/', authorize('admin', 'government_officer'), ctrl.create);
router.put('/all/read', ctrl.markAllRead);   // must be BEFORE /:id/read
router.put('/:id/read', ctrl.markRead);
router.delete('/:id', ctrl.delete);

module.exports = router;
