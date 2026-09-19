'use strict';
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const router   = express.Router();
const ctrl     = require('../controllers/minePlanController');
const { authenticate, authorize } = require('../middleware/auth');

/* ── Upload storage for mine plans ──────────────────────────────────────── */
const UPLOAD_DIR = path.join(process.env.UPLOAD_PATH || './uploads', 'mine-plans');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.bmp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error(`File type ${ext} not allowed for mine plans`), false);
};

const planUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB — mine plans can be large
});

/* ── All routes require authentication ──────────────────────────────────── */
router.use(authenticate);

// Dashboard stats
router.get('/stats', ctrl.getDashboardStats);

// Search plan content (OCR full-text)
router.get('/search', ctrl.searchPlans);

// List mine plans
router.get('/', ctrl.getAll);

// Get single plan (with layers + safety overlay)
router.get('/:id', ctrl.getById);

// Compare two versions
router.get('/:id/compare/:otherId', ctrl.compareVersions);

// Download original file
router.get('/:id/file', ctrl.serveFile);

// Get access/audit logs for a plan
router.get('/:id/logs',
  authorize('admin','government_officer','mine_manager'),
  ctrl.getAccessLogs
);

// ── RBAC access management ───────────────────────────────────────────────
// GET  /:id/access — view allowed_roles + role details for a plan
// PUT  /:id/access — update allowed_roles (grant / revoke)
router.get('/:id/access',
  authorize('admin','government_officer','mine_manager'),
  ctrl.getAccess
);
router.put('/:id/access',
  authorize('admin','government_officer','mine_manager'),
  ctrl.updateAccess
);

// Upload new plan (admin, govt_officer, mine_manager, inspector)
router.post('/',
  authorize('admin','government_officer','mine_manager','inspector'),
  planUpload.single('plan_file'),
  ctrl.upload
);

// Approve / reject / set as current (admin, govt_officer only)
router.put('/:id/approval',
  authorize('admin','government_officer'),
  ctrl.updateApproval
);

// Layer management
router.get('/:id/layers', ctrl.getLayers);

router.post('/:id/layers',
  authorize('admin','government_officer','mine_manager','inspector','safety_officer'),
  ctrl.saveLayer
);

router.delete('/:id/layers/:layerId',
  authorize('admin','government_officer','mine_manager'),
  ctrl.deleteLayer
);

module.exports = router;
