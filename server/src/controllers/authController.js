/**
 * KhanNetra Auth Controller
 * Registration → Admin Approval → Login flow.
 * No email/Gmail verification. Status-based access control.
 * Statuses: PENDING | APPROVED | REJECTED | SUSPENDED
 */
'use strict';

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 }       = require('uuid');
const { validationResult } = require('express-validator');
const { query }            = require('../config/database');

/* ── helpers ────────────────────────────────────────────────────────────── */
const makeTokens = (user) => {
  const payload = { id: user.id, email: user.email, role: user.role };
  return {
    token:        jwt.sign(payload, process.env.JWT_SECRET,
                    { expiresIn: process.env.JWT_EXPIRES_IN         || '24h' }),
    refreshToken: jwt.sign(payload, process.env.JWT_REFRESH_SECRET,
                    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'  }),
  };
};

const validationErrors = (req) => {
  const r = validationResult(req);
  return r.isEmpty() ? null : r.array().map(e => e.msg).join(' ');
};

const ALLOWED_ROLES = [
  'admin', 'government_officer', 'mine_manager', 'inspector',
  'safety_officer', 'environment_officer', 'contractor', 'prototype_tester',
   'mining_engineer', 'corporate_management',
];

/* ════════════════════════════════════════════════════════════════════════════
   REGISTER  —  POST /auth/register
   Creates account with status = PENDING (unless first admin).
════════════════════════════════════════════════════════════════════════════ */
exports.register = async (req, res, next) => {
  try {
    const valErr = validationErrors(req);
    if (valErr) return res.status(400).json({ success: false, message: valErr });

    const {
      email, password, confirm_password,
      full_name, role, phone,
      organization, mine_name, employee_id,
      designation, department, mine_id,
    } = req.body;

    if (confirm_password !== undefined && password !== confirm_password)
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });

    if (!ALLOWED_ROLES.includes(role))
      return res.status(400).json({ success: false, message: 'Invalid role selected.' });

    const emailLower = email.toLowerCase().trim();

    // Duplicate email check
    const existing = await query('SELECT id FROM users WHERE email = ?', [emailLower]);
    if (existing.rows.length)
      return res.status(409).json({ success: false, message: 'This email address is already registered. Please sign in.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    // Determine initial status
    // First-ever admin registration auto-approves; all others start PENDING
    let initialStatus = 'PENDING';
    if (role === 'admin') {
      const adminCount = (await query("SELECT COUNT(*) as c FROM users WHERE role = 'admin'")).rows[0].c;
      if (parseInt(adminCount, 10) === 0) initialStatus = 'APPROVED'; // bootstrap first admin
    }

    await query(
      `INSERT INTO users
         (id, email, password_hash, full_name, role, phone,
          designation, department, organization,
          mine_id, mine_name, employee_id, status, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [
        id, emailLower, passwordHash,
        (full_name || '').trim(), role,
        phone        ? phone.trim()       : null,
        designation  ? designation.trim() : null,
        department   ? department.trim()  : null,
        organization ? organization.trim(): null,
        mine_id      || null,
        mine_name    ? mine_name.trim()   : null,
        employee_id  ? employee_id.trim() : null,
        initialStatus,
      ],
    );

    // Audit log (non-blocking)
    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), id, 'REGISTER', 'auth', id,
       `New user registered: ${emailLower} (${role}) — status: ${initialStatus}`, req.ip],
    ).catch(() => {});

    // Notify all admins about new pending registration
    if (initialStatus === 'PENDING') {
      const admins = (await query("SELECT id FROM users WHERE role='admin' AND status='APPROVED' AND is_active=1")).rows;
      for (const admin of admins) {
        query(
          `INSERT INTO notifications (id,user_id,title,message,type,priority)
           VALUES (?,?,?,?,?,?)`,
          [uuidv4(), admin.id,
           `New Registration Pending: ${(full_name || '').trim()}`,
           `${(full_name || '').trim()} (${role}) has registered and is awaiting approval. Email: ${emailLower}`,
           'info', 'high'],
        ).catch(() => {});
      }
    }

    return res.status(201).json({
      success: true,
      message: initialStatus === 'APPROVED'
        ? 'Admin account created. You can sign in immediately.'
        : 'Registration submitted successfully. Your account is pending administrator approval. You will be able to sign in once an admin approves your request.',
      data: { status: initialStatus, email: emailLower },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   LOGIN  —  POST /auth/login
   Checks: exists → password → status gate → issue JWT
════════════════════════════════════════════════════════════════════════════ */
exports.login = async (req, res, next) => {
  try {
    const valErr = validationErrors(req);
    if (valErr) return res.status(400).json({ success: false, message: valErr });

    const email    = (req.body.email    || '').toLowerCase().trim();
    const password =  req.body.password || '';

    const r = await query('SELECT * FROM users WHERE email = ?', [email]);

    if (!r.rows.length)
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const user = r.rows[0];

    if (!user.is_active)
      return res.status(401).json({
        success: false,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your account has been deactivated. Please contact the administrator.',
      });

    // Check password BEFORE status so we don't leak status info on wrong password
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk)
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    // Status gate
    const status = (user.status || 'APPROVED').toUpperCase();

    if (status === 'PENDING')
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_PENDING',
        message: 'Your account is waiting for administrator approval. You will receive access once an admin reviews your registration.',
      });

    if (status === 'REJECTED')
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_REJECTED',
        message: `Your registration request was not approved.${user.rejection_reason ? ' Reason: ' + user.rejection_reason : ' Please contact the administrator for more information.'}`,
      });

    if (status === 'SUSPENDED')
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact the administrator.',
      });

    if (status !== 'APPROVED')
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_NOT_APPROVED',
        message: 'Your account is not yet approved. Please contact the administrator.',
      });

    // All checks passed
    await query("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);

    const { token, refreshToken } = makeTokens(user);

    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), user.id, 'LOGIN', 'auth', user.id,
       `User ${user.full_name} logged in`, req.ip],
    ).catch(() => {});

    // Strip sensitive columns
    const {
      password_hash, verification_token, token_expires_at,
      email_verified, ...safeUser
    } = user;

    return res.json({
      success: true,
      message: 'Login successful.',
      data: { user: safeUser, token, refreshToken },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET PENDING USERS  —  GET /auth/pending-users  (admin only)
════════════════════════════════════════════════════════════════════════════ */
exports.getPendingUsers = async (req, res, next) => {
  try {
    const { status = 'PENDING' } = req.query;
    const validStatuses = ['PENDING','APPROVED','REJECTED','SUSPENDED'];
    const s = validStatuses.includes(status.toUpperCase()) ? status.toUpperCase() : 'PENDING';

    const rows = (await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.phone,
              u.organization, u.mine_id, u.mine_name, u.employee_id,
              u.designation, u.department, u.status,
              u.is_active, u.created_at, u.approved_at, u.rejection_reason,
              approver.full_name AS approved_by_name,
              m.name AS mine_db_name
       FROM users u
       LEFT JOIN users approver ON u.approved_by = approver.id
       LEFT JOIN mines m ON u.mine_id = m.id
       WHERE u.status = ?
       ORDER BY u.created_at DESC`,
      [s],
    )).rows;

    return res.json({ success: true, data: rows, status: s });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   APPROVE USER  —  POST /auth/approve/:id  (admin only)
════════════════════════════════════════════════════════════════════════════ */
exports.approveUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, mine_id } = req.body; // admin can optionally set/change role and mine

    const row = (await query('SELECT * FROM users WHERE id = ?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'User not found.' });
    if (row.status === 'APPROVED')
      return res.status(400).json({ success: false, message: 'User is already approved.' });

    const sets = [
      "status = 'APPROVED'",
      "approved_at = datetime('now')",
      `approved_by = '${req.user.id}'`,
      "rejection_reason = NULL",
      "is_active = 1",
      "updated_at = datetime('now')",
    ];
    const params = [];

    if (role && ALLOWED_ROLES.includes(role)) { sets.push('role = ?'); params.push(role); }
    if (mine_id !== undefined) { sets.push('mine_id = ?'); params.push(mine_id || null); }

    params.push(id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

    // Notify the user (in-app notification)
    query(
      `INSERT INTO notifications (id,user_id,title,message,type,priority)
       VALUES (?,?,?,?,?,?)`,
      [uuidv4(), id,
       '✅ Account Approved — Welcome to KhanNetra!',
       `Your KhanNetra DGMS account has been approved by an administrator. You can now sign in and access the system.`,
       'success', 'high'],
    ).catch(() => {});

    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'APPROVE_USER', 'user', id,
       `Approved user: ${row.email} (${row.role})`, req.ip],
    ).catch(() => {});

    const updated = (await query('SELECT id,email,full_name,role,status,mine_id,mine_name,organization FROM users WHERE id=?', [id])).rows[0];
    return res.json({ success: true, message: `User "${row.full_name}" approved.`, data: updated });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   REJECT USER  —  POST /auth/reject/:id  (admin only)
════════════════════════════════════════════════════════════════════════════ */
exports.rejectUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const row = (await query('SELECT * FROM users WHERE id = ?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'User not found.' });

    await query(
      `UPDATE users SET status='REJECTED', rejection_reason=?, is_active=0, updated_at=datetime('now') WHERE id=?`,
      [reason || 'Registration request not approved.', id],
    );

    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'REJECT_USER', 'user', id,
       `Rejected user: ${row.email} — reason: ${reason || 'none'}`, req.ip],
    ).catch(() => {});

    return res.json({ success: true, message: `User "${row.full_name}" rejected.` });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   SUSPEND USER  —  POST /auth/suspend/:id  (admin only)
════════════════════════════════════════════════════════════════════════════ */
exports.suspendUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (id === req.user.id)
      return res.status(400).json({ success: false, message: 'You cannot suspend your own account.' });

    const row = (await query('SELECT * FROM users WHERE id = ?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'User not found.' });

    await query(
      `UPDATE users SET status='SUSPENDED', rejection_reason=?, is_active=0, updated_at=datetime('now') WHERE id=?`,
      [reason || 'Account suspended by administrator.', id],
    );

    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address)
       VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'SUSPEND_USER', 'user', id,
       `Suspended user: ${row.email} — reason: ${reason || 'none'}`, req.ip],
    ).catch(() => {});

    return res.json({ success: true, message: `User "${row.full_name}" suspended.` });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET ME  —  GET /auth/me  (authenticated)
════════════════════════════════════════════════════════════════════════════ */
exports.getMe = async (req, res, next) => {
  try {
    const r = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.phone,
              u.designation, u.department, u.organization,
              u.mine_id, u.mine_name, u.employee_id,
              u.status, u.is_active, u.last_login, u.created_at,
              m.name AS mine_db_name
       FROM users u
       LEFT JOIN mines m ON u.mine_id = m.id
       WHERE u.id = ?`,
      [req.user.id],
    );
    if (!r.rows[0])
      return res.status(404).json({ success: false, message: 'User not found.' });
    return res.json({ success: true, data: r.rows[0] });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   REFRESH TOKEN  —  POST /auth/refresh
════════════════════════════════════════════════════════════════════════════ */
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ success: false, message: 'Refresh token required.' });

    let decoded;
    try { decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET); }
    catch { return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' }); }

    const r = await query(
      "SELECT id,email,full_name,role,status FROM users WHERE id=? AND is_active=1",
      [decoded.id],
    );
    if (!r.rows[0])
      return res.status(401).json({ success: false, message: 'User not found or deactivated.' });

    if ((r.rows[0].status || 'APPROVED') !== 'APPROVED')
      return res.status(403).json({ success: false, message: 'Account not approved.' });

    return res.json({ success: true, data: makeTokens(r.rows[0]) });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   UPDATE PROFILE  —  PUT /auth/profile  (authenticated)
════════════════════════════════════════════════════════════════════════════ */
exports.updateProfile = async (req, res, next) => {
  try {
    const { full_name, phone, designation, department, organization } = req.body;
    await query(
      `UPDATE users
       SET full_name   = COALESCE(?, full_name),
           phone       = COALESCE(?, phone),
           designation = COALESCE(?, designation),
           department  = COALESCE(?, department),
           organization= COALESCE(?, organization),
           updated_at  = datetime('now')
       WHERE id = ?`,
      [full_name, phone, designation, department, organization, req.user.id],
    );
    const user = (await query(
      'SELECT id,email,full_name,role,phone,designation,department,organization,mine_id,mine_name FROM users WHERE id=?',
      [req.user.id],
    )).rows[0];
    return res.json({ success: true, message: 'Profile updated.', data: user });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CHANGE PASSWORD  —  PUT /auth/change-password  (authenticated)
════════════════════════════════════════════════════════════════════════════ */
exports.changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ success: false, message: 'Both passwords required.' });
    if (new_password.length < 8)
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    if (current_password === new_password)
      return res.status(400).json({ success: false, message: 'New password must differ from current.' });

    const r = await query('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'User not found.' });

    const match = await bcrypt.compare(current_password, r.rows[0].password_hash);
    if (!match)
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });

    await query(
      "UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?",
      [await bcrypt.hash(new_password, 12), req.user.id],
    );
    return res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) { next(err); }
};
