const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/aiController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// Status (is AI key configured?)
router.get('/status', ctrl.getStatus);

// Chat
router.post('/chat',                  ctrl.chat);
router.get('/chat/sessions',          ctrl.getSessions);
router.get('/chat/:session_id',       ctrl.getChatHistory);
router.delete('/chat/:session_id',    ctrl.deleteSession);
router.delete('/chat/:session_id/clear', ctrl.clearSession);

// Risk prediction
router.get('/risk/:mine_id', ctrl.getRiskPrediction);

// User management
router.get('/users',     authorize('admin','government_officer'), ctrl.getUsersList);
router.put('/users/:id', authorize('admin'),                      ctrl.updateUser);

module.exports = router;
