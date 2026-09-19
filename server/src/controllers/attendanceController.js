/**
 * KhanNetra Attendance Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages worker attendance records.
 * Supports offline-sync via client_id idempotency key.
 * No fake/generated attendance — all records entered by authorized users only.
 */
'use strict';

const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const refetch = async (id) =>
  (await query('SELECT * FROM worker_attendance WHERE id=?', [id])).rows[0];

/* ════════════════════════════════════════════════════════════════════════════
   GET ALL  —  paginated, filterable
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAll = async (req, res, next) => {
  try {
    const {
      mine_id, attendance_date, shift, status, worker_id,
      page = 1, limit = 50,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conds = [], params = [];

    // Mine managers see only their mine
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)             { conds.push('a.mine_id = ?');          params.push(mId); }
    if (attendance_date) { conds.push('a.attendance_date = ?');  params.push(attendance_date); }
    if (shift)           { conds.push('a.shift = ?');            params.push(shift); }
    if (status)          { conds.push('a.status = ?');           params.push(status); }
    if (worker_id)       { conds.push('a.worker_id LIKE ?');     params.push(`%${worker_id}%`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const total = (await query(
      `SELECT COUNT(*) as c FROM worker_attendance a ${where}`, params
    )).rows[0].c;

    const rows = (await query(
      `SELECT a.*,
              m.name  as mine_name,
              u.full_name as recorded_by_name,
              c.name  as contractor_name
       FROM worker_attendance a
       JOIN  mines m     ON a.mine_id = m.id
       LEFT JOIN users u ON a.recorded_by = u.id
       LEFT JOIN contractors c ON a.contractor_id = c.id
       ${where}
       ORDER BY a.attendance_date DESC, a.check_in_time DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    )).rows;

    res.json({
      success: true,
      data:    rows,
      pagination: {
        total:   parseInt(total),
        page:    parseInt(page),
        limit:   parseInt(limit),
        pages:   Math.ceil(total / limit),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET BY ID
   ════════════════════════════════════════════════════════════════════════════ */
