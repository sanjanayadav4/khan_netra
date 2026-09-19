/**
 * KhanNetra Risk Dashboard Controller
 * ─────────────────────────────────────────────────────────────────────────────
 * All risk scores are computed from real database records via analyticsService.
 * No random values, no hardcoded scores.
 * Every response includes data_freshness so the UI can display when data was
 * last calculated.
 */
'use strict';

const { query } = require('../config/database');
const {
  calculateMineRisk,
  detectRecurringViolations,
  detectAnomalies,
  getPredictiveRisk,
  getFullRiskAnalysis,
} = require('../services/analyticsService');

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/v1/risk/high-risk
   Returns high-risk mines with evidence-based scores and full evidence trail.
   ════════════════════════════════════════════════════════════════════════════ */
exports.getHighRisk = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);

    // Fetch all non-closed mines
    const mines = (await query(
      `SELECT m.id, m.name, m.state, m.mine_id, m.type, m.status,
              m.compliance_score, m.risk_score, m.safety_score, m.environmental_score,
              m.license_expiry, m.workers_count,
              (SELECT COUNT(*) FROM violations v
               WHERE v.mine_id=m.id AND v.status!='closed' AND v.severity='critical') as critical_violations,
              (SELECT COUNT(*) FROM incidents i
               WHERE i.mine_id=m.id AND i.severity IN ('fatal','serious')
               AND i.incident_date>=datetime('now','-90 days'))              as recent_serious_incidents,
              (SELECT COUNT(*) FROM environmental_readings er
               WHERE er.mine_id=m.id AND er.status IN ('critical','warning')
               AND er.recorded_at>=datetime('now','-7 days'))               as env_alerts,
              (SELECT COUNT(*) FROM documents d
               WHERE d.mine_id=m.id AND d.status='expired')                 as expired_docs,
              (SELECT COUNT(*) FROM corrective_actions ca
               WHERE ca.mine_id=m.id AND ca.status NOT IN ('completed','cancelled')
               AND ca.due_date < date('now'))                                as overdue_ca
       FROM mines m
       WHERE m.status NOT IN ('closed','inactive')
       ORDER BY m.risk_score DESC, critical_violations DESC
       LIMIT ?`,
      [limit]
    )).rows;

    // Compute evidence-based risk for each mine (parallel)
    const minesWithRisk = await Promise.all(
      mines.map(async (m) => {
        const risk = await calculateMineRisk(m.id);
        return {
          ...m,
          computed_risk_score:  risk.score,
          computed_risk_level:  risk.level,
          evidence:             risk.evidence,
          risk_factors:         risk.factors,
          confidence:           risk.confidence,
          data_as_of:           risk.data_as_of,
          model_version:        risk.model_version,
        };
      })
    );

    // Re-sort by computed score
    minesWithRisk.sort((a, b) => b.computed_risk_score - a.computed_risk_score);

    // Recurring violations (real data, 180-day window, 2+ occurrences)
    const recurring = await detectRecurringViolations(null, 180, 2);

    // Anomalies from real patterns
    const anomalies = await detectAnomalies();

    // Compliance trend — SQLite syntax
    const complianceTrend = (await query(
      `SELECT strftime('%Y-%m', detected_date) as month,
         COUNT(*) as violations,
         COUNT(CASE WHEN severity='critical' THEN 1 END) as critical
       FROM violations
       WHERE detected_date >= date('now','-6 months')
       GROUP BY strftime('%Y-%m', detected_date)
       ORDER BY month ASC`
    )).rows;

    // Top violated regulation categories
    const topCategories = (await query(
      `SELECT category, type, COUNT(*) as count, SUM(fine_amount) as total_fines
       FROM violations
       WHERE status != 'closed'
       GROUP BY category, type
       ORDER BY count DESC
       LIMIT 8`
    )).rows;

    res.json({
      success: true,
      data: {
        high_risk_mines:      minesWithRisk,
        recurring_violations: recurring.slice(0, 10),
        anomaly_mines:        anomalies,
        compliance_trend:     complianceTrend,
        top_categories:       topCategories,
      },
      meta: {
        data_freshness:  new Date().toISOString(),
        risk_model:      'v1.0-weighted-evidence',
        data_source:     'real database records',
        mines_evaluated: minesWithRisk.length,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/v1/risk/role-based
   Role-specific dashboard views, all driven from real DB data.
   ════════════════════════════════════════════════════════════════════════════ */
exports.getRoleBasedDashboard = async (req, res, next) => {
  try {
    const { role } = req.user;
    const mineId   = req.user.mine_id;
    const now      = new Date().toISOString();

    // ── Mine Manager: their mine only ──────────────────────────────────────
    if (role === 'mine_manager') {
      if (!mineId) {
        return res.status(400).json({ success: false, message: 'No mine assigned to this user.' });
      }

      const [mine, viol, inc, env, docs, deadlines, risk] = await Promise.all([
        query(`SELECT * FROM mines WHERE id=?`, [mineId]),
        query(`SELECT status, COUNT(*) as c FROM violations WHERE mine_id=? GROUP BY status`, [mineId]),
        query(
          `SELECT severity, COUNT(*) as c FROM incidents
           WHERE mine_id=? AND incident_date>=datetime('now','-90 days')
           GROUP BY severity`,
          [mineId]
        ),
        query(
          `SELECT COUNT(*) as alerts FROM environmental_readings
           WHERE mine_id=? AND status IN ('warning','critical')
           AND recorded_at>=datetime('now','-7 days')`,
          [mineId]
        ),
        query(`SELECT COUNT(*) as expired FROM documents WHERE mine_id=? AND status='expired'`, [mineId]),
        query(`SELECT COUNT(*) as overdue FROM compliance_deadlines WHERE mine_id=? AND status='overdue'`, [mineId]),
        calculateMineRisk(mineId),
      ]);

      return res.json({
        success: true,
        role:    'mine_manager',
        data: {
          mine:              mine.rows[0],
          violations:        viol.rows,
          incidents:         inc.rows,
          env_alerts:        parseInt(env.rows[0].alerts)       || 0,
          expired_docs:      parseInt(docs.rows[0].expired)     || 0,
          overdue_deadlines: parseInt(deadlines.rows[0].overdue)|| 0,
          risk_summary: {
            score:    risk.score,
            level:    risk.level,
            evidence: risk.evidence,
            data_as_of: risk.data_as_of,
          },
        },
        meta: { data_freshness: now },
      });
    }

    // ── Inspector: their assignments ───────────────────────────────────────
    if (role === 'inspector') {
      const [upcoming, recent, pendingCA] = await Promise.all([
        query(
          `SELECT ins.*, m.name as mine_name
           FROM inspections ins JOIN mines m ON ins.mine_id=m.id
           WHERE ins.inspector_id=? AND ins.scheduled_date >= date('now')
           AND ins.status='scheduled'
           ORDER BY ins.scheduled_date ASC LIMIT 10`,
          [req.user.id]
        ),
        query(
          `SELECT ins.*, m.name as mine_name
           FROM inspections ins JOIN mines m ON ins.mine_id=m.id
           WHERE ins.inspector_id=?
           ORDER BY ins.completed_date DESC LIMIT 5`,
          [req.user.id]
        ),
        query(
          `SELECT ca.*, v.category, m.name as mine_name
           FROM corrective_actions ca
           JOIN violations v ON ca.violation_id=v.id
           JOIN mines m ON ca.mine_id=m.id
           WHERE ca.assigned_to=? AND ca.status IN ('pending','in_progress')
           ORDER BY ca.due_date ASC LIMIT 10`,
          [req.user.id]
        ),
      ]);

      return res.json({
        success: true,
        role:    'inspector',
        data: {
          upcoming_inspections: upcoming.rows,
          recent_inspections:   recent.rows,
          pending_actions:      pendingCA.rows,
        },
        meta: { data_freshness: now },
      });
    }

    // ── Admin / Government Officer: national view ──────────────────────────
    const [mineStats, topRisk, overdueDL, envCritical] = await Promise.all([
      query(
        `SELECT status, COUNT(*) as count,
                AVG(compliance_score) as avg_compliance,
                AVG(risk_score) as avg_risk
         FROM mines GROUP BY status`
      ),
      query(
        `SELECT id, name, state, compliance_score, risk_score
         FROM mines ORDER BY risk_score DESC LIMIT 5`
      ),
      query(
        `SELECT cd.*, m.name as mine_name
         FROM compliance_deadlines cd JOIN mines m ON cd.mine_id=m.id
         WHERE cd.status='overdue'
         ORDER BY cd.deadline_date ASC LIMIT 5`
      ),
      query(
        `SELECT DISTINCT er.mine_id, m.name as mine_name,
                er.parameter, er.value, er.unit, er.status
         FROM environmental_readings er JOIN mines m ON er.mine_id=m.id
         WHERE er.status='critical'
         AND er.recorded_at>=datetime('now','-24 hours')
         LIMIT 8`
      ),
    ]);

    // Evidence-based risk for top 5
    const topRiskWithEvidence = await Promise.all(
      topRisk.rows.map(async (m) => {
        const risk = await calculateMineRisk(m.id);
        return { ...m, evidence: risk.evidence, computed_risk: risk.score, risk_level: risk.level };
      })
    );

    res.json({
      success: true,
      role,
      data: {
        mine_stats:        mineStats.rows,
        top_risk_mines:    topRiskWithEvidence,
        overdue_deadlines: overdueDL.rows,
        env_critical:      envCritical.rows,
      },
      meta: { data_freshness: now },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/v1/risk/gis
   All map data for the GIS dashboard — 5 layers:
     mines, incidents (safety), inspections, env sensors, disaster alerts
   ════════════════════════════════════════════════════════════════════════════ */
exports.getGisData = async (req, res, next) => {
  try {
    const mineId = req.user.role === 'mine_manager' ? req.user.mine_id : req.query.mine_id;
    const mf     = mineId ? `AND m.id = '${mineId}'` : '';
    const mfRaw  = mineId ? `AND mine_id = '${mineId}'` : '';

    // ── Layer 1: Mines (with live stats) ───────────────────────────────
    const mines = (await query(
      `SELECT m.id, m.name, m.state, m.district, m.mine_id, m.type, m.status,
              m.latitude, m.longitude, m.compliance_score, m.risk_score,
              m.safety_score, m.environmental_score,
              m.workers_count, m.area_hectares, m.license_expiry,
              m.owner_company, m.mining_method,
              (SELECT COUNT(*) FROM violations v WHERE v.mine_id=m.id AND v.status!='closed') as open_violations,
              (SELECT COUNT(*) FROM incidents  i WHERE i.mine_id=m.id AND i.status!='closed') as open_incidents,
              (SELECT COUNT(*) FROM inspections ins WHERE ins.mine_id=m.id AND ins.status='scheduled') as pending_inspections
       FROM mines m WHERE m.latitude IS NOT NULL ${mf}
       ORDER BY m.risk_score DESC`
    )).rows;

    // ── Layer 2: Incidents / Safety (use mine coords — incidents rarely have own coords) ───
    const incidents = (await query(
      `SELECT i.id, i.incident_number, i.type, i.severity, i.category,
              i.description, i.incident_date, i.location_in_mine,
              i.injuries_count, i.fatalities_count, i.status,
              m.name as mine_name, m.latitude, m.longitude
       FROM incidents i
       JOIN mines m ON i.mine_id = m.id
       WHERE m.latitude IS NOT NULL AND i.status != 'closed' ${mfRaw.replace('mine_id','i.mine_id')}
       ORDER BY CASE i.severity WHEN 'fatal' THEN 1 WHEN 'serious' THEN 2 ELSE 3 END,
                i.incident_date DESC
       LIMIT 60`
    )).rows;

    // ── Layer 3: Inspections ────────────────────────────────────────────
    const inspections = (await query(
      `SELECT ins.id, ins.inspection_number, ins.type, ins.status,
              ins.scheduled_date, ins.completed_date, ins.overall_score,
              ins.findings,
              m.name as mine_name, m.latitude, m.longitude
       FROM inspections ins
       JOIN mines m ON ins.mine_id = m.id
       WHERE m.latitude IS NOT NULL ${mfRaw.replace('mine_id','ins.mine_id')}
       ORDER BY CASE ins.status WHEN 'scheduled' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                ins.scheduled_date ASC
       LIMIT 60`
    )).rows;

    // ── Layer 4: Environment / Sensor readings (latest per mine+param) ─
    const sensors = (await query(
      `SELECT er.id, er.mine_id, er.reading_type, er.parameter,
              er.value, er.unit, er.threshold_max, er.status, er.location, er.recorded_at,
              m.name as mine_name, m.latitude, m.longitude
       FROM environmental_readings er
       JOIN mines m ON er.mine_id = m.id
       WHERE m.latitude IS NOT NULL
         AND er.recorded_at = (
           SELECT MAX(er2.recorded_at) FROM environmental_readings er2
           WHERE er2.mine_id = er.mine_id AND er2.parameter = er.parameter
         )
         ${mfRaw.replace('mine_id','er.mine_id')}
       ORDER BY CASE er.status WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END
       LIMIT 80`
    )).rows;

    // ── Layer 5: Field Reports (geo-tagged only) ─────────────────────────
    const fieldReports = (await query(
      `SELECT fr.id, fr.report_number, fr.title, fr.report_type, fr.severity,
              fr.latitude, fr.longitude, fr.location_name, fr.status, fr.created_at,
              m.name as mine_name
       FROM field_reports fr JOIN mines m ON fr.mine_id=m.id
       WHERE fr.latitude IS NOT NULL AND fr.status != 'resolved'
         ${mfRaw.replace('mine_id','fr.mine_id')}
       ORDER BY fr.created_at DESC LIMIT 50`
    )).rows;

    // ── Layer 6: Disaster alerts (use mine coords where affected) ───────
    const disasters = (await query(
      `SELECT id, alert_type, title, severity, status,
              latitude, longitude, location_name,
              affected_mines, alert_time, magnitude, wind_speed, rainfall
       FROM disaster_alerts
       WHERE status != 'resolved' AND latitude IS NOT NULL
       ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,
                alert_time DESC
       LIMIT 30`
    )).rows.map(d => ({
      ...d,
      affected_mines: (() => { try { return JSON.parse(d.affected_mines||'[]'); } catch { return []; } })(),
    }));

    res.json({
      success: true,
      data: {
        mines,
        incidents,
        inspections,
        sensors,
        field_reports: fieldReports,
        disasters,
      },
      meta: {
        data_freshness: new Date().toISOString(),
        data_source:    'real database records',
        counts: {
          mines:       mines.length,
          incidents:   incidents.length,
          inspections: inspections.length,
          sensors:     sensors.length,
          fieldReports:fieldReports.length,
          disasters:   disasters.length,
        },
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/v1/risk/predict/:mine_id
   Predictive risk analysis for a specific mine — trend-based future projections.
════════════════════════════════════════════════════════════════════════════ */
exports.getPrediction = async (req, res, next) => {
  try {
    const { mine_id } = req.params;
    // Scope check: mine_manager can only see their own mine
    if (req.user.role === 'mine_manager' && req.user.mine_id && req.user.mine_id !== mine_id) {
      return res.status(403).json({ success: false, message: 'Access denied to this mine.' });
    }
    const mine = (await query('SELECT id, name, state FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(404).json({ success: false, message: 'Mine not found.' });

    const prediction = await getPredictiveRisk(mine_id);
    res.json({ success: true, data: prediction });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/v1/risk/analysis/:mine_id
   Complete risk analysis: current score + predictive + recurring + anomalies
   Returns a unified alert feed with explanations for all predictions.
════════════════════════════════════════════════════════════════════════════ */
exports.getFullAnalysis = async (req, res, next) => {
  try {
    const { mine_id } = req.params;
    if (req.user.role === 'mine_manager' && req.user.mine_id && req.user.mine_id !== mine_id) {
      return res.status(403).json({ success: false, message: 'Access denied to this mine.' });
    }
    const mine = (await query('SELECT id FROM mines WHERE id=?', [mine_id])).rows[0];
    if (!mine) return res.status(404).json({ success: false, message: 'Mine not found.' });

    const analysis = await getFullRiskAnalysis(mine_id);
    res.json({ success: true, data: analysis });
  } catch (err) { next(err); }
};
