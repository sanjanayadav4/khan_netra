/**
 * KhanNetra — Workers Controller  v2
 * Workers are registered ONCE; daily attendance reuses the profile.
 * New in v2: certifications CRUD, training tracking, QR code, contractor-wise lists.
 */
'use strict';

const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const refetch = async (id) =>
  (await query(
    `SELECT w.*,
            m.name      AS mine_name,
            c.name      AS contractor_name,
            u.full_name AS created_by_name
     FROM workers w
     LEFT JOIN mines       m ON w.mine_id       = m.id
     LEFT JOIN contractors c ON w.contractor_id = c.id
     LEFT JOIN users       u ON w.created_by    = u.id
     WHERE w.id = ?`,
    [id]
  )).rows[0];

async function nextWorkerCode() {
  const last = (await query(
    `SELECT worker_code FROM workers ORDER BY created_at DESC LIMIT 1`
  )).rows[0];
  if (!last) return 'WK-0001';
  const num = parseInt((last.worker_code || '').replace('WK-', ''), 10) || 0;
  return `WK-${String(num + 1).padStart(4, '0')}`;
}

/* compute days until expiry */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

/* ════════════════════════════════════════════════════════════════════════════
   GET ALL  — paginated, filterable
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAll = async (req, res, next) => {
  try {
    const {
      mine_id, department, shift, status = 'active',
      contractor_id, worker_type, search,
      training_status, expiring_certs,
      page = 1, limit = 50,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds = [], params = [];

    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)            { conds.push('w.mine_id = ?');        params.push(mId); }
    if (department)     { conds.push('w.department = ?');     params.push(department); }
    if (shift)          { conds.push('w.shift = ?');          params.push(shift); }
    if (status)         { conds.push('w.status = ?');         params.push(status); }
    if (contractor_id)  { conds.push('w.contractor_id = ?');  params.push(contractor_id); }
    if (worker_type)    { conds.push('w.worker_type = ?');    params.push(worker_type); }
    if (training_status){ conds.push('w.training_status = ?');params.push(training_status); }
    if (search) {
      conds.push('(w.full_name LIKE ? OR w.worker_code LIKE ? OR w.designation LIKE ? OR w.phone LIKE ?)');
      const t = `%${search}%`;
      params.push(t, t, t, t);
    }
    // Workers with any cert expiring within 30 days
    if (expiring_certs === 'true') {
      conds.push(`EXISTS (
        SELECT 1 FROM worker_certifications wc
        WHERE wc.worker_id = w.id AND wc.status = 'valid'
        AND wc.expiry_date <= date('now','+30 days')
      )`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const total = (await query(
      `SELECT COUNT(*) as c FROM workers w ${where}`, params
    )).rows[0].c;

    const rows = (await query(
      `SELECT w.*,
              m.name AS mine_name,
              c.name AS contractor_name,
              (SELECT COUNT(*) FROM worker_certifications wc WHERE wc.worker_id=w.id AND wc.status='valid') AS cert_count,
              (SELECT COUNT(*) FROM worker_certifications wc WHERE wc.worker_id=w.id AND wc.status='expired') AS expired_certs,
              (SELECT COUNT(*) FROM worker_attendance wa WHERE wa.worker_ref_id=w.id AND wa.attendance_date >= date('now','-30 days') AND wa.status='present') AS present_days_30
       FROM workers w
       LEFT JOIN mines       m ON w.mine_id       = m.id
       LEFT JOIN contractors c ON w.contractor_id = c.id
       ${where}
       ORDER BY w.full_name ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    )).rows;

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: parseInt(total),
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET BY ID
   ════════════════════════════════════════════════════════════════════════════ */
