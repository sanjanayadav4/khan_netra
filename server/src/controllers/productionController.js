/**
 * KhanNetra — Production Monitoring Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * All data from real DB. No hardcoded/fake values.
 *
 * Endpoints:
 *   GET  /production/dashboard       — mine KPI cards + today's snapshot
 *   GET  /production/records         — paginated records with filters
 *   POST /production/records         — enter a new production record
 *   PUT  /production/records/:id     — update a record
 *   GET  /production/trends          — daily/weekly/monthly aggregation
 *   GET  /production/targets         — list targets
 *   POST /production/targets         — set a target
 *   GET  /production/machinery       — machinery status list
 *   POST /production/machinery       — add/register machine
 *   PUT  /production/machinery/:id   — update machine status
 *   GET  /production/analysis        — AI-style anomaly detection & insights
 *   GET  /production/stats           — summary stats for dashboard cards
 */
'use strict';

const { query } = require('../config/database');
const { v4: uuid } = require('uuid');

/* ── helpers ─────────────────────────────────────────────────────────── */
function mineFilter(user, queryMineId) {
  return user.role === 'mine_manager' ? user.mine_id : (queryMineId || null);
}

/* ════════════════════════════════════════════════════════════════════════
   GET /production/dashboard
   ════════════════════════════════════════════════════════════════════════ */
