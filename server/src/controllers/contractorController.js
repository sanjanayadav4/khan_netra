/**
 * KhanNetra — Contractor Controller  v2
 * New in v2:
 *  • contractor workers list with attendance stats
 *  • expiry alerts (contracts expiring within N days)
 *  • live compliance/safety score recalculation from real data
 *  • performance rating update
 *  • violations summary per contractor
 */
'use strict';

const { query } = require('../config/database');
const { v4: uuid } = require('uuid');

/* ── Helpers ─────────────────────────────────────────────────────────── */
const refetch = async (id) =>
  (await query(
    `SELECT c.*, m.name as mine_name,
            (SELECT COUNT(*) FROM workers w WHERE w.contractor_id=c.id AND w.status='active') AS active_workers
     FROM contractors c
     JOIN mines m ON c.mine_id = m.id
     WHERE c.id = ?`,
    [id]
  )).rows[0];

/** Compute days until a date. Negative = past. */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

/* ════════════════════════════════════════════════════════════════════════
   GET ALL — with live worker counts, expiry warnings
   ════════════════════════════════════════════════════════════════════════ */
exports.getAll = async (req, res, next) => {
  try {
    const { mine_id, status, search, expiring, page = 1, limit = 20 } = req.query;
    const off = (parseInt(page) - 1) * parseInt(limit);

    let c = [], p = [];
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)    { c.push('c.mine_id = ?'); p.push(mId); }
    if (status) { c.push('c.status = ?');  p.push(status); }
    if (search) {
      c.push('(c.name LIKE ? OR c.registration_number LIKE ? OR c.work_type LIKE ?)');
      const t = `%${search}%`;
      p.push(t, t, t);
    }
    if (expiring === 'true') {
      c.push(`c.contract_end IS NOT NULL AND c.contract_end <= date('now','+60 days') AND c.contract_end >= date('now')`);
    }

    const w = c.length ? `WHERE ${c.join(' AND ')}` : '';

    const total = (await query(`SELECT COUNT(*) as n FROM contractors c ${w}`, p)).rows[0].n;
    const rows  = (await query(
      `SELECT c.*, m.name as mine_name,
              (SELECT COUNT(*) FROM workers w2 WHERE w2.contractor_id=c.id AND w2.status='active') AS active_workers,
              (SELECT COUNT(*) FROM workers w3 WHERE w3.contractor_id=c.id) AS total_workers_registered,
              CAST(julianday(c.contract_end) - julianday('now') AS INTEGER) AS validity_days_left
       FROM contractors c
       JOIN mines m ON c.mine_id = m.id
       ${w}
       ORDER BY c.compliance_score ASC
       LIMIT ? OFFSET ?`,
      [...p, parseInt(limit), off]
    )).rows;

    res.json({
      success: true,
      data: rows,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET BY ID  — full detail
   ════════════════════════════════════════════════════════════════════════ */
exports.getById = async (req, res, next) => {
  try {
    const r = await refetch(req.params.id);
    if (!r) return res.status(404).json({ success: false, message: 'Contractor not found' });
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET WORKERS for a contractor
   ════════════════════════════════════════════════════════════════════════ */
exports.getWorkers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status = 'active', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const workers = (await query(
      `SELECT w.*,
              m.name AS mine_name,
              (SELECT COUNT(*) FROM worker_attendance wa WHERE wa.worker_ref_id=w.id AND wa.status='present' AND wa.attendance_date >= date('now','-30 days')) AS present_30d,
              (SELECT COUNT(*) FROM worker_attendance wa WHERE wa.worker_ref_id=w.id AND wa.attendance_date >= date('now','-30 days')) AS total_30d,
              (SELECT COUNT(*) FROM worker_certifications wc WHERE wc.worker_id=w.id AND wc.status='valid') AS valid_certs,
              (SELECT COUNT(*) FROM worker_certifications wc WHERE wc.worker_id=w.id AND wc.status='expired') AS expired_certs
       FROM workers w
       JOIN mines m ON w.mine_id = m.id
       WHERE w.contractor_id=? AND w.status=?
       ORDER BY w.full_name ASC
       LIMIT ? OFFSET ?`,
      [id, status, parseInt(limit), offset]
    )).rows;

    const total = (await query(
      `SELECT COUNT(*) as c FROM workers WHERE contractor_id=? AND status=?`, [id, status]
    )).rows[0].c;

    res.json({
      success: true, data: workers,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   CREATE
   ════════════════════════════════════════════════════════════════════════ */
exports.create = async (req, res, next) => {
  try {
    const {
      name, registration_number, mine_id, work_type,
      contract_start, contract_end, contract_value,
      workers_count, contact_name, contact_phone, contact_email,
      safety_score, compliance_score, performance_rating,
      expiry_alert_days = 30, notes, remarks,
    } = req.body;

    if (!name || !mine_id || !work_type)
      return res.status(400).json({ success: false, message: 'name, mine_id, work_type required' });

    const id = uuid();
    await query(
      `INSERT INTO contractors
         (id, name, registration_number, mine_id, work_type,
          contract_start, contract_end, contract_value,
          workers_count, contact_name, contact_phone, contact_email,
          safety_score, compliance_score, performance_rating,
          expiry_alert_days, notes, remarks, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [
        id, name, registration_number || null, mine_id, work_type,
        contract_start || null, contract_end || null, contract_value || null,
        workers_count || 0, contact_name || null, contact_phone || null, contact_email || null,
        safety_score     ?? 75,
        compliance_score ?? 75,
        performance_rating ?? 0,
        expiry_alert_days,
        notes || null, remarks || null,
      ]
    );

    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'CREATE', 'contractor', id, `Created contractor: ${name}`, mine_id, req.ip]
    );

    const row = await refetch(id);
    res.status(201).json({ success: true, message: 'Contractor added', data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   UPDATE
   ════════════════════════════════════════════════════════════════════════ */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = [
      'name','registration_number','work_type','contract_start','contract_end',
      'contract_value','safety_score','compliance_score','performance_rating',
      'workers_count','status','contact_name','contact_phone','contact_email',
      'notes','remarks','last_inspection_date','expiry_alert_days',
      'total_violations','total_incidents','penalty_amount',
    ];
    const sets = [], p = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); p.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    sets.push(`updated_at = datetime('now')`);
    p.push(id);
    await query(`UPDATE contractors SET ${sets.join(',')} WHERE id = ?`, p);
    const row = await refetch(id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   RECALCULATE SCORES — refresh compliance/safety from real data
   ════════════════════════════════════════════════════════════════════════ */
exports.recalculateScores = async (req, res, next) => {
  try {
    const { id } = req.params;
    const c = (await query('SELECT * FROM contractors WHERE id=?', [id])).rows[0];
    if (!c) return res.status(404).json({ success: false, message: 'Not found' });

    // Count real violations from contractors' workers
    const viol = (await query(
      `SELECT COUNT(*) as cnt FROM violations v
       JOIN workers w ON v.mine_id = w.mine_id
       WHERE w.contractor_id=? AND v.status != 'closed'
       AND v.detected_date >= date('now','-180 days')`,
      [id]
    )).rows[0].cnt || 0;

    // Count incidents involving this contractor's workers
    const inc = (await query(
      `SELECT COUNT(*) as cnt FROM incidents i
       JOIN workers w ON i.mine_id = w.mine_id
       WHERE w.contractor_id=? AND i.incident_date >= date('now','-180 days')`,
      [id]
    )).rows[0].cnt || 0;

    // Attendance rate for contractor workers (30 days)
    const attStats = (await query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) as present
       FROM worker_attendance wa
       WHERE wa.contractor_id=? AND wa.attendance_date >= date('now','-30 days')`,
      [id]
    )).rows[0];
    const attRate = parseInt(attStats.total) > 0
      ? Math.round((parseInt(attStats.present) / parseInt(attStats.total)) * 100)
      : 80;

    // Expired certs %
    const certStats = (await query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN wc.status='expired' THEN 1 ELSE 0 END) as expired
       FROM worker_certifications wc
       JOIN workers w ON wc.worker_id=w.id
       WHERE w.contractor_id=?`,
      [id]
    )).rows[0];
    const certScore = parseInt(certStats.total) > 0
      ? Math.round(((parseInt(certStats.total) - parseInt(certStats.expired)) / parseInt(certStats.total)) * 100)
      : 90;

    // Simple scoring formula
    const safetyScore     = Math.max(0, Math.min(100, 100 - (viol * 5) - (inc * 10)));
    const complianceScore = Math.round((attRate * 0.4) + (certScore * 0.4) + (safetyScore * 0.2));

    await query(
      `UPDATE contractors SET
         safety_score=?, compliance_score=?,
         total_violations=?, total_incidents=?,
         updated_at=datetime('now')
       WHERE id=?`,
      [safetyScore, complianceScore, parseInt(viol), parseInt(inc), id]
    );

    const updated = await refetch(id);
    res.json({
      success: true,
      message: 'Scores recalculated from real data',
      data: updated,
      breakdown: { violations: viol, incidents: inc, att_rate: attRate, cert_score: certScore },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   DELETE
   ════════════════════════════════════════════════════════════════════════ */
exports.delete = async (req, res, next) => {
  try {
    const r = (await query('SELECT id,name FROM contractors WHERE id=?', [req.params.id])).rows[0];
    if (!r) return res.status(404).json({ success: false, message: 'Not found' });
    await query('DELETE FROM contractors WHERE id=?', [req.params.id]);
    res.json({ success: true, message: `Contractor "${r.name}" deleted` });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   STATS  — national/mine summary
   ════════════════════════════════════════════════════════════════════════ */
exports.getStats = async (req, res, next) => {
  try {
    const mineId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf     = mineId ? `WHERE c.mine_id = '${mineId}'` : '';

    const [total, byStatus, lowCompliance, expiring] = await Promise.all([
      query(`SELECT COUNT(*) as total,
               ROUND(AVG(safety_score),1) as avg_safety,
               ROUND(AVG(compliance_score),1) as avg_compliance,
               SUM(workers_count) as total_workers
             FROM contractors c ${mf}`),
      query(`SELECT status, COUNT(*) as count FROM contractors c ${mf} GROUP BY status`),
      query(
        `SELECT c.id, c.name, c.compliance_score, c.safety_score,
                c.total_violations, c.workers_count, m.name as mine_name
         FROM contractors c JOIN mines m ON c.mine_id=m.id
         ${mf ? mf + ' AND c.compliance_score < 60' : 'WHERE c.compliance_score < 60'}
         ORDER BY c.compliance_score ASC LIMIT 5`
      ),
      query(
        `SELECT c.id, c.name, c.contract_end, m.name as mine_name,
                CAST(julianday(c.contract_end) - julianday('now') AS INTEGER) AS days_left
         FROM contractors c JOIN mines m ON c.mine_id=m.id
         ${mf ? mf + " AND c.contract_end IS NOT NULL AND c.contract_end <= date('now','+60 days') AND c.contract_end >= date('now')"
              : "WHERE c.contract_end IS NOT NULL AND c.contract_end <= date('now','+60 days') AND c.contract_end >= date('now')"}
         ORDER BY c.contract_end ASC LIMIT 10`
      ),
    ]);

    res.json({
      success: true,
      data: {
        totals:       total.rows[0],
        byStatus:     byStatus.rows,
        lowCompliance:lowCompliance.rows,
        expiring:     expiring.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   EXPIRY ALERTS  — contracts expiring within N days
   ════════════════════════════════════════════════════════════════════════ */
exports.getExpiryAlerts = async (req, res, next) => {
  try {
    const days   = parseInt(req.query.days || 60);
    const mineId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mineF  = mineId ? `AND c.mine_id='${mineId}'` : '';

    const rows = (await query(
      `SELECT c.*, m.name as mine_name,
              CAST(julianday(c.contract_end) - julianday('now') AS INTEGER) AS days_left,
              (SELECT COUNT(*) FROM workers w WHERE w.contractor_id=c.id AND w.status='active') AS active_workers
       FROM contractors c
       JOIN mines m ON c.mine_id = m.id
       WHERE c.contract_end IS NOT NULL
         AND c.contract_end <= date('now', '+${days} days')
         AND c.contract_end >= date('now')
         AND c.status = 'active'
         ${mineF}
       ORDER BY c.contract_end ASC`,
      []
    )).rows;

    res.json({ success: true, data: rows, days_window: days });
  } catch (err) { next(err); }
};
