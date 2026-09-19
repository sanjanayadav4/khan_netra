/**
 * KhanNetra Auth Routes
 * Registration → Admin Approval → Login  (no email verification)
 */
'use strict';

const express   = require('express');
const rateLimit = require('express-rate-limit');
const { body }  = require('express-validator');
const router    = express.Router();
const ctrl      = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

const isDev = (process.env.NODE_ENV || 'development') === 'development';

const makeLimit = (envKey, prodDefault, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 1000 : (parseInt(process.env[envKey], 10) || prodDefault),
    standardHeaders: true, legacyHeaders: false,
    message: { success: false, message, retryAfter: '15 minutes' },
    keyGenerator: (req) =>
      req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
  });

const registerLimiter = makeLimit('REGISTER_RATE_LIMIT', 10,
  'Too many registration attempts. Please wait 15 minutes.');
const loginLimiter    = makeLimit('LOGIN_RATE_LIMIT', 20,
  'Too many login attempts. Please wait 15 minutes.');

/* ── Validator rules ────────────────────────────────────────────────────── */
const registerRules = [
  body('full_name').trim().notEmpty().withMessage('Full name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2–100 characters.').escape(),

  body('email').trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .customSanitizer(v => v.toLowerCase().trim()),

  body('password').notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .isLength({ max: 128 }).withMessage('Password must not exceed 128 characters.'),

  body('confirm_password').optional().isLength({ max: 128 }),

  body('role').trim().notEmpty().withMessage('Role is required.')
    .isIn([
      'admin','government_officer','mine_manager','inspector',
      'safety_officer','environment_officer','contractor','prototype_tester',
      'mining_engineer','corporate_management',
    ]).withMessage('Invalid role selected.'),

  body('phone').optional({ checkFalsy: true }).trim().escape(),
  body('organization').optional({ checkFalsy: true }).trim()
    .isLength({ max: 200 }).withMessage('Organization name too long.').escape(),
  body('mine_name').optional({ checkFalsy: true }).trim().escape(),
  body('employee_id').optional({ checkFalsy: true }).trim().escape(),
  body('designation').optional({ checkFalsy: true }).trim().escape(),
  body('department').optional({ checkFalsy: true }).trim().escape(),
  body('mine_id').optional({ checkFalsy: true }).trim(),
];

const loginRules = [
  body('email').trim().notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .customSanitizer(v => v.toLowerCase().trim()),
  body('password').notEmpty().withMessage('Password is required.')
    .isLength({ max: 128 }).withMessage('Invalid credentials.'),
];

/* ── Public routes ──────────────────────────────────────────────────────── */
router.post('/register', registerLimiter, registerRules, ctrl.register);
router.post('/login',    loginLimiter,    loginRules,    ctrl.login);
router.post('/refresh',  ctrl.refreshToken);

/* ── Protected — any authenticated user ─────────────────────────────────── */
router.get('/me',              authenticate, ctrl.getMe);
router.put('/profile',         authenticate, ctrl.updateProfile);
router.put('/change-password', authenticate, ctrl.changePassword);

/* ── Admin-only approval endpoints ─────────────────────────────────────── */
router.get ('/pending-users',  authenticate, authorize('admin','government_officer'), ctrl.getPendingUsers);
router.post('/approve/:id',    authenticate, authorize('admin'),                      ctrl.approveUser);
router.post('/reject/:id',     authenticate, authorize('admin'),                      ctrl.rejectUser);
router.post('/suspend/:id',    authenticate, authorize('admin'),                      ctrl.suspendUser);

module.exports = router;
