/**
 * KhanNetra Auth Middleware
 * - authenticate: verify JWT, load user from DB, check is_active + status
 * - authorize(...roles): role-based access control
 * - requireMineAccess: mine-level data isolation
 * - optionalAuth: silent auth for public-ish endpoints
 *
 * NOTE: Uses SQLite `?` placeholders (not PostgreSQL `$1`).
 */
'use strict';

const jwt     = require('jsonwebtoken');
const { query } = require('../config/database');

/* ── Roles that can see ALL mines (not restricted to one mine) ─────────── */
const GLOBAL_ROLES = [
  'admin', 'government_officer', 'inspector', 'corporate_management',
];

/* ── Roles that are locked to their assigned mine only ─────────────────── */
const MINE_SCOPED_ROLES = [
  'mine_manager', 'safety_officer', 'environment_officer',
  'contractor', 'mining_engineer',
];

/* ════════════════════════════════════════════════════════════════════════════
   authenticate  —  validates Bearer JWT and loads req.user
════════════════════════════════════════════════════════════════════════════ */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ success: false, message: 'No token provided.' });

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError')
        return res.status(401).json({ success: false, message: 'Token expired.' });
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    // Load fresh user from DB on every request (catches role/status changes)
    const result = await query(
      'SELECT id, email, full_name, role, mine_id, mine_name, organization, status, is_active FROM users WHERE id = ?',
      [decoded.id],
    );

    if (!result.rows.length)
      return res.status(401).json({ success: false, message: 'User not found.' });

    const user = result.rows[0];

    if (!user.is_active)
      return res.status(401).json({ success: false, message: 'Account deactivated.' });

    const status = (user.status || 'APPROVED').toUpperCase();
    if (status !== 'APPROVED')
      return res.status(403).json({
        success: false,
        code:    'ACCOUNT_' + status,
        message: status === 'PENDING'
          ? 'Your account is awaiting administrator approval.'
          : status === 'REJECTED'
          ? 'Your registration was not approved.'
          : 'Your account has been suspended.',
      });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   authorize(...roles)  —  role-based access control (call after authenticate)
════════════════════════════════════════════════════════════════════════════ */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  if (!roles.includes(req.user.role))
    return res.status(403).json({
      success: false,
      message: `Access denied. Required roles: ${roles.join(', ')}.`,
    });
  next();
};

/* ════════════════════════════════════════════════════════════════════════════
   requireMineAccess  —  mine-level data isolation middleware
   Usage: router.get('/mines/:id/data', authenticate, requireMineAccess, ctrl.getData)
   - GLOBAL_ROLES (admin, gov officer, inspector): always allowed
   - MINE_SCOPED_ROLES: only allowed if req.user.mine_id matches the mine
   - Reads mine ID from req.params.mine_id OR req.params.id OR req.query.mine_id
════════════════════════════════════════════════════════════════════════════ */
const requireMineAccess = (req, res, next) => {
  const { role, mine_id: userMineId } = req.user || {};

  // Global roles bypass mine restriction
  if (GLOBAL_ROLES.includes(role)) return next();

  // prototype_tester gets read-only but no real-data access — handled at route level
  if (role === 'prototype_tester')
    return res.status(403).json({
      success: false,
      message: 'Prototype Tester accounts cannot access real mine data. Use demo/test data only.',
    });

  if (!MINE_SCOPED_ROLES.includes(role)) return next(); // unknown role — let route decide

  // Resolve the requested mine ID from URL or query params
  const requestedMine =
    req.params.mine_id || req.params.id || req.query.mine_id || null;

  if (!requestedMine) return next(); // no mine context in this request

  if (!userMineId)
    return res.status(403).json({
      success: false,
      message: 'Your account has no mine assigned. Contact an administrator.',
    });

  if (userMineId !== requestedMine)
    return res.status(403).json({
      success: false,
      message: 'You do not have access to this mine\'s data.',
    });

  next();
};

/* ════════════════════════════════════════════════════════════════════════════
   optionalAuth  —  silently sets req.user if valid token present
════════════════════════════════════════════════════════════════════════════ */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        'SELECT id, email, full_name, role, mine_id, status FROM users WHERE id = ?',
        [decoded.id],
      );
      if (result.rows.length) req.user = result.rows[0];
    }
  } catch {}
  next();
};

module.exports = { authenticate, authorize, requireMineAccess, optionalAuth };
