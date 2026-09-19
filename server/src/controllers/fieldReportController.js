'use strict';
const { query } = require('../config/database');
const { v4: uuid } = require('uuid');

exports.getAll = async (req, res, next) => {
  try {
    const { mine_id, severity, status, report_type, page = 1, limit = 20 } = req.query;
    const off = (page - 1) * limit;
    let c = [], p = [];
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)        { c.push('fr.mine_id = ?');      p.push(mId); }
    if (severity)   { c.push('fr.severity = ?');     p.push(severity); }
    if (status)     { c.push('fr.status = ?');       p.push(status); }
    if (report_type){ c.push('fr.report_type = ?');  p.push(report_type); }
    const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as n FROM field_reports fr ${w}`, p)).rows[0].n;
    const rows  = (await query(
      `SELECT fr.*, m.name as mine_name, u.full_name as reporter_name
       FROM field_reports fr
       JOIN mines m ON fr.mine_id = m.id
       LEFT JOIN users u ON fr.reported_by = u.id
       ${w} ORDER BY
         CASE fr.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,
         fr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, off]
    )).rows;
    res.json({ success: true, data: rows, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const r = (await query(
      `SELECT fr.*, m.name as mine_name, u.full_name as reporter_name
       FROM field_reports fr JOIN mines m ON fr.mine_id=m.id LEFT JOIN users u ON fr.reported_by=u.id
       WHERE fr.id=?`,
      [req.params.id]
    )).rows[0];
    if (!r) return res.status(404).json({ success: false, message: 'Field report not found' });
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const {
      mine_id, report_type, title, description,
      latitude, longitude, location_name,
      severity, tags, follow_up_required, follow_up_date,
    } = req.body;
    if (!mine_id || !title || !description || !report_type)
      return res.status(400).json({ success: false, message: 'mine_id, report_type, title, description required' });

    const cnt = (await query('SELECT COUNT(*) as n FROM field_reports')).rows[0].n;
    const num = `FR-${new Date().getFullYear()}-${String(cnt + 1).padStart(4, '0')}`;
    const id  = uuid();

    // Attach uploaded image paths if any
    let images = null;
    if (req.files?.length) {
      images = JSON.stringify(req.files.map(f => `/uploads/docs/${f.filename}`));
    }

    await query(
      `INSERT INTO field_reports (id,report_number,mine_id,reported_by,report_type,title,description,
        latitude,longitude,location_name,severity,status,images,tags,follow_up_required,follow_up_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, num, mine_id, req.user.id, report_type, title, description,
       latitude || null, longitude || null, location_name,
       severity || 'info', 'open',
       images, tags ? JSON.stringify(tags) : null,
       follow_up_required ? 1 : 0, follow_up_date || null]
    );

    // Notify mine manager and admins for critical/high reports
    if (['critical','high'].includes(severity)) {
      const admins = (await query(`SELECT id FROM users WHERE role IN ('admin','government_officer','inspector')`)).rows;
      for (const a of admins) {
        await query(
          `INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,
          [uuid(), a.id, mine_id, `📍 ${severity.toUpperCase()} Field Report`, `${title} — ${location_name || 'Unknown location'}`, 'alert', severity === 'critical' ? 'critical' : 'high']
        );
      }
    }

    // Audit
    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'CREATE', 'field_report', id, `Field report: ${title}`, mine_id, req.ip]
    );

    const row = (await query('SELECT * FROM field_reports WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, message: 'Field report submitted', data: row });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['title','description','severity','status','follow_up_required',
      'follow_up_date','resolved_date','resolution_notes','location_name'];
    const sets = [], p = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); p.push(req.body[k]); }
    }
    if (req.body.status === 'resolved' && !req.body.resolved_date) {
      sets.push(`resolved_date = date('now')`);
      sets.push(`resolved_by = ?`); p.push(req.user.id);
    }
    sets.push(`updated_at = datetime('now')`);
    p.push(id);
    await query(`UPDATE field_reports SET ${sets.join(',')} WHERE id=?`, p);
    const row = (await query('SELECT * FROM field_reports WHERE id=?', [id])).rows[0];
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

exports.getMapData = async (req, res, next) => {
  try {
    const mineId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf = mineId ? `AND fr.mine_id = '${mineId}'` : '';
    // Return only reports with geo-coordinates for map display
    const rows = (await query(
      `SELECT fr.id, fr.report_number, fr.title, fr.report_type, fr.severity, fr.status,
              fr.latitude, fr.longitude, fr.location_name, fr.created_at,
              m.name as mine_name, u.full_name as reporter_name
       FROM field_reports fr
       JOIN mines m ON fr.mine_id = m.id
       LEFT JOIN users u ON fr.reported_by = u.id
       WHERE fr.latitude IS NOT NULL AND fr.longitude IS NOT NULL
       AND fr.status != 'resolved' ${mf}
       ORDER BY fr.created_at DESC`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};
