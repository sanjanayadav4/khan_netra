/**
 * KhanNetra Notification Controller
 * Fixed: all PostgreSQL $1/$2 placeholders replaced with SQLite ?
 * Fixed: RETURNING * removed (not supported in SQLite)
 * Fixed: is_read uses INTEGER 0/1 (SQLite boolean)
 */
'use strict';

const { query }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

exports.getAll = async (req, res, next) => {
  try {
    const { is_read, type, priority, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds  = [`n.user_id = ?`];
    const params = [req.user.id];

    if (is_read  !== undefined) { conds.push(`n.is_read = ?`);  params.push(is_read === 'true' ? 1 : 0); }
    if (type)    { conds.push(`n.type = ?`);     params.push(type); }
    if (priority){ conds.push(`n.priority = ?`); params.push(priority); }

    const where = `WHERE ${conds.join(' AND ')}`;

    const countRes = await query(
      `SELECT COUNT(*) as c FROM notifications n ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].c) || 0;

    const unreadRes = await query(
      `SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );
    const unread = parseInt(unreadRes.rows[0].c) || 0;

    const result = await query(
      `SELECT n.*, m.name as mine_name
       FROM notifications n
       LEFT JOIN mines m ON n.mine_id = m.id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success:      true,
      data:         result.rows,
      unread_count: unread,
      pagination: {
        total: parseInt(total),
        page:  parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (err) { next(err); }
};

exports.markRead = async (req, res, next) => {
  try {
    await query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    const row = (await query(
      `SELECT * FROM notifications WHERE id = ?`,
      [req.params.id]
    )).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    await query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
      [req.user.id]
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) { next(err); }
};

exports.delete = async (req, res, next) => {
  try {
    await query(
      `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) { next(err); }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );
    res.json({ success: true, data: { count: parseInt(result.rows[0].c) || 0 } });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { user_id, mine_id, title, message, type, priority, action_url } = req.body;
    const id = uuidv4();
    await query(
      `INSERT INTO notifications (id, user_id, mine_id, title, message, type, priority, action_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, user_id, mine_id || null, title, message, type || 'info', priority || 'medium', action_url || null]
    );
    const row = (await query(`SELECT * FROM notifications WHERE id = ?`, [id])).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};