exports.getById = async (req, res, next) => {
  try {
    const w = await refetch(req.params.id);
    if (!w) return res.status(404).json({ success: false, message: 'Worker not found' });
    // attach certifications
    const certs = (await query(
      `SELECT * FROM worker_certifications WHERE worker_id=? ORDER BY expiry_date ASC`,
      [req.params.id]
    )).rows;
    res.json({ success: true, data: { ...w, certifications: certs } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CREATE
   ════════════════════════════════════════════════════════════════════════════ */
exports.create = async (req, res, next) => {
  try {
    const {
      full_name, mine_id, department, designation,
      shift = 'day', contractor_id, worker_type = 'regular',
      phone, emergency_contact, aadhaar_last4,
      joining_date, notes, photo_url,
      blood_group, training_status = 'not_started',
      safety_training_date, training_expiry_date,
      medical_fitness_date, medical_expiry_date,
      biometric_id, address, district, state,
    } = req.body;

    if (!full_name || !mine_id || !department || !designation)
      return res.status(400).json({
        success: false,
        message: 'full_name, mine_id, department, designation are required',
      });

    const mine = (await query('SELECT id FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(400).json({ success: false, message: 'Mine not found' });

    const id          = uuidv4();
    const worker_code = await nextWorkerCode();
    const qr_code     = uuidv4(); // unique QR payload

    await query(
      `INSERT INTO workers
         (id, worker_code, full_name, mine_id, department, designation, shift,
          contractor_id, worker_type, phone, emergency_contact, aadhaar_last4,
          joining_date, status, photo_url, notes, created_by,
          blood_group, training_status, safety_training_date, training_expiry_date,
          medical_fitness_date, medical_expiry_date,
          qr_code, biometric_id, address, district, state,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        id, worker_code, full_name.trim(), mine_id,
        department, designation, shift,
        contractor_id || null, worker_type,
        phone || null, emergency_contact || null,
        aadhaar_last4 ? String(aadhaar_last4).slice(-4) : null,
        joining_date || null, photo_url || null, notes || null,
        req.user.id,
        blood_group || null, training_status,
        safety_training_date || null, training_expiry_date || null,
        medical_fitness_date || null, medical_expiry_date || null,
        qr_code, biometric_id || null,
        address || null, district || null, state || null,
      ]
    );

    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'CREATE', 'worker', id,
       `Worker registered: ${full_name} (${worker_code})`, mine_id, req.ip]
    ).catch(() => {});

    const worker = await refetch(id);
    res.status(201).json({ success: true, message: 'Worker registered successfully', data: worker });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   UPDATE
   ════════════════════════════════════════════════════════════════════════════ */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await refetch(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Worker not found' });

    const updatable = [
      'full_name','department','designation','shift','contractor_id',
      'worker_type','phone','emergency_contact','joining_date',
      'status','photo_url','notes',
      'blood_group','training_status','safety_training_date','training_expiry_date',
      'medical_fitness_date','medical_expiry_date',
      'biometric_id','address','district','state',
    ];
    const sets = [], params = [];
    for (const k of updatable) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); params.push(req.body[k]); }
    }
    if (!sets.length)
      return res.status(400).json({ success: false, message: 'No updatable fields provided' });

    sets.push(`updated_at=datetime('now')`);
    params.push(id);
    await query(`UPDATE workers SET ${sets.join(',')} WHERE id=?`, params);

    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'UPDATE', 'worker', id,
       `Worker updated: ${existing.full_name}`, existing.mine_id, req.ip]
    ).catch(() => {});

    res.json({ success: true, message: 'Worker updated', data: await refetch(id) });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   ATTENDANCE HISTORY
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAttendanceHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 60, from_date, to_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const worker = (await query('SELECT * FROM workers WHERE id=?', [id])).rows[0];
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

    const conds = ['a.worker_ref_id = ?'];
    const params = [id];
    if (from_date) { conds.push('a.attendance_date >= ?'); params.push(from_date); }
    if (to_date)   { conds.push('a.attendance_date <= ?'); params.push(to_date); }
    const where = `WHERE ${conds.join(' AND ')}`;

    const total = (await query(
      `SELECT COUNT(*) as c FROM worker_attendance a ${where}`, params
    )).rows[0].c;

    const rows = (await query(
      `SELECT a.attendance_date, a.shift, a.status, a.check_in_time,
              a.check_out_time, a.work_area, a.remarks, a.latitude, a.longitude,
              u.full_name AS recorded_by_name
       FROM worker_attendance a
       LEFT JOIN users u ON a.recorded_by = u.id
       ${where}
       ORDER BY a.attendance_date DESC, a.shift ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    )).rows;

    const stats = (await query(
      `SELECT COUNT(*) AS total_records,
              SUM(CASE WHEN status='present'  THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN status='absent'   THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN status='late'     THEN 1 ELSE 0 END) AS late,
              SUM(CASE WHEN status='half_day' THEN 1 ELSE 0 END) AS half_day,
              SUM(CASE WHEN status='on_leave' THEN 1 ELSE 0 END) AS on_leave,
              MIN(attendance_date) AS first_record,
              MAX(attendance_date) AS last_record
       FROM worker_attendance WHERE worker_ref_id = ?`,
      [id]
    )).rows[0];

    const present  = parseInt(stats.present || 0);
    const total_r  = parseInt(stats.total_records || 0);

    res.json({
      success: true,
      data: {
        worker,
        history: rows,
        stats: {
          total_records:      total_r,
          present, absent:    parseInt(stats.absent   || 0),
          late:               parseInt(stats.late     || 0),
          half_day:           parseInt(stats.half_day || 0),
          on_leave:           parseInt(stats.on_leave || 0),
          attendance_percent: total_r > 0 ? Math.round((present / total_r) * 100) : 0,
          first_record:       stats.first_record,
          last_record:        stats.last_record,
        },
      },
      pagination: {
        total: parseInt(total), page: parseInt(page),
        limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   STATS
   ════════════════════════════════════════════════════════════════════════════ */
exports.getStats = async (req, res, next) => {
  try {
    const mId    = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const where  = mId ? 'WHERE mine_id=?' : '';
    const params = mId ? [mId] : [];

    const [totals, byStatus, byDept, byType, trainingStats, expiringCerts] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM workers ${where}`, params),
      query(`SELECT status, COUNT(*) as count FROM workers ${where} GROUP BY status`, params),
      query(`SELECT department, COUNT(*) as count FROM workers ${where} GROUP BY department ORDER BY count DESC`, params),
      query(`SELECT worker_type, COUNT(*) as count FROM workers ${where} GROUP BY worker_type`, params),
      query(`SELECT training_status, COUNT(*) as count FROM workers ${where} GROUP BY training_status`, params),
      query(
        `SELECT COUNT(*) as count FROM worker_certifications wc
         JOIN workers w ON wc.worker_id = w.id
         WHERE wc.status='valid' AND wc.expiry_date <= date('now','+30 days')
         ${mId ? "AND w.mine_id='" + mId + "'" : ''}`,
        []
      ),
    ]);

    res.json({
      success: true,
      data: {
        total:            parseInt(totals.rows[0].total),
        by_status:        byStatus.rows,
        by_dept:          byDept.rows,
        by_type:          byType.rows,
        training_stats:   trainingStats.rows,
        expiring_certs_30d: parseInt(expiringCerts.rows[0]?.count || 0),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CERTIFICATIONS  — GET for a worker
   ════════════════════════════════════════════════════════════════════════════ */
exports.getCertifications = async (req, res, next) => {
  try {
    const certs = (await query(
      `SELECT * FROM worker_certifications WHERE worker_id=? ORDER BY expiry_date ASC`,
      [req.params.id]
    )).rows;

    // Attach days_until_expiry
    const enriched = certs.map(c => ({
      ...c,
      days_until_expiry: daysUntil(c.expiry_date),
      is_expiring_soon:  c.expiry_date
        ? daysUntil(c.expiry_date) <= 30 && daysUntil(c.expiry_date) >= 0
        : false,
    }));

    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CERTIFICATIONS  — ADD
   ════════════════════════════════════════════════════════════════════════════ */
exports.addCertification = async (req, res, next) => {
  try {
    const { id: worker_id } = req.params;
    const worker = (await query('SELECT id FROM workers WHERE id=?', [worker_id])).rows[0];
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

    const {
      cert_name, cert_category, issuing_authority,
      certificate_number, issue_date, expiry_date,
      document_url, notes,
    } = req.body;

    if (!cert_name) return res.status(400).json({ success: false, message: 'cert_name is required' });

    // Determine initial status
    const status = expiry_date && new Date(expiry_date) < new Date() ? 'expired' : 'valid';

    const id = uuidv4();
    await query(
      `INSERT INTO worker_certifications
         (id, worker_id, cert_name, cert_category, issuing_authority,
          certificate_number, issue_date, expiry_date, status,
          document_url, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        id, worker_id, cert_name, cert_category || null, issuing_authority || null,
        certificate_number || null, issue_date || null, expiry_date || null,
        status, document_url || null, notes || null, req.user.id,
      ]
    );

    const row = (await query('SELECT * FROM worker_certifications WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, message: 'Certification added', data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CERTIFICATIONS  — UPDATE
   ════════════════════════════════════════════════════════════════════════════ */
exports.updateCertification = async (req, res, next) => {
  try {
    const { certId } = req.params;
    const allowed = [
      'cert_name','cert_category','issuing_authority','certificate_number',
      'issue_date','expiry_date','status','document_url','notes',
    ];
    const sets = [], params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    sets.push(`updated_at=datetime('now')`);
    params.push(certId);
    await query(`UPDATE worker_certifications SET ${sets.join(',')} WHERE id=?`, params);
    const row = (await query('SELECT * FROM worker_certifications WHERE id=?', [certId])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Certification not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CERTIFICATIONS  — DELETE
   ════════════════════════════════════════════════════════════════════════════ */
exports.deleteCertification = async (req, res, next) => {
  try {
    await query('DELETE FROM worker_certifications WHERE id=? AND worker_id=?',
      [req.params.certId, req.params.id]);
    res.json({ success: true, message: 'Certification removed' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CERT TYPES — master list for dropdowns
   ════════════════════════════════════════════════════════════════════════════ */
exports.getCertTypes = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT * FROM safety_certifications ORDER BY category, name`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   EXPIRING CERTS ALERT — workers with certs expiring within N days
   ════════════════════════════════════════════════════════════════════════════ */
exports.getExpiringCerts = async (req, res, next) => {
  try {
    const days   = parseInt(req.query.days || 30);
    const mineId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mineF  = mineId ? `AND w.mine_id='${mineId}'` : '';

    const rows = (await query(
      `SELECT wc.*, w.full_name, w.worker_code, w.department, w.mine_id,
              m.name AS mine_name,
              CAST(julianday(wc.expiry_date) - julianday('now') AS INTEGER) AS days_left
       FROM worker_certifications wc
       JOIN workers w ON wc.worker_id = w.id
       JOIN mines   m ON w.mine_id    = m.id
       WHERE wc.status = 'valid'
         AND wc.expiry_date IS NOT NULL
         AND wc.expiry_date <= date('now', '+${days} days')
         ${mineF}
       ORDER BY wc.expiry_date ASC
       LIMIT 100`,
      []
    )).rows;

    res.json({ success: true, data: rows, days_window: days });
  } catch (err) { next(err); }
};