exports.getDashboard = async (req, res, next) => {
  try {
    const mId  = mineFilter(req.user, req.query.mine_id);
    const mf   = mId ? `AND pr.mine_id = '${mId}'` : '';
    const mfPl = mId ? `WHERE mine_id = '${mId}'` : '';
    const today = new Date().toISOString().slice(0, 10);

    // Today's snapshot per mine
    const todayRows = (await query(
      `SELECT pr.*, m.name as mine_name
       FROM production_records pr
       JOIN mines m ON pr.mine_id = m.id
       WHERE pr.record_date = ? ${mf}
       ORDER BY m.name ASC`,
      [today]
    )).rows;

    // 30-day aggregation per mine
    const aggregates = (await query(
      `SELECT m.id as mine_id, m.name as mine_name,
              ROUND(AVG(pr.actual_tonnes),0)    as avg_daily,
              ROUND(SUM(pr.actual_tonnes),0)    as total_30d,
              ROUND(AVG(pr.achievement_pct),1)  as avg_achievement,
              ROUND(AVG(pr.productivity_tph),2) as avg_tph,
              COUNT(*)                          as record_count,
              SUM(CASE WHEN pr.achievement_pct >= 90 THEN 1 ELSE 0 END) as days_on_target,
              MIN(pr.actual_tonnes)             as min_daily,
              MAX(pr.actual_tonnes)             as max_daily
       FROM production_records pr
       JOIN mines m ON pr.mine_id = m.id
       WHERE pr.record_date >= date('now','-30 days') ${mf}
       GROUP BY m.id, m.name
       ORDER BY total_30d DESC`
    )).rows;

    // Machinery summary
    const machinery = (await query(
      `SELECT status, COUNT(*) as count
       FROM machinery_status ${mfPl}
       GROUP BY status`
    )).rows;

    // Active targets today
    const targets = (await query(
      `SELECT pt.*, m.name as mine_name
       FROM production_targets pt
       JOIN mines m ON pt.mine_id = m.id
       WHERE pt.target_date = ? ${mId ? `AND pt.mine_id = '${mId}'` : ''}`,
      [today]
    )).rows;

    res.json({
      success: true,
      data: {
        today_snapshot:   todayRows,
        mine_aggregates:  aggregates,
        machinery_summary:machinery,
        today_targets:    targets,
        as_of:            new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET /production/stats
   ════════════════════════════════════════════════════════════════════════ */
exports.getStats = async (req, res, next) => {
  try {
    const mId = mineFilter(req.user, req.query.mine_id);
    const mf  = mId ? `AND mine_id = '${mId}'` : '';
    const mfW = mId ? `WHERE mine_id = '${mId}'` : '';

    const [overall, machinery, topMine, weekly] = await Promise.all([
      query(`SELECT
               ROUND(SUM(actual_tonnes),0)   as total_tonnes,
               ROUND(AVG(achievement_pct),1) as avg_achievement,
               ROUND(AVG(productivity_tph),2) as avg_tph,
               COUNT(*)                       as record_count,
               SUM(CASE WHEN achievement_pct >= 90 THEN 1 ELSE 0 END) as days_on_target
             FROM production_records WHERE record_date >= date('now','-30 days') ${mf}`),
      query(`SELECT status, COUNT(*) as count FROM machinery_status ${mfW} GROUP BY status`),
      query(`SELECT m.name as mine_name,
               ROUND(SUM(pr.actual_tonnes),0) as total
             FROM production_records pr JOIN mines m ON pr.mine_id=m.id
             WHERE pr.record_date >= date('now','-7 days') ${mf}
             GROUP BY m.id, m.name ORDER BY total DESC LIMIT 1`),
      query(`SELECT strftime('%Y-W%W', record_date) as week,
               ROUND(SUM(actual_tonnes),0) as total,
               ROUND(AVG(achievement_pct),1) as avg_ach
             FROM production_records
             WHERE record_date >= date('now','-56 days') ${mf}
             GROUP BY strftime('%Y-W%W', record_date) ORDER BY week ASC`),
    ]);

    res.json({
      success: true,
      data: {
        overall:     overall.rows[0],
        machinery:   machinery.rows,
        top_mine:    topMine.rows[0] || null,
        weekly_trend:weekly.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET /production/records
   ════════════════════════════════════════════════════════════════════════ */
exports.getRecords = async (req, res, next) => {
  try {
    const { mine_id, from_date, to_date, status, shift, page = 1, limit = 50 } = req.query;
    const off   = (parseInt(page) - 1) * parseInt(limit);
    const mId   = mineFilter(req.user, mine_id);
    const conds = [], params = [];

    if (mId)      { conds.push('pr.mine_id = ?');     params.push(mId); }
    if (from_date){ conds.push('pr.record_date >= ?'); params.push(from_date); }
    if (to_date)  { conds.push('pr.record_date <= ?'); params.push(to_date); }
    if (status)   { conds.push('pr.status = ?');       params.push(status); }
    if (shift)    { conds.push('pr.shift = ?');        params.push(shift); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as c FROM production_records pr ${where}`, params)).rows[0].c;

    const rows = (await query(
      `SELECT pr.*, m.name as mine_name, u.full_name as recorded_by_name
       FROM production_records pr
       JOIN mines m ON pr.mine_id = m.id
       LEFT JOIN users u ON pr.recorded_by = u.id
       ${where}
       ORDER BY pr.record_date DESC, pr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), off]
    )).rows;

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   POST /production/records
   ════════════════════════════════════════════════════════════════════════ */
exports.createRecord = async (req, res, next) => {
  try {
    const {
      mine_id, record_date, shift = 'all', mineral_type = 'Coal',
      actual_tonnes, working_hours, workers_deployed, active_machines,
      productivity_tph, stripping_ratio, section, notes,
    } = req.body;

    if (!mine_id || !record_date || actual_tonnes === undefined)
      return res.status(400).json({ success: false, message: 'mine_id, record_date, actual_tonnes are required' });

    const mine = (await query('SELECT id FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(400).json({ success: false, message: 'Mine not found' });

    // Fetch today's target
    const targetRow = (await query(
      `SELECT target_tonnes FROM production_targets
       WHERE mine_id=? AND target_date=? AND period_type='daily' AND mineral_type=?`,
      [mine_id, record_date, mineral_type]
    )).rows[0];

    const target     = targetRow?.target_tonnes || null;
    const actual     = parseFloat(actual_tonnes);
    const achPct     = target ? Math.round((actual / target) * 100 * 10) / 10 : null;
    const tph        = (working_hours && parseFloat(working_hours) > 0)
      ? Math.round((actual / parseFloat(working_hours)) * 10) / 10
      : (productivity_tph ? parseFloat(productivity_tph) : null);

    const id = uuid();
    await query(
      `INSERT INTO production_records
         (id, mine_id, record_date, shift, mineral_type, actual_tonnes, target_tonnes,
          achievement_pct, working_hours, workers_deployed, active_machines,
          productivity_tph, stripping_ratio, section, notes, recorded_by,
          status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'recorded',datetime('now'),datetime('now'))`,
      [
        id, mine_id, record_date, shift, mineral_type, actual, target, achPct,
        working_hours ? parseFloat(working_hours) : null,
        workers_deployed ? parseInt(workers_deployed) : null,
        active_machines  ? parseInt(active_machines)  : null,
        tph, stripping_ratio ? parseFloat(stripping_ratio) : null,
        section || null, notes || null, req.user.id,
      ]
    );

    // Audit
    query(`INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
           VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'CREATE', 'production_record', id,
       `Production recorded: ${actual} T on ${record_date} (${achPct != null ? achPct+'%' : 'no target'})`,
       mine_id, req.ip]).catch(() => {});

    const row = (await query(
      `SELECT pr.*, m.name as mine_name FROM production_records pr JOIN mines m ON pr.mine_id=m.id WHERE pr.id=?`, [id]
    )).rows[0];

    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   PUT /production/records/:id
   ════════════════════════════════════════════════════════════════════════ */
exports.updateRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['actual_tonnes','working_hours','workers_deployed','active_machines',
                     'productivity_tph','stripping_ratio','section','notes','status'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No updatable fields' });

    // Recompute achievement if actual_tonnes changed
    if (req.body.actual_tonnes !== undefined) {
      const existing = (await query('SELECT mine_id, record_date, mineral_type, target_tonnes FROM production_records WHERE id=?', [id])).rows[0];
      if (existing?.target_tonnes) {
        const achPct = Math.round((parseFloat(req.body.actual_tonnes) / existing.target_tonnes) * 100 * 10) / 10;
        sets.push('achievement_pct=?'); params.push(achPct);
      }
    }
    sets.push(`updated_at=datetime('now')`);
    params.push(id);
    await query(`UPDATE production_records SET ${sets.join(',')} WHERE id=?`, params);
    const row = (await query(
      `SELECT pr.*, m.name as mine_name FROM production_records pr JOIN mines m ON pr.mine_id=m.id WHERE pr.id=?`, [id]
    )).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET /production/trends
   Query: mine_id, period (daily|weekly|monthly), days (1-365)
   ════════════════════════════════════════════════════════════════════════ */
exports.getTrends = async (req, res, next) => {
  try {
    const { mine_id, period = 'daily', days = 30 } = req.query;
    const mId = mineFilter(req.user, mine_id);
    if (!mId) return res.status(400).json({ success: false, message: 'mine_id required' });

    const safeDays = Math.max(1, Math.min(365, parseInt(days, 10) || 30));
    let groupFmt, labelCol;
    if (period === 'weekly')  { groupFmt = `strftime('%Y-W%W', record_date)`; labelCol = 'week'; }
    else if (period === 'monthly') { groupFmt = `strftime('%Y-%m', record_date)`; labelCol = 'month'; }
    else { groupFmt = 'record_date'; labelCol = 'date'; }

    const rows = (await query(
      `SELECT ${groupFmt} as ${labelCol},
         ROUND(SUM(actual_tonnes),0)   as actual,
         ROUND(SUM(target_tonnes),0)   as target,
         ROUND(AVG(achievement_pct),1) as achievement_pct,
         ROUND(AVG(productivity_tph),2)as avg_tph,
         COUNT(*) as record_count
       FROM production_records
       WHERE mine_id=? AND record_date >= date('now','-${safeDays} days')
       GROUP BY ${groupFmt}
       ORDER BY ${labelCol} ASC`,
      [mId]
    )).rows;

    // Attach mine name
    const mine = (await query('SELECT name FROM mines WHERE id=?', [mId])).rows[0];

    res.json({ success: true, data: rows, mine_name: mine?.name, period, days: safeDays });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET /production/targets
   ════════════════════════════════════════════════════════════════════════ */
exports.getTargets = async (req, res, next) => {
  try {
    const { mine_id, from_date, to_date, period_type } = req.query;
    const mId = mineFilter(req.user, mine_id);
    const conds = [], params = [];
    if (mId)        { conds.push('pt.mine_id=?');      params.push(mId); }
    if (from_date)  { conds.push('pt.target_date>=?'); params.push(from_date); }
    if (to_date)    { conds.push('pt.target_date<=?'); params.push(to_date); }
    if (period_type){ conds.push('pt.period_type=?');  params.push(period_type); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = (await query(
      `SELECT pt.*, m.name as mine_name FROM production_targets pt
       JOIN mines m ON pt.mine_id=m.id
       ${where} ORDER BY pt.target_date DESC LIMIT 100`, params
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   POST /production/targets
   ════════════════════════════════════════════════════════════════════════ */
exports.setTarget = async (req, res, next) => {
  try {
    const { mine_id, target_date, period_type = 'daily', mineral_type = 'Coal', target_tonnes, notes } = req.body;
    if (!mine_id || !target_date || !target_tonnes)
      return res.status(400).json({ success: false, message: 'mine_id, target_date, target_tonnes required' });

    const mine = (await query('SELECT id FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(400).json({ success: false, message: 'Mine not found' });

    // Upsert — update if exists
    const existing = (await query(
      `SELECT id FROM production_targets WHERE mine_id=? AND target_date=? AND period_type=? AND mineral_type=?`,
      [mine_id, target_date, period_type, mineral_type]
    )).rows[0];

    if (existing) {
      await query(
        `UPDATE production_targets SET target_tonnes=?, notes=?, set_by=?, updated_at=datetime('now') WHERE id=?`,
        [parseFloat(target_tonnes), notes || null, req.user.id, existing.id]
      );
      const row = (await query('SELECT * FROM production_targets WHERE id=?', [existing.id])).rows[0];
      return res.json({ success: true, data: row });
    }

    const id = uuid();
    await query(
      `INSERT INTO production_targets (id,mine_id,target_date,period_type,mineral_type,target_tonnes,set_by,notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, mine_id, target_date, period_type, mineral_type, parseFloat(target_tonnes), req.user.id, notes || null]
    );
    const row = (await query('SELECT * FROM production_targets WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET /production/machinery
   ════════════════════════════════════════════════════════════════════════ */
exports.getMachinery = async (req, res, next) => {
  try {
    const mId    = mineFilter(req.user, req.query.mine_id);
    const status = req.query.status;
    const conds  = [], params = [];
    if (mId)   { conds.push('ms.mine_id=?'); params.push(mId); }
    if (status){ conds.push('ms.status=?');  params.push(status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = (await query(
      `SELECT ms.*, m.name as mine_name FROM machinery_status ms
       JOIN mines m ON ms.mine_id=m.id
       ${where}
       ORDER BY CASE ms.status WHEN 'breakdown' THEN 1 WHEN 'maintenance' THEN 2 WHEN 'idle' THEN 3 WHEN 'operational' THEN 4 ELSE 5 END, ms.machine_name ASC`,
      params
    )).rows;

    // Summary counts
    const summary = rows.reduce((acc, m) => {
      acc[m.status] = (acc[m.status] || 0) + 1;
      acc.total++;
      return acc;
    }, { total: 0, operational: 0, maintenance: 0, breakdown: 0, idle: 0 });

    res.json({ success: true, data: rows, summary });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   POST /production/machinery
   ════════════════════════════════════════════════════════════════════════ */
exports.addMachine = async (req, res, next) => {
  try {
    const { mine_id, machine_name, machine_code, machine_type, capacity_tph,
            status = 'operational', location_in_mine, operator_name,
            last_service_date, next_service_date, notes } = req.body;

    if (!mine_id || !machine_name || !machine_type)
      return res.status(400).json({ success: false, message: 'mine_id, machine_name, machine_type required' });

    const id = uuid();
    await query(
      `INSERT INTO machinery_status (id,mine_id,machine_name,machine_code,machine_type,capacity_tph,
         status,location_in_mine,operator_name,last_service_date,next_service_date,notes,reported_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [id, mine_id, machine_name, machine_code || null, machine_type,
       capacity_tph ? parseFloat(capacity_tph) : null, status,
       location_in_mine || null, operator_name || null,
       last_service_date || null, next_service_date || null,
       notes || null, req.user.id]
    );
    const row = (await query('SELECT * FROM machinery_status WHERE id=?', [id])).rows[0];
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   PUT /production/machinery/:id
   ════════════════════════════════════════════════════════════════════════ */
exports.updateMachine = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['status','downtime_reason','downtime_hours','location_in_mine',
                     'operator_name','last_service_date','next_service_date','notes','machine_code'];
    const sets = [], params = [];

    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); params.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });

    // Set last_status_change if status changed
    if (req.body.status) {
      sets.push(`last_status_change=datetime('now')`);
      if (['breakdown','maintenance'].includes(req.body.status) && !req.body.downtime_start) {
        sets.push(`downtime_start=datetime('now')`);
      }
      if (req.body.status === 'operational') {
        // Clear downtime
        sets.push(`downtime_start=NULL`);
      }
    }
    sets.push(`updated_at=datetime('now')`);
    params.push(id);
    await query(`UPDATE machinery_status SET ${sets.join(',')} WHERE id=?`, params);
    const row = (await query('SELECT * FROM machinery_status WHERE id=?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Machine not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════
   GET /production/analysis
   AI-style production anomaly detection & insights from real data.
   ════════════════════════════════════════════════════════════════════════ */
exports.getAnalysis = async (req, res, next) => {
  try {
    const mId = mineFilter(req.user, req.query.mine_id);
    if (!mId) return res.status(400).json({ success: false, message: 'mine_id required' });

    const mine = (await query('SELECT id, name FROM mines WHERE id=?', [mId])).rows[0];
    if (!mine) return res.status(404).json({ success: false, message: 'Mine not found' });

    // Last 30 days production
    const records = (await query(
      `SELECT record_date, actual_tonnes, target_tonnes, achievement_pct,
              productivity_tph, active_machines, workers_deployed, working_hours
       FROM production_records
       WHERE mine_id=? AND record_date >= date('now','-30 days')
       ORDER BY record_date ASC`,
      [mId]
    )).rows;

    if (records.length < 5) {
      return res.json({
        success: true,
        data: {
          mine_id: mId, mine_name: mine.name,
          insights: [],
          summary: 'Insufficient data for analysis. At least 5 production records are required.',
          data_points: records.length,
        },
      });
    }

    const insights = [];

    // 1. Recent vs historical trend
    const recent  = records.slice(-7);
    const prior   = records.slice(-21, -7);
    if (recent.length >= 3 && prior.length >= 3) {
      const recentAvg = recent.reduce((s,r)=>s+parseFloat(r.actual_tonnes||0),0)/recent.length;
      const priorAvg  = prior.reduce((s,r)=>s+parseFloat(r.actual_tonnes||0),0)/prior.length;
      const diff      = priorAvg > 0 ? (recentAvg - priorAvg) / priorAvg : 0;
      if (Math.abs(diff) > 0.10) {
        insights.push({
          type:     diff < 0 ? 'DROP' : 'RISE',
          severity: Math.abs(diff) > 0.25 ? 'HIGH' : 'MEDIUM',
          title:    diff < 0
            ? `Production dropped ${Math.abs(Math.round(diff*100))}% vs prior period`
            : `Production increased ${Math.abs(Math.round(diff*100))}% vs prior period`,
          detail:   `Recent 7-day average: ${Math.round(recentAvg).toLocaleString()} T/day. Prior 14-day average: ${Math.round(priorAvg).toLocaleString()} T/day.`,
          label:    'AI ANALYSIS — not a confirmed cause',
        });
      }
    }

    // 2. Consecutive underperformance
    const lowDays = records.slice(-7).filter(r => parseFloat(r.achievement_pct||0) < 75);
    if (lowDays.length >= 3) {
      insights.push({
        type:     'UNDERPERFORMANCE',
        severity: lowDays.length >= 5 ? 'HIGH' : 'MEDIUM',
        title:    `${lowDays.length} of last 7 days below 75% achievement`,
        detail:   `Dates: ${lowDays.map(d=>d.record_date).join(', ')}. Average achievement: ${Math.round(lowDays.reduce((s,r)=>s+parseFloat(r.achievement_pct||0),0)/lowDays.length)}%.`,
        label:    'AI ANALYSIS — not a confirmed cause',
      });
    }

    // 3. Machinery correlation — check if breakdown days coincide with low production
    const breakdownDays = (await query(
      `SELECT DATE(last_status_change) as bd FROM machinery_status
       WHERE mine_id=? AND status IN ('breakdown','maintenance')
       AND last_status_change >= date('now','-30 days')`,
      [mId]
    )).rows.map(r => r.bd);

    if (breakdownDays.length > 0) {
      const lowOnBreakdown = records.filter(r =>
        breakdownDays.includes(r.record_date) && parseFloat(r.achievement_pct||0) < 85
      );
      if (lowOnBreakdown.length > 0) {
        insights.push({
          type:     'MACHINERY_CORRELATION',
          severity: 'MEDIUM',
          title:    `Possible machinery-production correlation on ${lowOnBreakdown.length} day(s)`,
          detail:   `Low production (<85% target) coincided with machinery breakdown/maintenance on: ${lowOnBreakdown.map(r=>r.record_date).join(', ')}. This may be a contributing factor — further investigation recommended.`,
          label:    'AI ANALYSIS — correlation only, not confirmed cause',
        });
      }
    }

    // 4. Productivity trend
    const tphData = records.filter(r => r.productivity_tph > 0);
    if (tphData.length >= 5) {
      const recentTph = tphData.slice(-5).reduce((s,r)=>s+parseFloat(r.productivity_tph),0)/5;
      const olderTph  = tphData.slice(0, Math.max(5, tphData.length-5)).reduce((s,r)=>s+parseFloat(r.productivity_tph),0)
                        / Math.max(5, tphData.length-5);
      const tphDiff = olderTph > 0 ? (recentTph - olderTph) / olderTph : 0;
      if (tphDiff < -0.12) {
        insights.push({
          type:     'PRODUCTIVITY_DROP',
          severity: 'MEDIUM',
          title:    `Workforce productivity down ${Math.abs(Math.round(tphDiff*100))}% (tonnes/hour)`,
          detail:   `Recent avg: ${recentTph.toFixed(1)} T/hr vs earlier avg: ${olderTph.toFixed(1)} T/hr. Possible causes: worker fatigue, machinery issues, or shift changes.`,
          label:    'AI ANALYSIS — not a confirmed cause',
        });
      }
    }

    // 5. Positive insight — if all good
    if (insights.length === 0) {
      const avgAch = records.slice(-7).reduce((s,r)=>s+parseFloat(r.achievement_pct||0),0) / Math.min(7, records.slice(-7).length);
      insights.push({
        type:     'NORMAL',
        severity: 'LOW',
        title:    `Production within normal range — ${Math.round(avgAch)}% avg achievement (7 days)`,
        detail:   `No significant anomalies detected in the last 30 days. Continue monitoring.`,
        label:    'AI ANALYSIS',
      });
    }

    // Summary
    const latest = records[records.length - 1];
    const summary = `Mine: ${mine.name}. Last 30 days: ${records.length} records. Latest (${latest?.record_date}): ${Math.round(parseFloat(latest?.actual_tonnes||0)).toLocaleString()} T (${latest?.achievement_pct}% of target). ${insights.length} insight(s) detected.`;

    res.json({
      success: true,
      data: {
        mine_id:    mId,
        mine_name:  mine.name,
        insights,
        summary,
        data_points: records.length,
        disclaimer: 'All AI insights are based on statistical analysis of production data. They represent patterns and correlations, not confirmed root causes. Always verify with ground-level observations.',
      },
    });
  } catch (err) { next(err); }
};
