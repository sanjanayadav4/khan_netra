/**
 * KhanNetra Analytics Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * All SQL uses SQLite syntax (?, datetime('now'), strftime, julianday).
 * PostgreSQL-style placeholders ($1/$2), DATE_TRUNC, INTERVAL, DISTINCT ON
 * have been replaced throughout.
 *
 * New endpoints added:
 *   GET /analytics/recurring-violations
 *   GET /analytics/anomalies
 *   GET /analytics/extras  (real docs/operations scores for the radar chart)
 */

'use strict';

const { query } = require('../config/database');
const {
  detectRecurringViolations,
  detectAnomalies,
  getDashboardExtras,
} = require('../services/analyticsService');

/* ════════════════════════════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════════════════════════════ */
exports.getDashboard = async (req, res, next) => {
  try {
    const isMgr  = req.user.role === 'mine_manager' && req.user.mine_id;
    const mineId = req.user.mine_id;

    const mf        = isMgr ? `AND mine_id = '${mineId}'` : '';
    const mfId      = isMgr ? `AND id      = '${mineId}'` : '';
    const mfVMine   = isMgr ? `AND v.mine_id = '${mineId}'` : '';
    const mfIMine   = isMgr ? `AND i.mine_id = '${mineId}'` : '';
    const mfDMine   = isMgr ? `AND d.mine_id = '${mineId}'` : '';
    const mfInsMine = isMgr ? `AND ins.mine_id = '${mineId}'` : '';

    const [mineStats, violStats, incStats, scores,
           recentViol, recentInc, docAlerts, envAlerts, upcoming] = await Promise.all([

      query(
        `SELECT COUNT(*) as total,
           COUNT(CASE WHEN status='active'           THEN 1 END) as active,
           COUNT(CASE WHEN status='suspended'        THEN 1 END) as suspended,
           COUNT(CASE WHEN status='under_inspection' THEN 1 END) as under_inspection,
           AVG(compliance_score) as avg_compliance,
           AVG(risk_score)       as avg_risk,
           SUM(workers_count)    as total_workers,
           SUM(current_production_mt) as total_production
         FROM mines WHERE 1=1 ${mfId}`
      ),

      query(
        `SELECT COUNT(*) as total,
           COUNT(CASE WHEN status!='closed'                       THEN 1 END) as open,
           COUNT(CASE WHEN severity='critical' AND status!='closed' THEN 1 END) as critical,
           COUNT(CASE WHEN severity='high'     AND status!='closed' THEN 1 END) as high,
           SUM(fine_amount) as total_fines
         FROM violations WHERE 1=1 ${mf}`
      ),

      query(
        `SELECT COUNT(*) as total,
           COUNT(CASE WHEN status!='closed'   THEN 1 END) as open,
           SUM(injuries_count)    as total_injuries,
           SUM(fatalities_count)  as total_fatalities,
           COUNT(CASE WHEN severity='fatal'   THEN 1 END) as fatal,
           COUNT(CASE WHEN severity='serious' THEN 1 END) as serious
         FROM incidents WHERE 1=1 ${mf}`
      ),

      query(
        `SELECT AVG(compliance_score)    as avg_compliance,
                AVG(risk_score)          as avg_risk,
                AVG(safety_score)        as avg_safety,
                AVG(environmental_score) as avg_env
         FROM mines WHERE 1=1 ${mfId}`
      ),

      query(
        `SELECT v.*, m.name as mine_name
         FROM violations v JOIN mines m ON v.mine_id = m.id
         WHERE v.status != 'closed' ${mfVMine}
         ORDER BY CASE v.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
                  v.detected_date DESC
         LIMIT 5`
      ),

      query(
        `SELECT i.*, m.name as mine_name
         FROM incidents i JOIN mines m ON i.mine_id = m.id
         WHERE i.status != 'closed' ${mfIMine}
         ORDER BY CASE i.severity WHEN 'fatal' THEN 1 WHEN 'serious' THEN 2 ELSE 3 END,
                  i.incident_date DESC
         LIMIT 5`
      ),

      query(
        `SELECT d.*, m.name as mine_name
         FROM documents d JOIN mines m ON d.mine_id = m.id
         WHERE d.status IN ('expired','expiring_soon') ${mfDMine}
         ORDER BY d.expiry_date ASC
         LIMIT 5`
      ),

      // SQLite: no DISTINCT ON — use subquery to get latest per mine+parameter
      query(
        `SELECT e.*, m.name as mine_name
         FROM environmental_readings e
         JOIN mines m ON e.mine_id = m.id
         INNER JOIN (
           SELECT mine_id, parameter, MAX(recorded_at) as max_at
           FROM environmental_readings
           WHERE status IN ('warning','critical') ${isMgr ? `AND mine_id = '${mineId}'` : ''}
           GROUP BY mine_id, parameter
         ) latest
         ON e.mine_id = latest.mine_id
         AND e.parameter = latest.parameter
         AND e.recorded_at = latest.max_at
         WHERE e.status IN ('warning','critical')
         LIMIT 5`
      ),

      query(
        `SELECT ins.*, m.name as mine_name, u.full_name as inspector_name
         FROM inspections ins
         JOIN mines m  ON ins.mine_id     = m.id
         LEFT JOIN users u ON ins.inspector_id = u.id
         WHERE ins.scheduled_date >= date('now')
         AND ins.status = 'scheduled' ${mfInsMine}
         ORDER BY ins.scheduled_date ASC
         LIMIT 5`
      ),
    ]);

    res.json({
      success: true,
      data: {
        mines:                  mineStats.rows[0],
        violations:             violStats.rows[0],
        incidents:              incStats.rows[0],
        scores:                 scores.rows[0],
        recent_violations:      recentViol.rows,
        recent_incidents:       recentInc.rows,
        document_alerts:        docAlerts.rows,
        environmental_alerts:   envAlerts.rows,
        upcoming_inspections:   upcoming.rows,
      },
      meta: { data_freshness: new Date().toISOString() },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   COMPLIANCE TREND  —  SQLite strftime replaces DATE_TRUNC
   ════════════════════════════════════════════════════════════════════════════ */
exports.getComplianceTrend = async (req, res, next) => {
  try {
    const { mine_id, months = 6 } = req.query;
    const mf  = mine_id ? `AND mine_id = '${mine_id}'` : '';
    const m   = Math.min(Math.max(parseInt(months) || 6, 1), 24);

    const result = await query(
      `SELECT strftime('%Y-%m', detected_date) as month,
         COUNT(*) as violations,
         COUNT(CASE WHEN severity='critical' THEN 1 END) as critical,
         COUNT(CASE WHEN severity='high'     THEN 1 END) as high,
         COUNT(CASE WHEN status='closed'     THEN 1 END) as resolved
       FROM violations
       WHERE detected_date >= date('now', '-${m} months') ${mf}
       GROUP BY strftime('%Y-%m', detected_date)
       ORDER BY month ASC`
    );

    res.json({
      success: true,
      data:    result.rows,
      meta: {
        data_freshness: new Date().toISOString(),
        window_months:  m,
        mine_filter:    mine_id || 'all',
        data_source:    'violations table — real records',
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   MINE RANKING
   ════════════════════════════════════════════════════════════════════════════ */
exports.getMineRanking = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, mine_id, name, state, compliance_score, risk_score,
              safety_score, environmental_score, status,
         (SELECT COUNT(*) FROM violations v
          WHERE v.mine_id=m.id AND v.status!='closed') as open_violations,
         (SELECT COUNT(*) FROM incidents i
          WHERE i.mine_id=m.id AND i.status!='closed') as open_incidents
       FROM mines m
       ORDER BY compliance_score DESC`
    );

    res.json({
      success: true,
      data:    result.rows,
      meta: {
        data_freshness: new Date().toISOString(),
        note:           'Scores are computed from real compliance_records, violations, and incident data.',
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   VIOLATION ANALYTICS  —  SQLite strftime replaces DATE_TRUNC + INTERVAL
   ════════════════════════════════════════════════════════════════════════════ */
exports.getViolationAnalytics = async (req, res, next) => {
  try {
    const { mine_id } = req.query;
    const mfW  = mine_id ? `WHERE mine_id = '${mine_id}'` : '';
    const mfA  = mine_id ? `AND mine_id = '${mine_id}'`   : '';
    const mfVW = mine_id ? `WHERE v.mine_id = '${mine_id}'` : '';

    const [bySeverity, byType, byMonth, byState] = await Promise.all([
      query(
        `SELECT severity, COUNT(*) as count, SUM(fine_amount) as fines
         FROM violations ${mfW}
         GROUP BY severity`
      ),
      query(
        `SELECT type, COUNT(*) as count
         FROM violations ${mfW}
         GROUP BY type
         ORDER BY count DESC`
      ),
      // SQLite: strftime replaces DATE_TRUNC; datetime replaces NOW()-INTERVAL
      query(
        `SELECT strftime('%Y-%m', detected_date) as month, COUNT(*) as count
         FROM violations
         WHERE detected_date >= date('now', '-12 months') ${mfA}
         GROUP BY strftime('%Y-%m', detected_date)
         ORDER BY month`
      ),
      query(
        `SELECT m.state, COUNT(*) as count, AVG(m.compliance_score) as avg_compliance
         FROM violations v JOIN mines m ON v.mine_id = m.id ${mfVW}
         GROUP BY m.state
         ORDER BY count DESC`
      ),
    ]);

    res.json({
      success: true,
      data: {
        bySeverity: bySeverity.rows,
        byType:     byType.rows,
        byMonth:    byMonth.rows,
        byState:    byState.rows,
      },
      meta: { data_freshness: new Date().toISOString() },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   PRODUCTION ANALYTICS
   ════════════════════════════════════════════════════════════════════════════ */
exports.getProductionAnalytics = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT name, state, type, current_production_mt, production_capacity_mt,
         CASE WHEN production_capacity_mt > 0
              THEN ROUND((CAST(current_production_mt AS REAL) / production_capacity_mt) * 100, 1)
              ELSE 0
         END as capacity_utilization,
         workers_count, compliance_score
       FROM mines
       WHERE status = 'active'
       ORDER BY current_production_mt DESC`
    );

    res.json({
      success: true,
      data:    result.rows,
      meta: {
        data_freshness: new Date().toISOString(),
        note:           'Production figures are from the mines table. Manual entry required for real-time figures.',
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   AUDIT LOGS  —  SQLite ? placeholders replace $1/$2
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAuditLogs = async (req, res, next) => {
  try {
    const { mine_id, user_id, action, entity_type, search, from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = [], params = [];

    if (mine_id)     { conds.push(`al.mine_id     = ?`); params.push(mine_id); }
    if (user_id)     { conds.push(`al.user_id     = ?`); params.push(user_id); }
    if (action)      { conds.push(`al.action      = ?`); params.push(action); }
    if (entity_type) { conds.push(`al.entity_type = ?`); params.push(entity_type); }
    if (search)      { conds.push(`(al.description LIKE ? OR u.full_name LIKE ? OR al.entity_type LIKE ?)`); const t=`%${search}%`; params.push(t,t,t); }
    if (from_date)   { conds.push(`al.created_at >= ?`); params.push(from_date); }
    if (to_date)     { conds.push(`al.created_at <= ?`); params.push(to_date + ' 23:59:59'); }

    // Mine-scoped roles: restrict to their mine
    const isMgrScoped = ['mine_manager','safety_officer','environment_officer'].includes(req.user?.role) && req.user?.mine_id;
    if (isMgrScoped) { conds.push(`al.mine_id = ?`); params.push(req.user.mine_id); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*) as c FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].c) || 0;

    const result = await query(
      `SELECT al.*, u.full_name, u.role, m.name as mine_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN mines m ON al.mine_id  = m.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data:    result.rows,
      pagination: {
        total: parseInt(total),
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      meta: { data_freshness: new Date().toISOString() },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   RECURRING VIOLATIONS  —  NEW ENDPOINT
   GET /api/v1/analytics/recurring-violations
   ════════════════════════════════════════════════════════════════════════════ */
exports.getRecurringViolations = async (req, res, next) => {
  try {
    const {
      mine_id    = null,
      window     = 180,    // look-back days
      min_count  = 2,      // minimum occurrences to flag
    } = req.query;

    const days  = Math.min(Math.max(parseInt(window)    || 180, 7),  365);
    const minC  = Math.min(Math.max(parseInt(min_count) || 2,   2),  20);

    // Mine managers see only their mine
    const effectiveMineId = req.user.role === 'mine_manager'
      ? req.user.mine_id
      : mine_id || null;

    const results = await detectRecurringViolations(effectiveMineId, days, minC);

    // Summary stats
    const totalOccurrences  = results.reduce((s, r) => s + r.occurrences, 0);
    const totalOpenViolations = results.reduce((s, r) => s + r.open_count, 0);
    const minesAffected     = new Set(results.map(r => r.mine_id)).size;

    res.json({
      success: true,
      data:    results,
      summary: {
        patterns_detected:     results.length,
        total_occurrences:     totalOccurrences,
        open_violations:       totalOpenViolations,
        mines_affected:        minesAffected,
        analysis_window_days:  days,
        min_occurrences_threshold: minC,
      },
      meta: {
        data_freshness: new Date().toISOString(),
        data_source:    'violations table — real records only',
        note:           results.length === 0
          ? 'No recurring violations found in the selected window. Reduce min_count or increase window.'
          : null,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   ANOMALY DETECTION  —  NEW ENDPOINT
   GET /api/v1/analytics/anomalies
   ════════════════════════════════════════════════════════════════════════════ */
exports.getAnomalies = async (req, res, next) => {
  try {
    const results = await detectAnomalies();

    const byType = {};
    for (const a of results) {
      byType[a.type] = (byType[a.type] || 0) + 1;
    }

    res.json({
      success: true,
      data:    results,
      summary: {
        total_anomalies: results.length,
        high_severity:   results.filter(a => a.severity === 'HIGH').length,
        medium_severity: results.filter(a => a.severity === 'MEDIUM').length,
        by_type:         byType,
        mines_affected:  new Set(results.map(a => a.mine_id)).size,
      },
      meta: {
        data_freshness: new Date().toISOString(),
        methodology:    '7-day vs 30-day baseline comparison (min 2–3 historical records required)',
        data_source:    'violations, incidents, corrective_actions, environmental_readings — real records only',
        note: results.length === 0
          ? 'No anomalies detected. Insufficient historical data or all mines operating within normal ranges.'
          : null,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   DASHBOARD EXTRAS  —  NEW ENDPOINT
   GET /api/v1/analytics/extras
   Returns real docs-health score and operations score for the radar chart.
   ════════════════════════════════════════════════════════════════════════════ */
exports.getDashboardExtras = async (req, res, next) => {
  try {
    const extras = await getDashboardExtras();

    res.json({
      success: true,
      data:    extras,
      meta: {
        data_freshness: new Date().toISOString(),
        docs_basis:     'Percentage of non-expired documents in the documents table',
        operations_basis: 'Average inspection score from completed inspections in last 30 days',
      },
    });
  } catch (err) { next(err); }
};
