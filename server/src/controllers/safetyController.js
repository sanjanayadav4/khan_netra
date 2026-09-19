'use strict';
const { query } = require('../config/database');
const { v4: uuid } = require('uuid');

/* ── helpers ────────────────────────────────────────────────────────── */
const logAudit = (uid, action, etype, eid, desc, mid, ip) =>
  query(`INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
    [uuid(), uid, action, etype, eid, desc, mid, ip]).catch(() => {});

const notifyRoles = async (roles, mineId, title, message, priority = 'high') => {
  const users = (await query(`SELECT id FROM users WHERE role IN (${roles.map(()=>'?').join(',')})`, roles)).rows;
  for (const u of users)
    await query(`INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,
      [uuid(), u.id, mineId, title, message, 'alert', priority]).catch(() => {});
};

/* ══════════════════════════════════════════════════════════════════════
   SAFETY OBSERVATIONS
══════════════════════════════════════════════════════════════════════ */

exports.getAllObservations = async (req, res, next) => {
  try {
    const { mine_id, severity, status, type, page = 1, limit = 20 } = req.query;
    const off = (page - 1) * limit;
    let c = [], p = [];
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)     { c.push('so.mine_id=?');    p.push(mId); }
    if (severity){ c.push('so.severity=?');   p.push(severity); }
    if (status)  { c.push('so.status=?');     p.push(status); }
    if (type)    { c.push('so.type=?');       p.push(type); }
    const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as n FROM safety_observations so ${w}`, p)).rows[0].n;
    const rows  = (await query(
      `SELECT so.*, m.name as mine_name, u.full_name as reporter_name,
              a.full_name as assigned_to_name
       FROM safety_observations so
       JOIN mines m ON so.mine_id = m.id
       LEFT JOIN users u ON so.reported_by = u.id
       LEFT JOIN users a ON so.assigned_to  = a.id
       ${w}
       ORDER BY CASE so.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                so.observed_at DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, off]
    )).rows;
    res.json({ success: true, data: rows, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

exports.getObservationById = async (req, res, next) => {
  try {
    const r = (await query(
      `SELECT so.*, m.name as mine_name, u.full_name as reporter_name, a.full_name as assigned_to_name
       FROM safety_observations so JOIN mines m ON so.mine_id=m.id
       LEFT JOIN users u ON so.reported_by=u.id LEFT JOIN users a ON so.assigned_to=a.id
       WHERE so.id=?`, [req.params.id]
    )).rows[0];
    if (!r) return res.status(404).json({ success: false, message: 'Not found' });
    const photos = (() => { try { return JSON.parse(r.evidence_photos || '[]'); } catch { return []; } })();
    const cas = (await query(
      `SELECT sca.*, u.full_name as assigned_to_name FROM safety_corrective_actions sca
       LEFT JOIN users u ON sca.assigned_to=u.id
       WHERE sca.source_id=? AND sca.source_type='observation'`, [req.params.id]
    )).rows;
    res.json({ success: true, data: { ...r, evidence_photos: photos, corrective_actions: cas } });
  } catch (err) { next(err); }
};

exports.createObservation = async (req, res, next) => {
  try {
    const { mine_id, type, severity, title, description, location, section,
            latitude, longitude, gps_accuracy, observed_at, assigned_to, requires_action } = req.body;
    if (!mine_id || !type || !title || !description || !observed_at)
      return res.status(400).json({ success: false, message: 'mine_id, type, title, description, observed_at required' });

    const cnt = (await query('SELECT COUNT(*) as n FROM safety_observations')).rows[0].n;
    const num = `OBS-${new Date().getFullYear()}-${String(cnt + 1).padStart(4, '0')}`;
    const id  = uuid();

    let photos = [];
    if (req.files?.length) photos = req.files.map(f => `/uploads/docs/${f.filename}`);

    await query(
      `INSERT INTO safety_observations
         (id, observation_number, mine_id, reported_by, type, severity, title, description,
          location, section, latitude, longitude, gps_accuracy, observed_at,
          evidence_photos, status, assigned_to, requires_action)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, num, mine_id, req.user.id, type, severity || 'medium', title, description,
       location || null, section || null,
       latitude  ? parseFloat(latitude)  : null,
       longitude ? parseFloat(longitude) : null,
       gps_accuracy ? parseInt(gps_accuracy) : null,
       observed_at,
       photos.length ? JSON.stringify(photos) : null,
       'open', assigned_to || null, requires_action ? 1 : 0]
    );

    if (['critical', 'high'].includes(severity)) {
      await notifyRoles(
        ['admin', 'government_officer', 'inspector', 'safety_officer'],
        mine_id,
        `⚠️ ${severity.toUpperCase()} Safety Observation`,
        `${title} — ${location || 'Unknown location'}`,
        severity === 'critical' ? 'critical' : 'high'
      );
    }
    await logAudit(req.user.id, 'CREATE_OBSERVATION', 'safety_observation', id, `Observation: ${title}`, mine_id, req.ip);

    const row = (await query('SELECT * FROM safety_observations WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

exports.updateObservation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['status', 'resolution_notes', 'assigned_to', 'severity', 'description', 'requires_action'];
    const sets = [`updated_at=datetime('now')`], p = [];
    for (const k of allowed) { if (req.body[k] !== undefined) { sets.push(`${k}=?`); p.push(req.body[k]); } }
    if (req.body.status === 'resolved') {
      sets.push(`resolved_at=datetime('now')`); sets.push('resolved_by=?'); p.push(req.user.id);
    }
    p.push(id);
    await query(`UPDATE safety_observations SET ${sets.join(',')} WHERE id=?`, p);
    const row = (await query('SELECT * FROM safety_observations WHERE id=?', [id])).rows[0];
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

exports.uploadObservationPhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const obs = (await query('SELECT id, evidence_photos FROM safety_observations WHERE id=?', [id])).rows[0];
    if (!obs) return res.status(404).json({ success: false, message: 'Not found' });
    if (!req.file)  return res.status(400).json({ success: false, message: 'No file uploaded' });
    const filePath = `/uploads/docs/${req.file.filename}`;
    let photos = []; try { photos = JSON.parse(obs.evidence_photos || '[]'); } catch {}
    photos.push({ path: filePath, uploaded_at: new Date().toISOString() });
    await query(`UPDATE safety_observations SET evidence_photos=?, updated_at=datetime('now') WHERE id=?`,
      [JSON.stringify(photos), id]);
    res.json({ success: true, data: { file_path: filePath, photos } });
  } catch (err) { next(err); }
};

/* Dashboard stats */
exports.getObservationStats = async (req, res, next) => {
  try {
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf  = mId ? `AND mine_id='${mId}'` : '';
    const [counts, bySev, byType] = await Promise.all([
      query(`SELECT COUNT(*) as total,
               SUM(CASE WHEN status='open'     THEN 1 ELSE 0 END) as open_count,
               SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved,
               SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical
             FROM safety_observations WHERE 1=1 ${mf}`),
      query(`SELECT severity, COUNT(*) as count FROM safety_observations WHERE 1=1 ${mf} GROUP BY severity`),
      query(`SELECT type, COUNT(*) as count FROM safety_observations WHERE 1=1 ${mf} GROUP BY type ORDER BY count DESC LIMIT 5`),
    ]);
    res.json({ success: true, data: { ...counts.rows[0], by_severity: bySev.rows, by_type: byType.rows } });
  } catch (err) { next(err); }
};

/* ══════════════════════════════════════════════════════════════════════
   SAFETY CORRECTIVE ACTIONS
══════════════════════════════════════════════════════════════════════ */

exports.getAllCAs = async (req, res, next) => {
  try {
    const { mine_id, status, priority, source_type, page = 1, limit = 20 } = req.query;
    const off = (page - 1) * limit;
    let c = [], p = [];
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)       { c.push('sca.mine_id=?');     p.push(mId); }
    if (status)    { c.push('sca.status=?');      p.push(status); }
    if (priority)  { c.push('sca.priority=?');    p.push(priority); }
    if (source_type){ c.push('sca.source_type=?'); p.push(source_type); }
    const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as n FROM safety_corrective_actions sca ${w}`, p)).rows[0].n;
    const rows  = (await query(
      `SELECT sca.*,
              m.name as mine_name,
              a.full_name as assigned_to_name,
              ab.full_name as assigned_by_name
       FROM safety_corrective_actions sca
       JOIN mines m ON sca.mine_id = m.id
       LEFT JOIN users a  ON sca.assigned_to = a.id
       LEFT JOIN users ab ON sca.assigned_by  = ab.id
       ${w}
       ORDER BY
         sca.is_overdue DESC,
         CASE sca.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         sca.due_date ASC
       LIMIT ? OFFSET ?`,
      [...p, limit, off]
    )).rows;
    res.json({ success: true, data: rows, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

exports.createCA = async (req, res, next) => {
  try {
    const { mine_id, source_type, source_id, problem_description, action_description,
            assigned_to, department, priority, due_date, requires_reinspection } = req.body;
    if (!mine_id || !source_type || !source_id || !problem_description)
      return res.status(400).json({ success: false, message: 'mine_id, source_type, source_id, problem_description required' });

    const cnt = (await query('SELECT COUNT(*) as n FROM safety_corrective_actions')).rows[0].n;
    const num = `SCA-${new Date().getFullYear()}-${String(cnt + 1).padStart(4, '0')}`;
    const id  = uuid();

    await query(
      `INSERT INTO safety_corrective_actions
         (id, action_number, mine_id, source_type, source_id,
          problem_description, action_description, assigned_to, assigned_by,
          department, priority, due_date, status, requires_reinspection)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, num, mine_id, source_type, source_id,
       problem_description, action_description || null,
       assigned_to || null, req.user.id,
       department || null, priority || 'medium', due_date || null,
       'open', requires_reinspection ? 1 : 0]
    );

    await logAudit(req.user.id, 'CREATE_SAFETY_CA', 'safety_corrective_action', id,
      `CA created for ${source_type}: ${problem_description.slice(0, 80)}`, mine_id, req.ip);

    const row = (await query('SELECT * FROM safety_corrective_actions WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

exports.updateCA = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['status', 'action_description', 'completion_notes', 'completion_evidence',
                     'assigned_to', 'due_date', 'priority', 'escalation_level', 'requires_reinspection'];
    const sets = [`updated_at=datetime('now')`], p = [];
    for (const k of allowed) { if (req.body[k] !== undefined) { sets.push(`${k}=?`); p.push(req.body[k]); } }
    if (req.body.status === 'completed') {
      sets.push(`completed_date=date('now')`);
    }
    if (req.body.status === 'verified') {
      sets.push('verified_by=?'); p.push(req.user.id);
      sets.push(`verified_at=datetime('now')`);
    }
    p.push(id);
    await query(`UPDATE safety_corrective_actions SET ${sets.join(',')} WHERE id=?`, p);
    const row = (await query('SELECT * FROM safety_corrective_actions WHERE id=?', [id])).rows[0];
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* Auto-mark overdue + escalation alert */
exports.markOverdue = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE safety_corrective_actions
       SET is_overdue = 1, escalation_level = escalation_level + 1, updated_at = datetime('now')
       WHERE due_date < date('now')
         AND status NOT IN ('completed', 'verified')
         AND (is_overdue = 0 OR escalation_level < 3)`
    );

    // Fetch newly overdue items and notify
    const overdue = (await query(
      `SELECT sca.*, m.name as mine_name
       FROM safety_corrective_actions sca JOIN mines m ON sca.mine_id = m.id
       WHERE sca.due_date < date('now') AND sca.status NOT IN ('completed','verified')
         AND sca.escalation_level >= 1`
    )).rows;

    for (const ca of overdue.slice(0, 20)) {
      await notifyRoles(
        ['admin', 'government_officer', 'inspector'],
        ca.mine_id,
        `🔴 Overdue Corrective Action: ${ca.action_number}`,
        `${ca.problem_description?.slice(0, 100)} — due ${ca.due_date} (Level ${ca.escalation_level})`,
        ca.escalation_level >= 2 ? 'critical' : 'high'
      );
    }

    res.json({ success: true, data: { marked_overdue: result.rowsAffected || 0, overdue_count: overdue.length } });
  } catch (err) { next(err); }
};

exports.getCAStats = async (req, res, next) => {
  try {
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf  = mId ? `AND mine_id='${mId}'` : '';
    const [counts, byPriority, byStatus] = await Promise.all([
      query(`SELECT COUNT(*) as total,
               SUM(CASE WHEN status='open'       THEN 1 ELSE 0 END) as open_count,
               SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
               SUM(CASE WHEN status='completed'  THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN is_overdue=1 AND status NOT IN ('completed','verified') THEN 1 ELSE 0 END) as overdue
             FROM safety_corrective_actions WHERE 1=1 ${mf}`),
      query(`SELECT priority, COUNT(*) as count FROM safety_corrective_actions WHERE 1=1 ${mf} GROUP BY priority`),
      query(`SELECT status, COUNT(*) as count FROM safety_corrective_actions WHERE 1=1 ${mf} GROUP BY status`),
    ]);
    res.json({ success: true, data: { ...counts.rows[0], by_priority: byPriority.rows, by_status: byStatus.rows } });
  } catch (err) { next(err); }
};

/* Expanded incident creation (adds evidence, people_involved, immediate_action) */
exports.createIncident = async (req, res, next) => {
  try {
    const {
      mine_id, type, severity, category, description, incident_date,
      location_in_mine, injuries_count = 0, fatalities_count = 0, affected_workers = 0,
      latitude, longitude, gps_accuracy,
      people_involved, immediate_action, witness_names, equipment_involved,
    } = req.body;
    if (!mine_id || !type || !severity || !description || !incident_date)
      return res.status(400).json({ success: false, message: 'Required fields missing' });

    const cnt = (await query('SELECT COUNT(*) as c FROM incidents')).rows[0].c;
    const num = `INC-${new Date().getFullYear()}-${String(cnt + 1).padStart(4, '0')}`;
    const id  = uuid();
    const dgms = ['fatal', 'serious'].includes(severity) ? 1 : 0;

    let photos = [];
    if (req.files?.length) photos = req.files.map(f => `/uploads/docs/${f.filename}`);

    await query(
      `INSERT INTO incidents
         (id,incident_number,mine_id,type,severity,category,description,incident_date,
          location_in_mine,injuries_count,fatalities_count,affected_workers,
          latitude,longitude,gps_accuracy,
          people_involved,immediate_action,witness_names,equipment_involved,evidence_photos,
          status,reported_by,dgms_notified,dgms_notification_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?)`,
      [
        id, num, mine_id, type, severity, category || type, description, incident_date,
        location_in_mine || null, injuries_count, fatalities_count, affected_workers,
        latitude  ? parseFloat(latitude)  : null,
        longitude ? parseFloat(longitude) : null,
        gps_accuracy ? parseInt(gps_accuracy) : null,
        people_involved || null, immediate_action || null,
        witness_names || null, equipment_involved || null,
        photos.length ? JSON.stringify(photos) : null,
        req.user.id, dgms, dgms ? new Date().toISOString().split('T')[0] : null,
      ]
    );

    if (dgms) {
      await notifyRoles(['admin', 'government_officer', 'inspector'],
        mine_id, `🚨 ${severity.toUpperCase()} Incident`,
        `${type}: ${description.substring(0, 80)}`, 'critical');
    }
    await logAudit(req.user.id, 'CREATE_INCIDENT', 'incident', id, `Incident: ${type}`, mine_id, req.ip);

    const row = (await query('SELECT * FROM incidents WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, message: 'Incident reported', data: row });
  } catch (err) { next(err); }
};

/* Dashboard — combined safety hub stats */
exports.getSafetyDashboard = async (req, res, next) => {
  try {
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf  = mId ? `AND mine_id='${mId}'` : '';

    const [obsStats, incStats, caStats, recentObs, recentInc, overdueCA] = await Promise.all([
      query(`SELECT COUNT(*) as total, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count,
               SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical
             FROM safety_observations WHERE 1=1 ${mf}`),
      query(`SELECT COUNT(*) as total, SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count,
               SUM(CASE WHEN severity='fatal' THEN 1 ELSE 0 END) as fatal
             FROM incidents WHERE 1=1 ${mf}`),
      query(`SELECT COUNT(*) as total,
               SUM(CASE WHEN is_overdue=1 AND status NOT IN ('completed','verified') THEN 1 ELSE 0 END) as overdue,
               SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open_count
             FROM safety_corrective_actions WHERE 1=1 ${mf}`),
      query(`SELECT so.*, m.name as mine_name FROM safety_observations so JOIN mines m ON so.mine_id=m.id
             WHERE so.status='open' ${mf.replace('mine_id','so.mine_id')}
             ORDER BY CASE so.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, so.observed_at DESC LIMIT 5`),
      query(`SELECT i.*, m.name as mine_name FROM incidents i JOIN mines m ON i.mine_id=m.id
             WHERE i.status!='closed' ${mf.replace('mine_id','i.mine_id')}
             ORDER BY CASE i.severity WHEN 'fatal' THEN 1 WHEN 'serious' THEN 2 ELSE 3 END, i.incident_date DESC LIMIT 5`),
      query(`SELECT sca.*, m.name as mine_name FROM safety_corrective_actions sca JOIN mines m ON sca.mine_id=m.id
             WHERE sca.is_overdue=1 AND sca.status NOT IN ('completed','verified') ${mf.replace('mine_id','sca.mine_id')}
             ORDER BY sca.escalation_level DESC, sca.due_date ASC LIMIT 5`),
    ]);

    res.json({
      success: true,
      data: {
        observations: obsStats.rows[0],
        incidents:    incStats.rows[0],
        corrective_actions: caStats.rows[0],
        recent_observations: recentObs.rows,
        recent_incidents:    recentInc.rows,
        overdue_actions:     overdueCA.rows,
      },
    });
  } catch (err) { next(err); }
};