exports.getById = async (req, res, next) => {
  try {
    const r = (await query(
      `SELECT a.*, m.name as mine_name, u.full_name as recorded_by_name
       FROM worker_attendance a
       JOIN  mines m     ON a.mine_id = m.id
       LEFT JOIN users u ON a.recorded_by = u.id
       WHERE a.id=?`,
      [req.params.id]
    )).rows[0];
    if (!r) return res.status(404).json({ success: false, message: 'Attendance record not found' });
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   CREATE
   Idempotent via client_id — duplicate submissions return the existing record.
   ════════════════════════════════════════════════════════════════════════════ */
exports.create = async (req, res, next) => {
  try {
    const {
      mine_id, worker_id, worker_name, contractor_id,
      shift = 'day', work_area, attendance_date,
      check_in_time, check_out_time, status = 'present',
      latitude, longitude, gps_accuracy,
      device_info, is_offline_sync = false,
      client_id,   // idempotency key from offline queue
      remarks,
    } = req.body;

    // Required field validation
    if (!mine_id || !worker_name || !attendance_date)
      return res.status(400).json({
        success: false,
        message: 'mine_id, worker_name, attendance_date are required',
      });

    if (!['present','absent','late','half_day','on_leave'].includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status value' });

    // Idempotency: if client_id already exists, return the existing record
    if (client_id) {
      const existing = (await query(
        'SELECT * FROM worker_attendance WHERE client_id=?', [client_id]
      )).rows[0];
      if (existing) {
        return res.status(200).json({
          success: true,
          message: 'Duplicate submission — returning existing record',
          data:    existing,
          duplicate: true,
        });
      }
    }

    const id = uuidv4();
    await query(
      `INSERT INTO worker_attendance
         (id, mine_id, worker_id, worker_name, contractor_id, shift, work_area,
          attendance_date, check_in_time, check_out_time, status,
          latitude, longitude, gps_accuracy,
          recorded_by, device_info, is_offline_sync, client_id, remarks)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, mine_id, worker_id || null, worker_name, contractor_id || null,
        shift, work_area || null,
        attendance_date, check_in_time || null, check_out_time || null, status,
        latitude  ? parseFloat(latitude)  : null,
        longitude ? parseFloat(longitude) : null,
        gps_accuracy ? parseInt(gps_accuracy) : null,
        req.user.id, device_info || null,
        is_offline_sync ? 1 : 0, client_id || null, remarks || null,
      ]
    );

    // Audit log
    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'CREATE', 'attendance', id,
       `Attendance recorded: ${worker_name} — ${status} on ${attendance_date}`,
       mine_id, req.ip]
    ).catch(e => console.error('[Attendance] Audit log error:', e.message));

    const row = await refetch(id);
    res.status(201).json({ success: true, message: 'Attendance recorded', data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   UPDATE  (check-out time, status corrections, remarks)
   ════════════════════════════════════════════════════════════════════════════ */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['check_out_time', 'status', 'work_area', 'remarks'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); params.push(req.body[k]); }
    }
    if (!sets.length)
      return res.status(400).json({ success: false, message: 'No updatable fields provided' });

    sets.push(`updated_at=datetime('now')`);
    params.push(id);
    await query(`UPDATE worker_attendance SET ${sets.join(',')} WHERE id=?`, params);

    const row = await refetch(id);
    if (!row) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   DAILY SUMMARY — for a mine on a given date
   ════════════════════════════════════════════════════════════════════════════ */
exports.getDailySummary = async (req, res, next) => {
  try {
    const { mine_id, date } = req.query;
    if (!mine_id || !date)
      return res.status(400).json({ success: false, message: 'mine_id and date required' });

    const rows = (await query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status='present'   THEN 1 ELSE 0 END) as present,
         SUM(CASE WHEN status='absent'    THEN 1 ELSE 0 END) as absent,
         SUM(CASE WHEN status='late'      THEN 1 ELSE 0 END) as late,
         SUM(CASE WHEN status='half_day'  THEN 1 ELSE 0 END) as half_day,
         SUM(CASE WHEN status='on_leave'  THEN 1 ELSE 0 END) as on_leave,
         shift
       FROM worker_attendance
       WHERE mine_id=? AND attendance_date=?
       GROUP BY shift`,
      [mine_id, date]
    )).rows;

    const mine = (await query('SELECT name FROM mines WHERE id=?', [mine_id])).rows[0];

    res.json({
      success: true,
      data: {
        mine_id,
        mine_name: mine?.name,
        date,
        by_shift: rows,
        totals: rows.reduce((acc, r) => ({
          total:    acc.total    + parseInt(r.total),
          present:  acc.present  + parseInt(r.present),
          absent:   acc.absent   + parseInt(r.absent),
          late:     acc.late     + parseInt(r.late),
          half_day: acc.half_day + parseInt(r.half_day),
          on_leave: acc.on_leave + parseInt(r.on_leave),
        }), { total:0, present:0, absent:0, late:0, half_day:0, on_leave:0 }),
        data_as_of: new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET DAILY SESSION
   ─────────────────────────────────────────────────────────────────────────────
   Loads the complete worker list for a mine/shift and merges any existing
   attendance records for the given date — so the UI can show the current
   saved state without a separate fetch.

   Query params: mine_id (required), attendance_date (required), shift (required)
   Returns: array of workers with attendance status merged in.
   ════════════════════════════════════════════════════════════════════════════ */
exports.getDailySession = async (req, res, next) => {
  try {
    const { mine_id, attendance_date, shift } = req.query;
    if (!mine_id || !attendance_date || !shift)
      return res.status(400).json({
        success: false,
        message: 'mine_id, attendance_date, and shift are required',
      });

    // Active workers for this mine (match exact shift OR general/all-shift workers)
    const workers = (await query(
      `SELECT w.id, w.worker_code, w.full_name, w.department, w.designation,
              w.shift, w.contractor_id, w.worker_type, w.status AS worker_status,
              c.name AS contractor_name
       FROM workers w
       LEFT JOIN contractors c ON w.contractor_id = c.id
       WHERE w.mine_id = ?
         AND w.status  = 'active'
         AND (w.shift = ? OR w.shift = 'general')
       ORDER BY w.department ASC, w.full_name ASC`,
      [mine_id, shift]
    )).rows;

    // Existing attendance records for this date/mine/shift
    const existing = (await query(
      `SELECT worker_ref_id, id AS att_id, status, check_in_time,
              check_out_time, remarks, work_area
       FROM worker_attendance
       WHERE mine_id = ? AND attendance_date = ? AND shift = ?
         AND worker_ref_id IS NOT NULL`,
      [mine_id, attendance_date, shift]
    )).rows;

    const attMap = {};
    for (const a of existing) attMap[a.worker_ref_id] = a;

    // Merge
    const merged = workers.map(w => ({
      ...w,
      att_id:         attMap[w.id]?.att_id         || null,
      att_status:     attMap[w.id]?.status          || null,   // null = not marked yet
      check_in_time:  attMap[w.id]?.check_in_time   || null,
      check_out_time: attMap[w.id]?.check_out_time  || null,
      remarks:        attMap[w.id]?.remarks          || null,
      work_area:      attMap[w.id]?.work_area        || null,
    }));

    const mine = (await query('SELECT name FROM mines WHERE id=?', [mine_id])).rows[0];

    const summary = {
      total:      merged.length,
      present:    merged.filter(w => w.att_status === 'present').length,
      absent:     merged.filter(w => w.att_status === 'absent').length,
      late:       merged.filter(w => w.att_status === 'late').length,
      not_marked: merged.filter(w => !w.att_status).length,
    };

    res.json({
      success: true,
      data: {
        mine_id,
        mine_name:       mine?.name,
        attendance_date,
        shift,
        workers:         merged,
        summary,
        already_saved:   existing.length > 0,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   BULK SAVE ATTENDANCE (daily session save)
   ─────────────────────────────────────────────────────────────────────────────
   Accepts an array of { worker_id (workers.id), status, remarks?, work_area? }
   for a given mine/date/shift.

   For each worker:
     - If no existing record → INSERT
     - If record exists      → UPDATE status (and optionally remarks/work_area)

   Uses INSERT OR REPLACE with the unique index on (worker_ref_id, attendance_date, shift)
   to prevent duplicates.

   Body: { mine_id, attendance_date, shift, records: [{worker_id, status, ...}] }
   ════════════════════════════════════════════════════════════════════════════ */
exports.bulkSave = async (req, res, next) => {
  try {
    const { mine_id, attendance_date, shift, records } = req.body;

    if (!mine_id || !attendance_date || !shift || !Array.isArray(records) || records.length === 0)
      return res.status(400).json({
        success: false,
        message: 'mine_id, attendance_date, shift, and records[] are required',
      });

    const validStatuses = ['present', 'absent', 'late', 'half_day', 'on_leave'];

    let inserted = 0, updated = 0, skipped = 0;
    const errors = [];

    for (const rec of records) {
      const { worker_id, status, remarks, work_area, check_in_time, check_out_time } = rec;

      if (!worker_id || !status) { skipped++; continue; }
      if (!validStatuses.includes(status)) {
        errors.push(`Worker ${worker_id}: invalid status "${status}"`);
        skipped++;
        continue;
      }

      // Fetch worker profile (validate it belongs to this mine)
      const worker = (await query(
        'SELECT id, full_name, department, worker_code FROM workers WHERE id=? AND mine_id=?',
        [worker_id, mine_id]
      )).rows[0];

      if (!worker) {
        errors.push(`Worker ${worker_id} not found in mine ${mine_id}`);
        skipped++;
        continue;
      }

      // Check for existing record
      const existing = (await query(
        `SELECT id FROM worker_attendance
         WHERE worker_ref_id=? AND attendance_date=? AND shift=?`,
        [worker_id, attendance_date, shift]
      )).rows[0];

      if (existing) {
        // UPDATE
        await query(
          `UPDATE worker_attendance
           SET status=?, remarks=?, work_area=?,
               check_in_time=?, check_out_time=?,
               recorded_by=?, updated_at=datetime('now')
           WHERE id=?`,
          [
            status,
            remarks        || null,
            work_area      || null,
            check_in_time  || null,
            check_out_time || null,
            req.user.id,
            existing.id,
          ]
        );
        updated++;
      } else {
        // INSERT
        await query(
          `INSERT INTO worker_attendance
             (id, mine_id, worker_ref_id, worker_id, worker_name, department,
              contractor_id, shift, attendance_date, status,
              check_in_time, check_out_time, work_area, remarks,
              recorded_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [
            uuidv4(),
            mine_id,
            worker_id,
            worker.worker_code,
            worker.full_name,
            worker.department,
            null,
            shift,
            attendance_date,
            status,
            check_in_time  || null,
            check_out_time || null,
            work_area      || null,
            remarks        || null,
            req.user.id,
          ]
        );
        inserted++;
      }
    }

    // Single audit log for the whole session
    query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'BULK_ATTENDANCE', 'attendance', uuidv4(),
       `Bulk attendance saved: ${attendance_date} ${shift} shift — ${inserted} new, ${updated} updated`,
       mine_id, req.ip]
    ).catch(() => {});

    res.json({
      success: true,
      message: `Attendance saved: ${inserted} new, ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}`,
      data:    { inserted, updated, skipped, errors },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   MARK ALL  — set all workers in a session to the same status (quick action)
   Body: { mine_id, attendance_date, shift, status }
   ════════════════════════════════════════════════════════════════════════════ */
exports.markAll = async (req, res, next) => {
  try {
    const { mine_id, attendance_date, shift, status = 'present' } = req.body;
    if (!mine_id || !attendance_date || !shift)
      return res.status(400).json({ success: false, message: 'mine_id, attendance_date, shift required' });

    // Fetch active workers for this mine/shift
    const workers = (await query(
      `SELECT id, worker_code, full_name, department FROM workers
       WHERE mine_id=? AND status='active' AND (shift=? OR shift='general')`,
      [mine_id, shift]
    )).rows;

    if (workers.length === 0)
      return res.json({ success: true, message: 'No active workers found for this selection', data: { count: 0 } });

    let count = 0;
    for (const w of workers) {
      const existing = (await query(
        `SELECT id FROM worker_attendance WHERE worker_ref_id=? AND attendance_date=? AND shift=?`,
        [w.id, attendance_date, shift]
      )).rows[0];

      if (existing) {
        await query(
          `UPDATE worker_attendance SET status=?, recorded_by=?, updated_at=datetime('now') WHERE id=?`,
          [status, req.user.id, existing.id]
        );
      } else {
        await query(
          `INSERT INTO worker_attendance
             (id,mine_id,worker_ref_id,worker_id,worker_name,department,shift,
              attendance_date,status,recorded_by,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [uuidv4(), mine_id, w.id, w.worker_code, w.full_name, w.department,
           shift, attendance_date, status, req.user.id]
        );
      }
      count++;
    }

    res.json({
      success: true,
      message: `Marked ${count} workers as ${status}`,
      data:    { count, status },
    });
  } catch (err) { next(err); }
};
