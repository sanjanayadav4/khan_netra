'use strict';
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/* ════════════════════════════════════════════════════════════════════
   GET /compliance/records
════════════════════════════════════════════════════════════════════ */
exports.getRecords = async (req, res, next) => {
  try {
    const { mine_id, status, category, workflow_status } = req.query;
    let c = [], p = [];
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)             { c.push('cr.mine_id=?');          p.push(mId); }
    if (status)          { c.push('cr.status=?');            p.push(status); }
    if (category)        { c.push('cr.category=?');          p.push(category); }
    if (workflow_status) { c.push('cr.workflow_status=?');   p.push(workflow_status); }
    const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const rows = (await query(
      `SELECT cr.*,
              m.name as mine_name,
              u.full_name as verified_by_name,
              o.full_name as responsible_officer_name,
              a.full_name as approved_by_name
       FROM compliance_records cr
       JOIN mines m ON cr.mine_id = m.id
       LEFT JOIN users u ON cr.verified_by = u.id
       LEFT JOIN users o ON cr.responsible_officer = o.id
       LEFT JOIN users a ON cr.approved_by = a.id
       ${w}
       ORDER BY
         CASE cr.workflow_status
           WHEN 'rejected'           THEN 1
           WHEN 'pending'            THEN 2
           WHEN 'submitted'          THEN 3
           WHEN 'under_verification' THEN 4
           WHEN 'approved'           THEN 5
           ELSE 6 END,
         CASE cr.status
           WHEN 'non_compliant' THEN 1
           WHEN 'warning'       THEN 2
           ELSE 3 END,
         cr.due_date ASC`,
      p
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /compliance/dashboard — category breakdown + workflow counts
════════════════════════════════════════════════════════════════════ */
exports.getDashboard = async (req, res, next) => {
  try {
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf  = mId ? `AND mine_id = '${mId}'` : '';

    const [byCategory, byCatDetail, workflowCounts, overdue, upcoming] = await Promise.all([
      query(`SELECT category,
               ROUND(AVG(score), 1)   as avg_score,
               COUNT(*)               as total,
               SUM(CASE WHEN status='compliant'     THEN 1 ELSE 0 END) as compliant,
               SUM(CASE WHEN status='non_compliant' THEN 1 ELSE 0 END) as non_compliant,
               SUM(CASE WHEN status='warning'       THEN 1 ELSE 0 END) as warning,
               SUM(CASE WHEN status='pending'       THEN 1 ELSE 0 END) as pending_count
             FROM compliance_records WHERE 1=1 ${mf}
             GROUP BY category`),
      query(`SELECT ROUND(AVG(score),1) as overall FROM compliance_records WHERE 1=1 ${mf}`),
      query(`SELECT workflow_status, COUNT(*) as count
             FROM compliance_records WHERE 1=1 ${mf}
             GROUP BY workflow_status`),
      query(`SELECT COUNT(*) as c FROM compliance_records
             WHERE due_date < date('now') AND status != 'compliant' ${mf}`),
      query(`SELECT id, parameter_name, category, due_date, status, workflow_status,
                    mine_id,
                    julianday(due_date) - julianday('now') as days_remaining
             FROM compliance_records
             WHERE due_date BETWEEN date('now') AND date('now','+7 days')
               AND status != 'compliant'
               ${mf}
             ORDER BY due_date ASC LIMIT 10`),
    ]);

    const wf = {};
    for (const r of workflowCounts.rows) wf[r.workflow_status] = parseInt(r.count);

    res.json({
      success: true,
      data: {
        overall_score: parseFloat(byCatDetail.rows[0]?.overall || 0),
        by_category:   byCategory.rows,
        workflow: {
          pending:            wf.pending            || 0,
          submitted:          wf.submitted          || 0,
          under_verification: wf.under_verification || 0,
          approved:           wf.approved           || 0,
          rejected:           wf.rejected           || 0,
          overdue:            parseInt(overdue.rows[0]?.c) || 0,
        },
        upcoming_deadlines: upcoming.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /compliance/records
════════════════════════════════════════════════════════════════════ */
exports.create = async (req, res, next) => {
  try {
    const {
      mine_id, category, parameter_name, required_value, actual_value,
      status, score, notes, due_date, responsible_officer, document_id,
    } = req.body;

    const id = uuidv4();
    await query(
      `INSERT INTO compliance_records
         (id, mine_id, category, parameter_name, required_value, actual_value,
          status, score, notes, due_date, responsible_officer, document_id,
          verified_by, workflow_status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, mine_id, category, parameter_name, required_value,
       actual_value, status || 'pending', score || 0, notes,
       due_date, responsible_officer, document_id || null,
       req.user.id, 'pending']
    );

    await recalc(mine_id);
    await logAudit(req.user.id, 'CREATE_COMPLIANCE', 'compliance_record', id,
      `Created: ${parameter_name}`, mine_id, req.ip);

    const row = (await query(`
      SELECT cr.*, m.name as mine_name, o.full_name as responsible_officer_name
      FROM compliance_records cr
      JOIN mines m ON cr.mine_id = m.id
      LEFT JOIN users o ON cr.responsible_officer = o.id
      WHERE cr.id = ?`, [id])).rows[0];

    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   PUT /compliance/records/:id — general update
════════════════════════════════════════════════════════════════════ */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['actual_value', 'status', 'score', 'notes', 'due_date',
                     'responsible_officer', 'document_id', 'required_value'];
    const sets = [`verified_by=?`, `verification_date=date('now')`, `updated_at=datetime('now')`];
    const p    = [req.user.id];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); p.push(req.body[k]); }
    }
    p.push(id);
    await query(`UPDATE compliance_records SET ${sets.join(',')} WHERE id=?`, p);
    const row = (await query('SELECT * FROM compliance_records WHERE id=?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    await recalc(row.mine_id);
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /compliance/records/:id/submit
════════════════════════════════════════════════════════════════════ */
exports.submitRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { actual_value, notes, document_id } = req.body;

    const row = (await query('SELECT * FROM compliance_records WHERE id=?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Record not found' });
    if (!['pending', 'rejected'].includes(row.workflow_status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot submit — current status is ${row.workflow_status}`,
      });
    }

    const isResubmit = row.workflow_status === 'rejected';
    await query(
      `UPDATE compliance_records
       SET workflow_status     = 'submitted',
           actual_value        = COALESCE(?, actual_value),
           notes               = COALESCE(?, notes),
           document_id         = COALESCE(?, document_id),
           submitted_at        = datetime('now'),
           rejection_reason    = NULL,
           resubmission_count  = resubmission_count + ?,
           updated_at          = datetime('now')
       WHERE id = ?`,
      [actual_value || null, notes || null, document_id || null,
       isResubmit ? 1 : 0, id]
    );

    await logAudit(req.user.id,
      isResubmit ? 'RESUBMIT_COMPLIANCE' : 'SUBMIT_COMPLIANCE',
      'compliance_record', id,
      `${isResubmit ? 'Resubmitted' : 'Submitted'}: ${row.parameter_name}`,
      row.mine_id, req.ip);

    res.json({
      success: true,
      message: isResubmit
        ? 'Record resubmitted for verification.'
        : 'Record submitted for verification.',
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /compliance/records/:id/start-verification
════════════════════════════════════════════════════════════════════ */
exports.startVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const row = (await query('SELECT * FROM compliance_records WHERE id=?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    if (row.workflow_status !== 'submitted') {
      return res.status(400).json({
        success: false,
        message: 'Record must be in submitted state to begin verification',
      });
    }
    await query(
      `UPDATE compliance_records
       SET workflow_status='under_verification',
           verified_by=?,
           verification_date=date('now'),
           updated_at=datetime('now')
       WHERE id=?`,
      [req.user.id, id]
    );
    await logAudit(req.user.id, 'START_VERIFICATION', 'compliance_record', id,
      `Verification started: ${row.parameter_name}`, row.mine_id, req.ip);
    res.json({ success: true, message: 'Verification started.' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /compliance/records/:id/approve
════════════════════════════════════════════════════════════════════ */
exports.approveRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { notes, score } = req.body;

    const row = (await query('SELECT * FROM compliance_records WHERE id=?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });

    const finalScore = score !== undefined ? parseFloat(score) : parseFloat(row.score || 80);
    await query(
      `UPDATE compliance_records
       SET workflow_status  = 'approved',
           status           = 'compliant',
           score            = ?,
           notes            = COALESCE(?, notes),
           approved_by      = ?,
           approved_at      = datetime('now'),
           rejection_reason = NULL,
           updated_at       = datetime('now')
       WHERE id = ?`,
      [finalScore, notes || null, req.user.id, id]
    );
    await recalc(row.mine_id);
    await logAudit(req.user.id, 'APPROVE_COMPLIANCE', 'compliance_record', id,
      `Approved: ${row.parameter_name}`, row.mine_id, req.ip);
    res.json({ success: true, message: 'Compliance record approved.' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /compliance/records/:id/reject
════════════════════════════════════════════════════════════════════ */
exports.rejectRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    if (!rejection_reason || !rejection_reason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
    }

    const row = (await query('SELECT * FROM compliance_records WHERE id=?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    if (!['submitted', 'under_verification'].includes(row.workflow_status)) {
      return res.status(400).json({
        success: false,
        message: 'Can only reject submitted or under-verification records.',
      });
    }

    await query(
      `UPDATE compliance_records
       SET workflow_status  = 'rejected',
           status           = 'non_compliant',
           score            = MAX(0, score - 20),
           rejection_reason = ?,
           verified_by      = ?,
           verification_date= date('now'),
           updated_at       = datetime('now')
       WHERE id = ?`,
      [rejection_reason.trim(), req.user.id, id]
    );
    await recalc(row.mine_id);
    await logAudit(req.user.id, 'REJECT_COMPLIANCE', 'compliance_record', id,
      `Rejected: ${row.parameter_name} — ${rejection_reason.trim()}`,
      row.mine_id, req.ip);

    res.json({ success: true, message: 'Record rejected. Officer must correct and resubmit.' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /compliance/mine/:id/score
════════════════════════════════════════════════════════════════════ */
exports.getMineComplianceScore = async (req, res, next) => {
  try {
    const { id } = req.params;
    const bycat = (await query(
      `SELECT category,
              ROUND(AVG(score),1) as avg_score,
              COUNT(*) as total,
              SUM(CASE WHEN status='compliant'     THEN 1 ELSE 0 END) as compliant,
              SUM(CASE WHEN status='non_compliant' THEN 1 ELSE 0 END) as non_compliant,
              SUM(CASE WHEN status='warning'       THEN 1 ELSE 0 END) as warning,
              SUM(CASE WHEN workflow_status='approved' THEN 1 ELSE 0 END) as approved,
              SUM(CASE WHEN workflow_status='pending'  THEN 1 ELSE 0 END) as pending_wf
       FROM compliance_records WHERE mine_id=? GROUP BY category`, [id])).rows;
    const overall = (await query(
      'SELECT ROUND(AVG(score),1) as overall_score FROM compliance_records WHERE mine_id=?', [id]
    )).rows[0];
    res.json({ success: true, data: { by_category: bycat, overall_score: overall.overall_score } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /compliance/deadlines
════════════════════════════════════════════════════════════════════ */
exports.getDeadlines = async (req, res, next) => {
  try {
    const mId  = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf   = mId ? `AND cr.mine_id = '${mId}'` : '';
    const days = parseInt(req.query.days || 30, 10);

    const rows = (await query(
      `SELECT cr.id, cr.parameter_name, cr.category, cr.due_date,
              cr.status, cr.workflow_status, cr.mine_id,
              m.name as mine_name, cr.responsible_officer,
              o.full_name as responsible_officer_name,
              ROUND(julianday(cr.due_date) - julianday('now'), 0) as days_remaining
       FROM compliance_records cr
       JOIN mines m ON cr.mine_id = m.id
       LEFT JOIN users o ON cr.responsible_officer = o.id
       WHERE cr.due_date IS NOT NULL
         AND cr.due_date <= date('now', '+${days} days')
         AND cr.workflow_status NOT IN ('approved')
         ${mf}
       ORDER BY cr.due_date ASC
       LIMIT 50`, []
    )).rows;

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /compliance/regulations
════════════════════════════════════════════════════════════════════ */
exports.getRegulations = async (req, res, next) => {
  try {
    const { category, search } = req.query;
    let c = [`is_active=1`], p = [];
    if (category) { c.push('category=?'); p.push(category); }
    if (search)   {
      c.push(`(title LIKE ? OR description LIKE ? OR code LIKE ?)`);
      p.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const rows = (await query(
      `SELECT * FROM regulations WHERE ${c.join(' AND ')} ORDER BY category,code`, p
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /compliance/regulations
════════════════════════════════════════════════════════════════════ */
exports.createRegulation = async (req, res, next) => {
  try {
    const { code, title, category, description, effective_date,
            issuing_authority, penalty_range, applicable_mine_types } = req.body;
    const id = uuidv4();
    await query(
      `INSERT INTO regulations
         (id,code,title,category,description,effective_date,
          issuing_authority,penalty_range,applicable_mine_types)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, code, title, category, description, effective_date,
       issuing_authority, penalty_range, JSON.stringify(applicable_mine_types || [])]
    );
    res.status(201).json({
      success: true,
      data: (await query('SELECT * FROM regulations WHERE id=?', [id])).rows[0],
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /compliance/mine/:mine_id/ai-assessment
════════════════════════════════════════════════════════════════════ */
exports.runAiAssessment = async (req, res, next) => {
  try {
    const { mine_id } = req.params;
    const mine = (await query('SELECT * FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(404).json({ success: false, message: 'Mine not found' });

    const [v, inc, comp, env] = await Promise.all([
      query(`SELECT COUNT(*) as total,
                    SUM(CASE severity WHEN 'critical' THEN 1 ELSE 0 END) as critical,
                    SUM(CASE WHEN status!='closed' THEN 1 ELSE 0 END) as open
             FROM violations WHERE mine_id=?`, [mine_id]),
      query(`SELECT COUNT(*) as total, SUM(fatalities_count) as fatalities
             FROM incidents
             WHERE mine_id=? AND incident_date>=datetime('now','-1 year')`, [mine_id]),
      query(`SELECT ROUND(AVG(score),1) as avg FROM compliance_records WHERE mine_id=?`, [mine_id]),
      query(`SELECT COUNT(*) as alerts FROM environmental_readings
             WHERE mine_id=? AND status IN ('warning','critical')
               AND recorded_at>=datetime('now','-7 days')`, [mine_id]),
    ]);

    const vd = v.rows[0], id2 = inc.rows[0], cd = comp.rows[0], ed = env.rows[0];
    let risk = 0, recs = [];
    if (parseInt(vd.critical) > 0)   { risk += 30; recs.push({ priority:'CRITICAL', action:`Address ${vd.critical} critical violation(s) immediately.` }); }
    if (parseInt(vd.open) > 5)       { risk += 15; recs.push({ priority:'HIGH',     action:'Expedite closure of open violations.' }); }
    if (parseInt(id2.fatalities) > 0){ risk += 25; recs.push({ priority:'CRITICAL', action:'Conduct safety overhaul after fatal incidents.' }); }
    if (parseFloat(cd.avg||50) < 60) { risk += 20; recs.push({ priority:'HIGH',     action:'Implement 30-day compliance improvement plan.' }); }
    if (parseInt(ed.alerts) > 3)     { risk += 10; recs.push({ priority:'MEDIUM',   action:'Address environmental parameter exceedances.' }); }
    if (mine.license_expiry && new Date(mine.license_expiry) < new Date()) {
      risk += 20; recs.push({ priority:'CRITICAL', action:'Renew expired mining license immediately.' });
    }
    if (!recs.length) recs.push({ priority:'LOW', action:'Continue current practices. Schedule next review.' });

    const riskScore = Math.min(100, risk);
    const level = riskScore >= 70 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW';
    await query(`UPDATE mines SET risk_score=?, updated_at=datetime('now') WHERE id=?`, [riskScore, mine_id]);

    res.json({
      success: true,
      data: {
        mine_name: mine.name, risk_score: riskScore, risk_level: level,
        compliance_score: parseFloat(cd.avg || 0).toFixed(1),
        recommendations: recs,
        summary: `Risk: ${level}. ${vd.open} open violations (${vd.critical} critical), ${id2.total} incidents (${id2.fatalities} fatalities), ${ed.alerts} env alerts.`,
      },
    });
  } catch (err) { next(err); }
};

/* ── helpers ─────────────────────────────────────────────────────── */
async function recalc(mineId) {
  try {
    const r = (await query(
      'SELECT AVG(score) as avg FROM compliance_records WHERE mine_id=?', [mineId]
    )).rows[0];
    await query(
      `UPDATE mines SET compliance_score=?, updated_at=datetime('now') WHERE id=?`,
      [parseFloat(r.avg || 50), mineId]
    );
  } catch {}
}

async function logAudit(userId, action, entityType, entityId, description, mineId, ip) {
  try {
    await query(
      `INSERT INTO audit_logs
         (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), userId, action, entityType, entityId, description, mineId, ip]
    );
  } catch {}
}
