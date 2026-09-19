'use strict';
const { query } = require('../config/database');
const { v4: uuid } = require('uuid');

exports.getAll = async (req, res, next) => {
  try {
    const { mine_id, status, page = 1, limit = 30 } = req.query;
    const off = (page - 1) * limit;
    let c = [], p = [];
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)   { c.push('cd.mine_id = ?'); p.push(mId); }
    if (status){ c.push('cd.status = ?');  p.push(status); }
    const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as n FROM compliance_deadlines cd ${w}`, p)).rows[0].n;
    const rows  = (await query(
      `SELECT cd.*, m.name as mine_name,
         CAST(julianday(cd.deadline_date) - julianday(date('now')) AS INTEGER) as days_remaining
       FROM compliance_deadlines cd
       JOIN mines m ON cd.mine_id = m.id
       ${w}
       ORDER BY cd.deadline_date ASC
       LIMIT ? OFFSET ?`,
      [...p, limit, off]
    )).rows;
    res.json({ success: true, data: rows, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { mine_id, title, description, deadline_date, responsible_person, compliance_record_id } = req.body;
    if (!mine_id || !title || !deadline_date)
      return res.status(400).json({ success: false, message: 'mine_id, title, deadline_date required' });
    const id = uuid();
    await query(
      `INSERT INTO compliance_deadlines (id,mine_id,compliance_record_id,title,description,deadline_date,responsible_person,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, mine_id, compliance_record_id || null, title, description, deadline_date, responsible_person, req.user.id]
    );
    const row = (await query('SELECT * FROM compliance_deadlines WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['title','description','deadline_date','responsible_person','status','escalation_level','completed_date'];
    const sets = [], p = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); p.push(req.body[k]); }
    }
    if (req.body.status === 'completed' && !req.body.completed_date) {
      sets.push(`completed_date = date('now')`);
    }
    sets.push(`updated_at = datetime('now')`);
    p.push(id);
    await query(`UPDATE compliance_deadlines SET ${sets.join(',')} WHERE id=?`, p);
    const row = (await query('SELECT * FROM compliance_deadlines WHERE id=?', [id])).rows[0];
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

exports.getOverdue = async (req, res, next) => {
  try {
    const mineId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf = mineId ? `AND cd.mine_id = '${mineId}'` : '';
    const rows = (await query(
      `SELECT cd.*, m.name as mine_name,
         CAST(julianday(date('now')) - julianday(cd.deadline_date) AS INTEGER) as days_overdue
       FROM compliance_deadlines cd
       JOIN mines m ON cd.mine_id = m.id
       WHERE cd.deadline_date < date('now') AND cd.status NOT IN ('completed','cancelled') ${mf}
       ORDER BY cd.deadline_date ASC`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

exports.getUpcoming = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const mineId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf = mineId ? `AND cd.mine_id = '${mineId}'` : '';
    const rows = (await query(
      `SELECT cd.*, m.name as mine_name,
         CAST(julianday(cd.deadline_date) - julianday(date('now')) AS INTEGER) as days_remaining
       FROM compliance_deadlines cd
       JOIN mines m ON cd.mine_id = m.id
       WHERE cd.deadline_date BETWEEN date('now') AND date('now', '+${days} days')
       AND cd.status NOT IN ('completed','cancelled') ${mf}
       ORDER BY cd.deadline_date ASC`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

// Cron-callable: check overdue deadlines and escalate
exports.runEscalation = async () => {
  try {
    // Mark overdue
    await query(
      `UPDATE compliance_deadlines SET status='overdue', escalation_level=escalation_level+1, updated_at=datetime('now')
       WHERE deadline_date < date('now') AND status='pending'`
    );
    // Get newly escalated items that need notifications
    const items = (await query(
      `SELECT cd.*, m.name as mine_name FROM compliance_deadlines cd JOIN mines m ON cd.mine_id=m.id
       WHERE cd.status='overdue' AND cd.reminder_sent=0 AND cd.escalation_level >= 1`
    )).rows;

    for (const item of items) {
      const admins = (await query(`SELECT id FROM users WHERE role IN ('admin','government_officer')`)).rows;
      for (const a of admins) {
        await query(
          `INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,
          [uuid(), a.id, item.mine_id,
           `⏰ Compliance Deadline Overdue`,
           `"${item.title}" at ${item.mine_name} was due ${item.deadline_date}. Escalation level: ${item.escalation_level}`,
           'deadline', item.escalation_level >= 2 ? 'critical' : 'high']
        );
      }
      await query(`UPDATE compliance_deadlines SET reminder_sent=1, updated_at=datetime('now') WHERE id=?`, [item.id]);
    }
    console.log(`[Escalation] Processed ${items.length} overdue deadlines`);
  } catch (err) { console.error('Escalation error:', err.message); }
};
