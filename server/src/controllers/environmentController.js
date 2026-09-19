/**
 * KhanNetra — Environment Controller  v2
 * ─────────────────────────────────────────────────────────────────────────────
 * All thresholds read from env_parameters table (not hardcoded).
 * Readings CRUD, per-mine dashboard, alerts, trends, sensor ingest.
 * All existing consumers (analyticsService, riskDashboard, aiController)
 * rely only on column names that existed before — all preserved.
 */
'use strict';

const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/* ── Load thresholds from DB (cached per process) ─────────────────── */
let _paramCache = null;
async function getParams() {
  if (_paramCache) return _paramCache;
  const rows = (await query(`SELECT * FROM env_parameters WHERE is_active=1`)).rows;
  _paramCache = {};
  for (const p of rows) _paramCache[p.name] = p;
  return _paramCache;
}

function computeStatus(paramDef, value) {
  const v = parseFloat(value);
  if (!paramDef) return 'normal';
  if (paramDef.critical_max !== null && paramDef.critical_max !== undefined && v > paramDef.critical_max) return 'critical';
  if (v > paramDef.threshold_max) return 'warning';
  if (paramDef.threshold_min !== null && paramDef.threshold_min !== undefined && v < paramDef.threshold_min) return 'warning';
  return 'normal';
}

