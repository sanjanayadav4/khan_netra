'use strict';
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs   = require('fs');

/* ════════════════════════════════════════════════════════════════════
   GET /inspections — paginated list with role-scoping
════════════════════════════════════════════════════════════════════ */
exports.getAll = async (req, res, next) => {
  try {
    const { mine_id, status, type, page = 1, limit = 20 } = req.query;
    const off = (page - 1) * limit;
    let c = [], p = [];

    if (req.user.role === 'mine_manager' && req.user.mine_id) {
      c.push('ins.mine_id=?'); p.push(req.user.mine_id);
    } else if (mine_id) {
      c.push('ins.mine_id=?'); p.push(mine_id);
    }
    if (req.user.role === 'inspector') { c.push('ins.inspector_id=?'); p.push(req.user.id); }
    if (status) { c.push('ins.status=?');  p.push(status); }
    if (type)   { c.push('ins.type=?');    p.push(type); }

    const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as c FROM inspections ins ${w}`, p)).rows[0].c;
    const rows  = (await query(
      `SELECT ins.*,
              m.name as mine_name, m.state,
              u.full_name as inspector_name
       FROM inspections ins
       JOIN  mines m ON ins.mine_id = m.id
       LEFT JOIN users u ON ins.inspector_id = u.id
       ${w}
       ORDER BY ins.scheduled_date DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, off]
    )).rows;

    res.json({ success: true, data: rows, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /inspections/schedule — upcoming
════════════════════════════════════════════════════════════════════ */
exports.getSchedule = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const mf  = req.user.role === 'mine_manager' && req.user.mine_id ? `AND ins.mine_id='${req.user.mine_id}'` : '';
    const inf = req.user.role === 'inspector' ? `AND ins.inspector_id='${req.user.id}'` : '';
    const rows = (await query(
      `SELECT ins.*, m.name as mine_name, m.state, u.full_name as inspector_name
       FROM inspections ins
       JOIN mines m ON ins.mine_id = m.id
       LEFT JOIN users u ON ins.inspector_id = u.id
       WHERE ins.scheduled_date BETWEEN date('now') AND date('now','+${parseInt(days)} days')
         AND ins.status IN ('scheduled','in_progress')
         ${mf} ${inf}
       ORDER BY ins.scheduled_date ASC`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /inspections/stats — summary counts
════════════════════════════════════════════════════════════════════ */
exports.getStats = async (req, res, next) => {
  try {
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf  = mId ? `AND mine_id='${mId}'` : '';
    const [counts, byType, byStatus, avgScore] = await Promise.all([
      query(`SELECT COUNT(*) as total,
               SUM(CASE WHEN status='scheduled'   THEN 1 ELSE 0 END) as scheduled,
               SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as in_progress,
               SUM(CASE WHEN status='completed'   THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN follow_up_required=1 THEN 1 ELSE 0 END) as follow_up
             FROM inspections WHERE 1=1 ${mf}`),
      query(`SELECT type, COUNT(*) as count FROM inspections WHERE 1=1 ${mf} GROUP BY type ORDER BY count DESC LIMIT 5`),
      query(`SELECT status, COUNT(*) as count FROM inspections WHERE 1=1 ${mf} GROUP BY status`),
      query(`SELECT ROUND(AVG(overall_score),1) as avg FROM inspections WHERE status='completed' AND overall_score IS NOT NULL ${mf}`),
    ]);
    res.json({
      success: true,
      data: {
        ...counts.rows[0],
        avg_score: avgScore.rows[0]?.avg || 0,
        by_type:   byType.rows,
        by_status: byStatus.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /inspections/:id — single + checklist + corrective actions
════════════════════════════════════════════════════════════════════ */
exports.getById = async (req, res, next) => {
  try {
    const ins = (await query(
      `SELECT ins.*, m.name as mine_name, m.state, m.type as mine_type,
              u.full_name as inspector_name
       FROM inspections ins
       JOIN mines m ON ins.mine_id = m.id
       LEFT JOIN users u ON ins.inspector_id = u.id
       WHERE ins.id=?`, [req.params.id]
    )).rows[0];
    if (!ins) return res.status(404).json({ success: false, message: 'Not found' });

    const checklist = (await query(
      'SELECT * FROM inspection_checklist WHERE inspection_id=? ORDER BY category', [req.params.id]
    )).rows;

    const actions = (await query(
      `SELECT ca.*, u.full_name as resolved_by_name
       FROM inspection_corrective_actions ca
       LEFT JOIN users u ON ca.resolved_by = u.id
       WHERE ca.inspection_id=? ORDER BY ca.created_at ASC`, [req.params.id]
    )).rows;

    // Parse JSON fields safely
    const evidencePhotos = (() => { try { return JSON.parse(ins.evidence_photos || '[]'); } catch { return []; } })();

    res.json({ success: true, data: { ...ins, evidence_photos: evidencePhotos, checklist, corrective_actions: actions } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /inspections — create / schedule
════════════════════════════════════════════════════════════════════ */
exports.create = async (req, res, next) => {
  try {
    const { mine_id, type, scheduled_date, inspector_id, location_in_mine, section } = req.body;
    if (!mine_id || !type || !scheduled_date)
      return res.status(400).json({ success: false, message: 'mine_id, type, scheduled_date required' });

    const cnt = (await query('SELECT COUNT(*) as c FROM inspections')).rows[0].c;
    const num = `INS-${new Date().getFullYear()}-${String(cnt + 1).padStart(4, '0')}`;
    const id  = uuidv4();
    const assignedTo = inspector_id || req.user.id;

    await query(
      `INSERT INTO inspections
         (id, inspection_number, mine_id, type, scheduled_date, inspector_id,
          status, location_in_mine, section)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      [id, num, mine_id, type, scheduled_date, assignedTo,
       location_in_mine || null, section || null]
    );

    await query(
      `UPDATE mines SET next_inspection_date=?, updated_at=datetime('now') WHERE id=?`,
      [scheduled_date, mine_id]
    );

    await query(
      `INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), assignedTo, mine_id, 'Inspection Scheduled',
       `A ${type} inspection is scheduled for ${scheduled_date}${location_in_mine ? ' at ' + location_in_mine : ''}`,
       'info', 'medium']
    );

    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'CREATE', 'inspection', id,
       `Scheduled ${type} inspection ${num}`, mine_id, req.ip]
    );

    const row = (await query(
      `SELECT ins.*, m.name as mine_name, u.full_name as inspector_name
       FROM inspections ins JOIN mines m ON ins.mine_id=m.id LEFT JOIN users u ON ins.inspector_id=u.id
       WHERE ins.id=?`, [id]
    )).rows[0];

    res.status(201).json({ success: true, message: 'Inspection scheduled', data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   PUT /inspections/:id — update status / findings / geo / notes
════════════════════════════════════════════════════════════════════ */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = (await query('SELECT * FROM inspections WHERE id=?', [id])).rows[0];
    if (!existing) return res.status(404).json({ success: false, message: 'Inspection not found' });

    const allowed = [
      'status', 'completed_date', 'overall_score', 'findings', 'recommendations',
      'follow_up_required', 'follow_up_date', 'checklist_completed',
      'inspector_id', 'location_in_mine', 'section',
      'gps_lat', 'gps_lon', 'gps_captured_at',
      'inspector_notes', 'risk_level',
    ];

    const sets = [], p = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); p.push(req.body[k]); }
    }

    if (req.body.status === 'completed' && !req.body.completed_date) {
      sets.push(`completed_date=date('now')`);
    }

    sets.push(`updated_at=datetime('now')`);
    p.push(id);
    await query(`UPDATE inspections SET ${sets.join(',')} WHERE id=?`, p);

    const row = (await query('SELECT * FROM inspections WHERE id=?', [id])).rows[0];

    if (row.status === 'completed' && existing.status !== 'completed') {
      await query(
        `UPDATE mines SET last_inspection_date=?, updated_at=datetime('now') WHERE id=?`,
        [row.completed_date, row.mine_id]
      );

      try {
        const { recalculateAllMineScores } = require('../services/analyticsService');
        await recalculateAllMineScores();
      } catch (e) { console.error('[Inspection] Score recalc failed:', e.message); }

      const admins = (await query(`SELECT id FROM users WHERE role IN ('admin','government_officer')`)).rows;
      const score  = row.overall_score ? ` — Score: ${parseFloat(row.overall_score).toFixed(0)}%` : '';
      for (const a of admins) {
        await query(
          `INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority) VALUES (?,?,?,?,?,?,?)`,
          [uuidv4(), a.id, row.mine_id, '✅ Inspection Completed',
           `${row.inspection_number} (${row.type}) completed${score}`,
           'info', row.overall_score && row.overall_score < 60 ? 'high' : 'medium']
        );
      }

      await query(
        `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(), req.user.id, 'COMPLETE', 'inspection', row.id,
         `Inspection ${row.inspection_number} completed. Score: ${row.overall_score ?? 'N/A'}`,
         row.mine_id, req.ip]
      );
    }

    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /inspections/checklist — save full checklist with results
════════════════════════════════════════════════════════════════════ */
exports.saveChecklist = async (req, res, next) => {
  try {
    const { inspection_id, items } = req.body;
    if (!items || !Array.isArray(items))
      return res.status(400).json({ success: false, message: 'items array required' });

    await query('DELETE FROM inspection_checklist WHERE inspection_id=?', [inspection_id]);

    let totalScore = 0, passed = 0, failed = 0, na = 0;

    for (const item of items) {
      const result = item.result || (item.is_compliant === true ? 'pass' : item.is_compliant === false ? 'fail' : 'na');
      const score  = result === 'pass' ? 100 : result === 'fail' ? 0 : null;
      const compliant = result === 'pass' ? 1 : result === 'fail' ? 0 : null;

      await query(
        `INSERT INTO inspection_checklist
           (id, inspection_id, category, item_description, is_compliant, score,
            remarks, result, observation, evidence_photo)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), inspection_id, item.category, item.item_description,
         compliant, score, item.remarks || null,
         result, item.observation || null, item.evidence_photo || null]
      );

      if (result === 'pass') { passed++;  totalScore += 100; }
      if (result === 'fail')   failed++;
      if (result === 'na')     na++;
    }

    const countedItems = passed + failed;   // na items excluded from score
    const overallScore = countedItems > 0 ? Math.round(totalScore / countedItems) : 0;
    const totalChecks  = items.length;

    // Risk level based on score and failures
    const failRate = countedItems > 0 ? failed / countedItems : 0;
    const riskLevel = overallScore >= 80 && failRate < 0.1 ? 'Low'
      : overallScore >= 60 && failRate < 0.3 ? 'Medium'
      : overallScore >= 40 ? 'High' : 'Critical';

    await query(
      `UPDATE inspections
       SET checklist_completed=1, overall_score=?, risk_level=?,
           total_checks=?, passed_checks=?, failed_checks=?,
           updated_at=datetime('now')
       WHERE id=?`,
      [overallScore, riskLevel, totalChecks, passed, failed, inspection_id]
    );

    res.json({
      success: true,
      message: 'Checklist saved',
      data: { overall_score: overallScore, risk_level: riskLevel, total_checks: totalChecks, passed, failed, na },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /inspections/:id/photo — upload evidence photo
   Expects multipart/form-data with field "photo"
════════════════════════════════════════════════════════════════════ */
exports.uploadPhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ins = (await query('SELECT id, evidence_photos FROM inspections WHERE id=?', [id])).rows[0];
    if (!ins) return res.status(404).json({ success: false, message: 'Inspection not found' });

    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const filePath = `/uploads/docs/${req.file.filename}`;
    let photos = [];
    try { photos = JSON.parse(ins.evidence_photos || '[]'); } catch {}
    photos.push({ path: filePath, original: req.file.originalname, uploaded_at: new Date().toISOString() });

    await query(
      `UPDATE inspections SET evidence_photos=?, updated_at=datetime('now') WHERE id=?`,
      [JSON.stringify(photos), id]
    );

    res.json({ success: true, data: { file_path: filePath, photos } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /inspections/:id/corrective-actions
════════════════════════════════════════════════════════════════════ */
exports.getCorrectiveActions = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT ca.*, u.full_name as resolved_by_name
       FROM inspection_corrective_actions ca
       LEFT JOIN users u ON ca.resolved_by = u.id
       WHERE ca.inspection_id=? ORDER BY ca.created_at ASC`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /inspections/:id/corrective-actions — create corrective action
════════════════════════════════════════════════════════════════════ */
exports.createCorrectiveAction = async (req, res, next) => {
  try {
    const { id: inspection_id } = req.params;
    const {
      observation, responsible_person, department,
      priority, due_date, inspection_checklist_id, requires_reinspection,
    } = req.body;

    if (!observation?.trim())
      return res.status(400).json({ success: false, message: 'Observation is required' });

    const ins = (await query('SELECT mine_id FROM inspections WHERE id=?', [inspection_id])).rows[0];
    if (!ins) return res.status(404).json({ success: false, message: 'Inspection not found' });

    const caId = uuidv4();
    await query(
      `INSERT INTO inspection_corrective_actions
         (id, inspection_id, inspection_checklist_id, mine_id, observation,
          responsible_person, department, priority, due_date,
          status, requires_reinspection, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [caId, inspection_id, inspection_checklist_id || null, ins.mine_id,
       observation.trim(), responsible_person || null, department || null,
       priority || 'medium', due_date || null,
       'open', requires_reinspection ? 1 : 0, req.user.id]
    );

    // Update count on inspection
    await query(
      `UPDATE inspections SET corrective_actions_count = (
         SELECT COUNT(*) FROM inspection_corrective_actions WHERE inspection_id=?
       ), updated_at=datetime('now') WHERE id=?`,
      [inspection_id, inspection_id]
    );

    const row = (await query('SELECT * FROM inspection_corrective_actions WHERE id=?', [caId])).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   PUT /inspections/corrective-actions/:caId — update status / resolve
════════════════════════════════════════════════════════════════════ */
exports.updateCorrectiveAction = async (req, res, next) => {
  try {
    const { caId } = req.params;
    const { status, resolution_notes, resolution_evidence, requires_reinspection } = req.body;

    const sets = [`updated_at=datetime('now')`], p = [];
    if (status)              { sets.push('status=?');              p.push(status); }
    if (resolution_notes)    { sets.push('resolution_notes=?');    p.push(resolution_notes); }
    if (resolution_evidence) { sets.push('resolution_evidence=?'); p.push(resolution_evidence); }
    if (requires_reinspection !== undefined) {
      sets.push('requires_reinspection=?'); p.push(requires_reinspection ? 1 : 0);
    }
    if (status === 'resolved') {
      sets.push(`resolved_at=datetime('now')`);
      sets.push('resolved_by=?'); p.push(req.user.id);
    }

    p.push(caId);
    await query(`UPDATE inspection_corrective_actions SET ${sets.join(',')} WHERE id=?`, p);

    const row = (await query('SELECT * FROM inspection_corrective_actions WHERE id=?', [caId])).rows[0];
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};