/* ── Create alert record + notifications ──────────────────────────── */
async function createAlert(readingId, mineId, param, category, value, unit, threshMax, severity, location) {
  const id = uuidv4();
  await query(
    `INSERT INTO env_alerts
       (id,reading_id,mine_id,parameter,category,value,unit,threshold_max,severity,location,message,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
    [
      id, readingId, mineId, param, category || 'Air Quality',
      value, unit || '', threshMax || 0, severity, location || '',
      `${param} at ${parseFloat(value).toFixed(3)} ${unit || ''} exceeds ${severity === 'critical' ? 'critical' : 'safe'} limit of ${threshMax} ${unit || ''}`.trim(),
    ]
  );

  // Push notification to env officers + admins
  const recipients = (await query(
    `SELECT id FROM users WHERE role IN ('admin','environment_officer','government_officer') AND is_active=1`
  )).rows;
  for (const u of recipients) {
    await query(
      `INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority,created_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))`,
      [
        uuidv4(), u.id, mineId,
        `${severity === 'critical' ? '🔴' : '⚠️'} ${param} ${severity.toUpperCase()} — Env Alert`,
        `${param} measured at ${parseFloat(value).toFixed(3)} ${unit || ''}. Limit: ${threshMax} ${unit || ''}. Location: ${location || 'Not specified'}`,
        'environmental', severity === 'critical' ? 'critical' : 'high',
      ]
    ).catch(() => {});
  }
  return id;
}

/* ════════════════════════════════════════════════════════════════════
   GET /environment  — paginated, filterable readings
   ════════════════════════════════════════════════════════════════════ */
exports.getReadings = async (req, res, next) => {
  try {
    const {
      mine_id, parameter, reading_type, category, status,
      from_date, to_date, sensor_type, location,
      page = 1, limit = 50,
    } = req.query;
    const off = (parseInt(page) - 1) * parseInt(limit);
    const conds = [], params = [];

    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;
    if (mId)         { conds.push('e.mine_id=?');          params.push(mId); }
    if (parameter)   { conds.push('e.parameter=?');         params.push(parameter); }
    if (reading_type){ conds.push('e.reading_type=?');      params.push(reading_type); }
    if (category)    { conds.push('e.category=?');          params.push(category); }
    if (status)      { conds.push('e.status=?');            params.push(status); }
    if (sensor_type) { conds.push('e.sensor_type=?');       params.push(sensor_type); }
    if (location)    { conds.push('e.location LIKE ?');     params.push(`%${location}%`); }
    if (from_date)   { conds.push('e.recorded_at >= ?');    params.push(from_date); }
    if (to_date)     { conds.push('e.recorded_at <= ?');    params.push(to_date + ' 23:59:59'); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const total = (await query(
      `SELECT COUNT(*) as c FROM environmental_readings e ${where}`, params
    )).rows[0].c;

    const rows = (await query(
      `SELECT e.*, m.name as mine_name, u.full_name as recorded_by_name
       FROM environmental_readings e
       JOIN mines m ON e.mine_id = m.id
       LEFT JOIN users u ON e.recorded_by = u.id
       ${where}
       ORDER BY e.recorded_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), off]
    )).rows;

    res.json({
      success: true, data: rows,
      pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /environment  — create reading (manual or sensor push)
   ════════════════════════════════════════════════════════════════════ */
exports.createReading = async (req, res, next) => {
  try {
    const {
      mine_id, reading_type, parameter, value, unit, location, notes,
      category, sensor_id, sensor_type = 'manual', section,
      latitude, longitude, weather_condition, wind_speed, wind_direction,
      temperature, humidity, recorded_at,
    } = req.body;

    if (!mine_id || !parameter || value === undefined || value === null)
      return res.status(400).json({ success: false, message: 'mine_id, parameter, value are required' });

    // Validate mine
    const mine = (await query('SELECT id FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(400).json({ success: false, message: 'Mine not found' });

    const params = await getParams();
    const paramDef = params[parameter];
    const v        = parseFloat(value);
    const status   = computeStatus(paramDef, v);
    const resolvedUnit = unit || paramDef?.unit || '';
    const resolvedCat  = category || paramDef?.category || reading_type || 'Air Quality';
    const threshMax    = paramDef?.threshold_max ?? (parseFloat(req.body.threshold_max) || 0);
    const threshMin    = paramDef?.threshold_min ?? (parseFloat(req.body.threshold_min) || 0);

    const id = uuidv4();
    const ts = recorded_at || new Date().toISOString();

    await query(
      `INSERT INTO environmental_readings
         (id, mine_id, reading_type, parameter, value, unit, threshold_min, threshold_max,
          status, location, recorded_at, recorded_by, notes,
          category, sensor_id, sensor_type, section,
          latitude, longitude, weather_condition, wind_speed, wind_direction,
          temperature, humidity, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [
        id, mine_id, reading_type || resolvedCat, parameter, v,
        resolvedUnit, threshMin, threshMax,
        status, location || null, ts, req.user.id, notes || null,
        resolvedCat, sensor_id || null, sensor_type, section || null,
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        weather_condition || null,
        wind_speed ? parseFloat(wind_speed) : null,
        wind_direction || null,
        temperature ? parseFloat(temperature) : null,
        humidity ? parseFloat(humidity) : null,
      ]
    );

    // Generate alert if out of range
    if (status === 'warning' || status === 'critical') {
      await createAlert(id, mine_id, parameter, resolvedCat, v, resolvedUnit, threshMax, status, location).catch(() => {});
    }

    // Trigger analytics re-scoring (async, fire-and-forget)
    const { recalculateAllMineScores } = require('../services/analyticsService');
    recalculateAllMineScores().catch(() => {});

    const row = (await query(
      `SELECT e.*, m.name as mine_name FROM environmental_readings e
       JOIN mines m ON e.mine_id=m.id WHERE e.id=?`, [id]
    )).rows[0];

    res.status(201).json({ success: true, data: row, alert_generated: status !== 'normal' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   PUT /environment/:id  — update a reading (notes, status correction)
   ════════════════════════════════════════════════════════════════════ */
exports.updateReading = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['notes', 'location', 'section', 'weather_condition', 'wind_speed', 'wind_direction', 'temperature', 'humidity'];
    const sets = [], ps = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); ps.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No updatable fields' });
    sets.push(`updated_at=datetime('now')`);
    ps.push(id);
    await query(`UPDATE environmental_readings SET ${sets.join(',')} WHERE id=?`, ps);
    const row = (await query('SELECT * FROM environmental_readings WHERE id=?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   DELETE /environment/:id
   ════════════════════════════════════════════════════════════════════ */
exports.deleteReading = async (req, res, next) => {
  try {
    const row = (await query('SELECT id FROM environmental_readings WHERE id=?', [req.params.id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    await query('DELETE FROM environmental_readings WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Reading deleted' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /environment/sensor-ingest  — batch sensor push (IoT / API key)
   Body: { api_key, mine_id, readings: [{ parameter, value, unit?, location?, sensor_id? }] }
   ════════════════════════════════════════════════════════════════════ */
exports.sensorIngest = async (req, res, next) => {
  try {
    const { mine_id, readings } = req.body;
    if (!mine_id || !Array.isArray(readings) || !readings.length)
      return res.status(400).json({ success: false, message: 'mine_id and readings[] required' });

    const mine = (await query('SELECT id FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(400).json({ success: false, message: 'Mine not found' });

    const params   = await getParams();
    const ts       = new Date().toISOString();
    let saved = 0, alerts = 0;

    for (const r of readings) {
      if (!r.parameter || r.value === undefined) continue;
      const paramDef = params[r.parameter];
      const v = parseFloat(r.value);
      const status = computeStatus(paramDef, v);
      const unit   = r.unit || paramDef?.unit || '';
      const cat    = r.category || paramDef?.category || 'Air Quality';
      const id     = uuidv4();

      await query(
        `INSERT INTO environmental_readings
           (id,mine_id,reading_type,parameter,value,unit,threshold_min,threshold_max,
            status,location,recorded_at,recorded_by,notes,
            category,sensor_id,sensor_type,section,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
        [
          id, mine_id, cat, r.parameter, v, unit,
          paramDef?.threshold_min ?? 0, paramDef?.threshold_max ?? 0,
          status, r.location || null, r.recorded_at || ts,
          req.user?.id || null, null,
          cat, r.sensor_id || null, 'automatic', r.section || null,
        ]
      );
      saved++;
      if (status !== 'normal') {
        await createAlert(id, mine_id, r.parameter, cat, v, unit, paramDef?.threshold_max || 0, status, r.location).catch(() => {});
        alerts++;
      }
    }

    res.json({ success: true, message: `${saved} readings saved, ${alerts} alerts generated`, saved, alerts });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /environment/dashboard  — mine × category summary
   ════════════════════════════════════════════════════════════════════ */
exports.getDashboardSummary = async (req, res, next) => {
  try {
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf  = mId ? `AND e.mine_id='${mId}'` : '';

    // Overall counts in last 7 days
    const counts = (await query(
      `SELECT m.id as mine_id, m.name as mine_name,
         SUM(CASE WHEN e.status='critical' THEN 1 ELSE 0 END) as critical_count,
         SUM(CASE WHEN e.status='warning'  THEN 1 ELSE 0 END) as warning_count,
         SUM(CASE WHEN e.status='normal'   THEN 1 ELSE 0 END) as normal_count,
         COUNT(*) as total_count
       FROM environmental_readings e
       JOIN mines m ON e.mine_id=m.id
       WHERE e.recorded_at>=datetime('now','-7 days') ${mf}
       GROUP BY m.id, m.name
       ORDER BY critical_count DESC`
    )).rows;

    // Latest reading per mine+parameter
    const latest = (await query(
      `SELECT e.mine_id, e.parameter, e.category, e.value, e.unit,
              e.status, e.threshold_max, e.threshold_min, e.location,
              e.recorded_at, e.sensor_type, m.name as mine_name
       FROM environmental_readings e
       JOIN mines m ON e.mine_id=m.id
       INNER JOIN (
         SELECT mine_id, parameter, MAX(recorded_at) as max_at
         FROM environmental_readings
         ${mId ? `WHERE mine_id='${mId}'` : ''}
         GROUP BY mine_id, parameter
       ) latest ON e.mine_id=latest.mine_id
                AND e.parameter=latest.parameter
                AND e.recorded_at=latest.max_at
       ORDER BY m.name ASC, e.category ASC, e.parameter ASC`
    )).rows;

    // Category breakdown — last 7 days for a better picture
    const categories = (await query(
      `SELECT e.category,
         SUM(CASE WHEN e.status='critical' THEN 1 ELSE 0 END) as critical,
         SUM(CASE WHEN e.status='warning'  THEN 1 ELSE 0 END) as warning,
         SUM(CASE WHEN e.status='normal'   THEN 1 ELSE 0 END) as normal,
         COUNT(*) as total
       FROM environmental_readings e
       WHERE e.recorded_at>=datetime('now','-7 days') ${mf}
       GROUP BY e.category`
    )).rows;

    // Unacknowledged alerts
    const alertCount = (await query(
      `SELECT COUNT(*) as c FROM env_alerts
       WHERE is_acknowledged=0 ${mId ? `AND mine_id='${mId}'` : ''}`
    )).rows[0].c;

    res.json({
      success: true,
      data: { mine_summaries: counts, latest_readings: latest, category_breakdown: categories, unack_alerts: parseInt(alertCount) },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /environment/alerts  — active env alerts
   ════════════════════════════════════════════════════════════════════ */
exports.getAlerts = async (req, res, next) => {
  try {
    const { mine_id, severity, acknowledged = 'false', page = 1, limit = 50 } = req.query;
    const off = (parseInt(page) - 1) * parseInt(limit);
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : mine_id;

    const conds = [], params = [];
    if (mId)                    { conds.push('a.mine_id=?');         params.push(mId); }
    if (severity)               { conds.push('a.severity=?');        params.push(severity); }
    if (acknowledged !== 'all') { conds.push('a.is_acknowledged=?'); params.push(acknowledged === 'true' ? 1 : 0); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as c FROM env_alerts a ${where}`, params)).rows[0].c;

    const rows = (await query(
      `SELECT a.*, m.name as mine_name
       FROM env_alerts a JOIN mines m ON a.mine_id=m.id
       ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), off]
    )).rows;

    res.json({ success: true, data: rows, pagination: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   POST /environment/alerts/:id/acknowledge
   ════════════════════════════════════════════════════════════════════ */
exports.acknowledgeAlert = async (req, res, next) => {
  try {
    await query(
      `UPDATE env_alerts SET is_acknowledged=1, acknowledged_by=?, acknowledged_at=datetime('now') WHERE id=?`,
      [req.user.id, req.params.id]
    );
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /environment/trends  — hourly/daily aggregation for a parameter
   ════════════════════════════════════════════════════════════════════ */
exports.getTrends = async (req, res, next) => {
  try {
    const { mine_id, parameter, days = 7, groupBy = 'hour' } = req.query;
    if (!mine_id || !parameter)
      return res.status(400).json({ success: false, message: 'mine_id and parameter required' });

    const safeDays = Math.max(1, Math.min(90, parseInt(days, 10) || 7));
    const fmt = groupBy === 'day'
      ? `strftime('%Y-%m-%d', recorded_at)`
      : `strftime('%Y-%m-%dT%H:00:00', recorded_at)`;

    const rows = (await query(
      `SELECT ${fmt} as time,
         ROUND(AVG(value),3)  as avg_value,
         ROUND(MIN(value),3)  as min_value,
         ROUND(MAX(value),3)  as max_value,
         COUNT(*)             as reading_count,
         SUM(CASE WHEN status='critical' THEN 1 ELSE 0 END) as critical_count,
         SUM(CASE WHEN status='warning'  THEN 1 ELSE 0 END) as warning_count,
         MAX(threshold_max) as threshold_max
       FROM environmental_readings
       WHERE mine_id=? AND parameter=? AND recorded_at>=datetime('now','-${safeDays} days')
       GROUP BY ${fmt}
       ORDER BY time ASC`,
      [mine_id, parameter]
    )).rows;

    res.json({ success: true, data: rows, parameter, days: safeDays });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /environment/mine/:id/latest  — latest per-parameter for one mine
   ════════════════════════════════════════════════════════════════════ */
exports.getLatestByMine = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT e.parameter, e.category, e.value, e.unit, e.status,
              e.location, e.recorded_at, e.reading_type,
              e.threshold_min, e.threshold_max, e.sensor_type, e.sensor_id
       FROM environmental_readings e
       INNER JOIN (
         SELECT parameter, MAX(recorded_at) as max_at
         FROM environmental_readings WHERE mine_id=? GROUP BY parameter
       ) latest ON e.parameter=latest.parameter AND e.recorded_at=latest.max_at
       WHERE e.mine_id=?
       ORDER BY e.category ASC, e.parameter ASC`,
      [req.params.id, req.params.id]
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /environment/parameters  — master parameter config for dropdowns
   ════════════════════════════════════════════════════════════════════ */
exports.getParameters = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT * FROM env_parameters WHERE is_active=1 ORDER BY category ASC, sort_order ASC`
    )).rows;
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /environment/stats  — summary stats for a mine
   ════════════════════════════════════════════════════════════════════ */
exports.getStats = async (req, res, next) => {
  try {
    const mId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf  = mId ? `WHERE mine_id='${mId}'` : '';
    const mfA = mId ? `AND mine_id='${mId}'` : '';

    const [totals, byStatus, byCat, recentAlerts, trendData] = await Promise.all([
      query(`SELECT COUNT(*) as total,
               SUM(CASE WHEN status='critical' THEN 1 ELSE 0 END) as critical,
               SUM(CASE WHEN status='warning'  THEN 1 ELSE 0 END) as warning,
               SUM(CASE WHEN status='normal'   THEN 1 ELSE 0 END) as normal
             FROM environmental_readings ${mf}`),
      query(`SELECT status, COUNT(*) as count FROM environmental_readings ${mf} GROUP BY status`),
      query(`SELECT category,
               COUNT(*) as total,
               SUM(CASE WHEN status='critical' THEN 1 ELSE 0 END) as critical,
               SUM(CASE WHEN status='warning'  THEN 1 ELSE 0 END) as warning
             FROM environmental_readings ${mf} GROUP BY category`),
      query(`SELECT COUNT(*) as c FROM env_alerts WHERE is_acknowledged=0 ${mfA}`),
      query(`SELECT parameter, COUNT(*) as readings,
               SUM(CASE WHEN status IN ('warning','critical') THEN 1 ELSE 0 END) as out_of_range
             FROM environmental_readings
             WHERE recorded_at>=datetime('now','-7 days')
             ${mId ? `AND mine_id='${mId}'` : ''}
             GROUP BY parameter ORDER BY out_of_range DESC LIMIT 10`),
    ]);

    res.json({
      success: true,
      data: {
        totals:          totals.rows[0],
        by_status:       byStatus.rows,
        by_category:     byCat.rows,
        unack_alerts:    parseInt(recentAlerts.rows[0]?.c || 0),
        top_parameters:  trendData.rows,
      },
    });
  } catch (err) { next(err); }
};
