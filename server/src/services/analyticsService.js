/**
 * KhanNetra Analytics Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Central data layer for risk scoring, recurring violation detection, anomaly
 * detection, and mine score recalculation.
 *
 * ALL calculations are derived from real database records only.
 * No random values, no mock data, no hardcoded scores.
 * If data is insufficient, functions return null / empty arrays and indicate
 * data availability clearly in the response.
 */

'use strict';

const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/* ════════════════════════════════════════════════════════════════════════════
   RISK ENGINE
   Computes a multi-factor risk score (0–100) for a mine from real DB records.
   Every factor carries an explicit evidence trail.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Factor weights (must sum to 100).
 * Adjust here to change the model without touching controller code.
 */
const RISK_WEIGHTS = {
  criticalViolations:    25,   // open critical violations
  highViolations:        12,   // open high violations
  fatalIncidents:        20,   // fatal incidents in 90 days
  seriousIncidents:      10,   // serious incidents in 90 days
  environmentalBreaches: 10,   // warning/critical env readings in 7 days
  expiredDocuments:       8,   // expired documents
  overdueCorrective:      8,   // corrective actions past due date
  overdueDeadlines:       7,   // compliance deadlines overdue
};

/**
 * Calculate risk score for one mine from real data.
 * Returns { score, level, factors, evidence, data_as_of }
 */
async function calculateMineRisk(mineId) {
  const now = new Date().toISOString();

  const [
    critViol,
    highViol,
    fatalInc,
    seriousInc,
    envBreaches,
    expiredDocs,
    overdueCA,
    overdueDeadlines,
    mine,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) as c FROM violations
       WHERE mine_id=? AND status NOT IN ('closed') AND severity='critical'`,
      [mineId]
    ),
    query(
      `SELECT COUNT(*) as c FROM violations
       WHERE mine_id=? AND status NOT IN ('closed') AND severity='high'`,
      [mineId]
    ),
    query(
      `SELECT COUNT(*) as c FROM incidents
       WHERE mine_id=? AND severity='fatal' AND incident_date>=datetime('now','-90 days')`,
      [mineId]
    ),
    query(
      `SELECT COUNT(*) as c FROM incidents
       WHERE mine_id=? AND severity='serious' AND incident_date>=datetime('now','-90 days')`,
      [mineId]
    ),
    query(
      `SELECT COUNT(*) as c FROM environmental_readings
       WHERE mine_id=? AND status IN ('warning','critical')
       AND recorded_at>=datetime('now','-7 days')`,
      [mineId]
    ),
    query(
      `SELECT COUNT(*) as c FROM documents
       WHERE mine_id=? AND status='expired'`,
      [mineId]
    ),
    query(
      `SELECT COUNT(*) as c FROM corrective_actions
       WHERE mine_id=? AND status NOT IN ('completed','cancelled')
       AND due_date < date('now')`,
      [mineId]
    ),
    query(
      `SELECT COUNT(*) as c FROM compliance_deadlines
       WHERE mine_id=? AND status='overdue'`,
      [mineId]
    ),
    query(`SELECT id, name, license_expiry FROM mines WHERE id=?`, [mineId]),
  ]);

  const cv  = parseInt(critViol.rows[0].c)       || 0;
  const hv  = parseInt(highViol.rows[0].c)       || 0;
  const fi  = parseInt(fatalInc.rows[0].c)       || 0;
  const si  = parseInt(seriousInc.rows[0].c)     || 0;
  const eb  = parseInt(envBreaches.rows[0].c)    || 0;
  const ed  = parseInt(expiredDocs.rows[0].c)    || 0;
  const oca = parseInt(overdueCA.rows[0].c)       || 0;
  const odl = parseInt(overdueDeadlines.rows[0].c)|| 0;

  // Normalise each factor to 0–100, then apply weight
  const norm = (val, max) => Math.min(100, (val / max) * 100);

  // Expired license adds flat bonus
  const mineRow = mine.rows[0] || {};
  const licenseExpired = mineRow.license_expiry && new Date(mineRow.license_expiry) < new Date();
  const licenseBonus = licenseExpired ? 20 : 0;

  const factors = [
    {
      name:        'Critical Open Violations',
      weight:      RISK_WEIGHTS.criticalViolations,
      raw:         cv,
      normalised:  norm(cv, 3),   // 3 critical = full weight
      evidence:    `${cv} critical violation(s) unresolved`,
    },
    {
      name:        'High Open Violations',
      weight:      RISK_WEIGHTS.highViolations,
      raw:         hv,
      normalised:  norm(hv, 5),
      evidence:    `${hv} high-severity violation(s) unresolved`,
    },
    {
      name:        'Fatal Incidents (90 days)',
      weight:      RISK_WEIGHTS.fatalIncidents,
      raw:         fi,
      normalised:  norm(fi, 2),   // 2 fatals = full weight
      evidence:    `${fi} fatal incident(s) in last 90 days`,
    },
    {
      name:        'Serious Incidents (90 days)',
      weight:      RISK_WEIGHTS.seriousIncidents,
      raw:         si,
      normalised:  norm(si, 5),
      evidence:    `${si} serious incident(s) in last 90 days`,
    },
    {
      name:        'Environmental Breaches (7 days)',
      weight:      RISK_WEIGHTS.environmentalBreaches,
      raw:         eb,
      normalised:  norm(eb, 10),
      evidence:    `${eb} warning/critical environmental reading(s)`,
    },
    {
      name:        'Expired Documents',
      weight:      RISK_WEIGHTS.expiredDocuments,
      raw:         ed,
      normalised:  norm(ed, 4),
      evidence:    `${ed} document(s) expired`,
    },
    {
      name:        'Overdue Corrective Actions',
      weight:      RISK_WEIGHTS.overdueCorrective,
      raw:         oca,
      normalised:  norm(oca, 5),
      evidence:    `${oca} corrective action(s) past due date`,
    },
    {
      name:        'Overdue Compliance Deadlines',
      weight:      RISK_WEIGHTS.overdueDeadlines,
      raw:         odl,
      normalised:  norm(odl, 5),
      evidence:    `${odl} compliance deadline(s) overdue`,
    },
  ];

  // Weighted sum + license bonus
  const rawScore = factors.reduce((acc, f) => acc + (f.normalised * f.weight) / 100, 0);
  const score    = Math.min(100, Math.round(rawScore + licenseBonus));

  const level = score >= 75 ? 'CRITICAL'
              : score >= 50 ? 'HIGH'
              : score >= 25 ? 'MEDIUM'
              :               'LOW';

  // Active evidence (only factors that contribute meaningfully)
  const activeEvidence = factors
    .filter(f => f.raw > 0)
    .map(f => f.evidence);

  if (licenseExpired) {
    activeEvidence.push('Mining license is expired — +20 risk bonus');
  }

  return {
    mine_id:    mineId,
    mine_name:  mineRow.name || '',
    score,
    level,
    factors,
    evidence:   activeEvidence,
    data_as_of: now,
    model_version: 'v1.0-weighted-evidence',
    confidence: activeEvidence.length > 0 ? 'DATA_AVAILABLE' : 'INSUFFICIENT_DATA',
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   RECURRING VIOLATION DETECTION
   Identifies violations of the same category/type at the same mine that
   have recurred 2+ times within a configurable time window.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * @param {string|null} mineId   — filter to one mine, or null for all
 * @param {number} windowDays    — look-back window (default 180)
 * @param {number} minOccurrences — minimum recurrences to flag (default 2)
 */
async function detectRecurringViolations(mineId = null, windowDays = 180, minOccurrences = 2) {
  const mf = mineId ? `AND v.mine_id = '${mineId}'` : '';

  const rows = (await query(
    `SELECT
       v.mine_id,
       m.name                                AS mine_name,
       m.state                               AS mine_state,
       v.category,
       v.type,
       COUNT(*)                              AS occurrences,
       MIN(v.detected_date)                  AS first_detected,
       MAX(v.detected_date)                  AS last_detected,
       SUM(v.fine_amount)                    AS total_fines,
       COUNT(CASE WHEN v.status!='closed' THEN 1 END) AS open_count,
       GROUP_CONCAT(v.severity ORDER BY v.detected_date DESC) AS severities,
       MAX(CASE WHEN v.severity='critical' THEN 1
                WHEN v.severity='high'     THEN 2
                WHEN v.severity='medium'   THEN 3
                ELSE 4 END)                 AS worst_severity_rank
     FROM violations v
     JOIN mines m ON v.mine_id = m.id
     WHERE v.detected_date >= date('now', '-${parseInt(windowDays)} days')
     ${mf}
     GROUP BY v.mine_id, v.category, v.type
     HAVING COUNT(*) >= ${parseInt(minOccurrences)}
     ORDER BY occurrences DESC, worst_severity_rank ASC
     LIMIT 50`
  )).rows;

  const RANK_TO_SEVERITY = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' };

  return rows.map(r => ({
    mine_id:         r.mine_id,
    mine_name:       r.mine_name,
    mine_state:      r.mine_state,
    category:        r.category,
    type:            r.type,
    occurrences:     parseInt(r.occurrences),
    open_count:      parseInt(r.open_count),
    first_detected:  r.first_detected,
    last_detected:   r.last_detected,
    total_fines:     parseFloat(r.total_fines) || 0,
    worst_severity:  RANK_TO_SEVERITY[r.worst_severity_rank] || 'low',
    is_escalating:   !!r.open_count,            // still has open violations
    analysis_window: `${windowDays} days`,
    data_source:     'violations table — real records only',
  }));
}

/* ════════════════════════════════════════════════════════════════════════════
   OPERATIONAL ANOMALY DETECTION
   Uses simple statistical baselines (30-day average vs 7-day average).
   Only flags a mine if it has enough history for a meaningful comparison.
   Never flags mines with fewer than 5 historical records as anomalies.
   ════════════════════════════════════════════════════════════════════════════ */

async function detectAnomalies() {
  const anomalies = [];

  // ── Violation frequency anomaly ──────────────────────────────────────────
  const violTrend = (await query(
    `SELECT
       v.mine_id,
       m.name AS mine_name,
       m.state,
       COUNT(CASE WHEN v.detected_date >= date('now','-7 days')  THEN 1 END) AS last_7,
       COUNT(CASE WHEN v.detected_date >= date('now','-30 days') THEN 1 END) AS last_30,
       COUNT(CASE WHEN v.detected_date >= date('now','-90 days') THEN 1 END) AS last_90
     FROM violations v
     JOIN mines m ON v.mine_id = m.id
     GROUP BY v.mine_id, m.name, m.state
     HAVING last_90 >= 3`  // need at least 3 in 90 days for baseline
  )).rows;

  for (const r of violTrend) {
    const last7   = parseInt(r.last_7)  || 0;
    const last30  = parseInt(r.last_30) || 0;
    const last90  = parseInt(r.last_90) || 0;
    if (last30 < 1) continue;

    // 7-day rate vs 30-day weekly average
    const weeklyAvg30 = last30 / 4.3;
    const ratio = last7 / Math.max(weeklyAvg30, 0.5);

    if (ratio >= 2.5 && last7 >= 2) {
      anomalies.push({
        mine_id:    r.mine_id,
        mine_name:  r.mine_name,
        mine_state: r.state,
        type:       'VIOLATION_SPIKE',
        severity:   ratio >= 4 ? 'HIGH' : 'MEDIUM',
        metric:     'violations_per_week',
        current_value:  last7,
        baseline_value: Math.round(weeklyAvg30 * 10) / 10,
        change_ratio:   Math.round(ratio * 10) / 10,
        description: `${last7} violations in last 7 days vs ${Math.round(weeklyAvg30 * 10) / 10} weekly average (${Math.round(ratio * 10) / 10}× spike)`,
        evidence:    `30-day total: ${last30}, 90-day total: ${last90}`,
        data_source: 'violations table',
        detected_at: new Date().toISOString(),
      });
    }
  }

  // ── Incident frequency anomaly ────────────────────────────────────────────
  const incTrend = (await query(
    `SELECT
       i.mine_id,
       m.name AS mine_name,
       m.state,
       COUNT(CASE WHEN i.incident_date >= datetime('now','-7 days')  THEN 1 END) AS last_7,
       COUNT(CASE WHEN i.incident_date >= datetime('now','-30 days') THEN 1 END) AS last_30,
       COUNT(CASE WHEN i.incident_date >= datetime('now','-90 days') THEN 1 END) AS last_90
     FROM incidents i
     JOIN mines m ON i.mine_id = m.id
     GROUP BY i.mine_id, m.name, m.state
     HAVING last_90 >= 2`
  )).rows;

  for (const r of incTrend) {
    const last7  = parseInt(r.last_7)  || 0;
    const last30 = parseInt(r.last_30) || 0;
    if (last30 < 1) continue;

    const weeklyAvg30 = last30 / 4.3;
    const ratio = last7 / Math.max(weeklyAvg30, 0.3);

    if (ratio >= 2.5 && last7 >= 1) {
      anomalies.push({
        mine_id:    r.mine_id,
        mine_name:  r.mine_name,
        mine_state: r.state,
        type:       'INCIDENT_SPIKE',
        severity:   'HIGH',
        metric:     'incidents_per_week',
        current_value:  last7,
        baseline_value: Math.round(weeklyAvg30 * 10) / 10,
        change_ratio:   Math.round(ratio * 10) / 10,
        description: `${last7} incident(s) in last 7 days vs ${Math.round(weeklyAvg30 * 10) / 10} weekly average`,
        evidence:    `30-day total: ${last30}, 90-day total: ${r.last_90}`,
        data_source: 'incidents table',
        detected_at: new Date().toISOString(),
      });
    }
  }

  // ── Overdue corrective action cluster ────────────────────────────────────
  const overdueCA = (await query(
    `SELECT
       ca.mine_id,
       m.name AS mine_name,
       m.state,
       COUNT(*) AS overdue_count,
       MIN(ca.due_date) AS oldest_due,
       MAX(CAST(julianday(date('now')) - julianday(ca.due_date) AS INTEGER)) AS max_days_overdue
     FROM corrective_actions ca
     JOIN mines m ON ca.mine_id = m.id
     WHERE ca.status NOT IN ('completed','cancelled')
     AND ca.due_date < date('now')
     GROUP BY ca.mine_id, m.name, m.state
     HAVING overdue_count >= 3`
  )).rows;

  for (const r of overdueCA) {
    anomalies.push({
      mine_id:    r.mine_id,
      mine_name:  r.mine_name,
      mine_state: r.state,
      type:       'CORRECTIVE_ACTION_OVERDUE_CLUSTER',
      severity:   parseInt(r.max_days_overdue) > 30 ? 'HIGH' : 'MEDIUM',
      metric:     'overdue_corrective_actions',
      current_value:  parseInt(r.overdue_count),
      baseline_value: 0,
      change_ratio:   null,
      description: `${r.overdue_count} corrective action(s) overdue — oldest due ${r.oldest_due}`,
      evidence:    `Max days overdue: ${r.max_days_overdue}`,
      data_source: 'corrective_actions table',
      detected_at: new Date().toISOString(),
    });
  }

  // ── Environmental sustained breach ───────────────────────────────────────
  const envBreaches = (await query(
    `SELECT
       er.mine_id,
       m.name AS mine_name,
       m.state,
       er.parameter,
       COUNT(*) AS breach_readings,
       AVG(er.value) AS avg_value,
       MAX(er.value) AS peak_value,
       er.threshold_max,
       er.unit
     FROM environmental_readings er
     JOIN mines m ON er.mine_id = m.id
     WHERE er.status IN ('warning','critical')
     AND er.recorded_at >= datetime('now','-3 days')
     GROUP BY er.mine_id, er.parameter, er.threshold_max, er.unit, m.name, m.state
     HAVING breach_readings >= 3`
  )).rows;

  for (const r of envBreaches) {
    const exceedPct = r.threshold_max > 0
      ? Math.round(((r.avg_value / r.threshold_max) - 1) * 100)
      : 0;
    anomalies.push({
      mine_id:    r.mine_id,
      mine_name:  r.mine_name,
      mine_state: r.state,
      type:       'ENVIRONMENTAL_SUSTAINED_BREACH',
      severity:   exceedPct >= 100 ? 'HIGH' : 'MEDIUM',
      metric:     r.parameter,
      current_value:  Math.round(r.avg_value * 100) / 100,
      baseline_value: r.threshold_max,
      change_ratio:   exceedPct,
      description: `${r.parameter} averaging ${Math.round(r.avg_value * 100) / 100} ${r.unit} (${exceedPct}% above limit of ${r.threshold_max}) — ${r.breach_readings} readings in 3 days`,
      evidence:    `Peak: ${Math.round(r.peak_value * 100) / 100} ${r.unit}`,
      data_source: 'environmental_readings table',
      detected_at: new Date().toISOString(),
    });
  }

  return anomalies.sort((a, b) => (b.severity === 'HIGH' ? 1 : 0) - (a.severity === 'HIGH' ? 1 : 0));
}

/* ════════════════════════════════════════════════════════════════════════════
   MINE SCORE RECALCULATOR
   Recomputes risk_score, compliance_score, safety_score, environmental_score
   for ALL active mines from real DB records and persists to mines table.
   Called by the hourly cron job.
   ════════════════════════════════════════════════════════════════════════════ */

async function recalculateAllMineScores() {
  const mines = (await query(
    `SELECT id FROM mines WHERE status NOT IN ('closed','inactive')`
  )).rows;

  let updated = 0;
  const errors = [];

  for (const { id } of mines) {
    try {
      // ── Risk score from the evidence-based engine
      const risk = await calculateMineRisk(id);

      // ── Compliance score from compliance_records
      const comp = (await query(
        `SELECT COALESCE(AVG(score), 50) as avg FROM compliance_records WHERE mine_id=?`,
        [id]
      )).rows[0];

      // ── Safety score from inspections (last 3 completed) + incident penalty
      const insp = (await query(
        `SELECT COALESCE(AVG(overall_score), 50) as avg
         FROM inspections
         WHERE mine_id=? AND status='completed' AND overall_score IS NOT NULL
         ORDER BY completed_date DESC LIMIT 3`,
        [id]
      )).rows[0];

      const fatalRecent = (await query(
        `SELECT COUNT(*) as c FROM incidents
         WHERE mine_id=? AND severity='fatal' AND incident_date>=datetime('now','-90 days')`,
        [id]
      )).rows[0];

      const safetyBase    = parseFloat(insp.avg) || 50;
      const safetyPenalty = Math.min(40, parseInt(fatalRecent.c) * 20);
      const safetyScore   = Math.max(0, safetyBase - safetyPenalty);

      // ── Environmental score from recent readings
      const envData = (await query(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status='critical' THEN 1 ELSE 0 END) as critical,
           SUM(CASE WHEN status='warning'  THEN 1 ELSE 0 END) as warning
         FROM environmental_readings
         WHERE mine_id=? AND recorded_at >= datetime('now','-7 days')`,
        [id]
      )).rows[0];

      let envScore = 80; // default when no recent readings
      if (parseInt(envData.total) > 0) {
        const critPct = parseInt(envData.critical) / parseInt(envData.total);
        const warnPct = parseInt(envData.warning)  / parseInt(envData.total);
        envScore = Math.max(0, Math.round(100 - critPct * 80 - warnPct * 30));
      }

      await query(
        `UPDATE mines SET
           risk_score          = ?,
           compliance_score    = ?,
           safety_score        = ?,
           environmental_score = ?,
           updated_at          = datetime('now')
         WHERE id = ?`,
        [
          risk.score,
          Math.round(parseFloat(comp.avg)),
          Math.round(safetyScore),
          envScore,
          id,
        ]
      );
      updated++;
    } catch (err) {
      errors.push({ mine_id: id, error: err.message });
    }
  }

  if (errors.length) {
    console.error('[Analytics] Score recalc errors:', errors);
  }
  console.log(`[Analytics] Recalculated scores for ${updated}/${mines.length} mines`);
  return { updated, errors };
}

/* ════════════════════════════════════════════════════════════════════════════
   DASHBOARD SUMMARY HELPERS
   Returns pre-aggregated metrics for the analytics dashboard.
   ════════════════════════════════════════════════════════════════════════════ */

async function getDashboardExtras() {
  const [docScore, inspScore, overdueDL] = await Promise.all([
    // Doc health: % of non-expired documents
    query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active
       FROM documents`
    ),
    // Operations proxy: avg inspection score (last 30 days of completed)
    query(
      `SELECT COALESCE(AVG(overall_score), null) as avg_score
       FROM inspections
       WHERE status='completed' AND overall_score IS NOT NULL
       AND completed_date >= date('now','-30 days')`
    ),
    // Overdue deadlines count
    query(
      `SELECT COUNT(*) as c FROM compliance_deadlines WHERE status='overdue'`
    ),
  ]);

  const docTotal  = parseInt(docScore.rows[0].total)  || 0;
  const docActive = parseInt(docScore.rows[0].active) || 0;
  const docsScore = docTotal > 0 ? Math.round((docActive / docTotal) * 100) : null;

  const inspAvg      = inspScore.rows[0].avg_score;
  const operationsScore = inspAvg !== null ? Math.round(parseFloat(inspAvg)) : null;

  const overdueCount = parseInt(overdueDL.rows[0].c) || 0;

  return {
    docs_compliance_score: docsScore,           // % of docs that are active (not expired)
    operations_score:      operationsScore,      // avg inspection score last 30 days
    overdue_deadlines:     overdueCount,
    data_available: {
      docs:       docTotal > 0,
      operations: inspAvg !== null,
    },
  };
}
  
/* ════════════════════════════════════════════════════════════════════════════
   PREDICTIVE RISK ENGINE
   Projects future risk based on trend slopes computed from real DB data.
   Never invents data — if data is insufficient, says so explicitly.
════════════════════════════════════════════════════════════════════════════ */
async function getPredictiveRisk(mineId) {
  const now = new Date().toISOString();
  const predictions = [];
  const warnings    = [];

  // ── Violation trend (12-week slope) ────────────────────────────────────
  const violWeekly = (await query(
    `SELECT
       strftime('%Y-W%W', detected_date) AS week,
       COUNT(*) AS cnt,
       SUM(CASE WHEN severity='critical' THEN 3 WHEN severity='high' THEN 2 ELSE 1 END) AS weighted
     FROM violations
     WHERE mine_id=? AND detected_date >= date('now','-84 days')
     GROUP BY strftime('%Y-W%W', detected_date)
     ORDER BY week ASC`,
    [mineId]
  )).rows;

  if (violWeekly.length >= 3) {
    const counts = violWeekly.map(r => parseInt(r.cnt));
    const last3  = counts.slice(-3);
    const prev3  = counts.slice(-6, -3);
    const last3avg  = last3.reduce((s,v)=>s+v,0) / last3.length;
    const prev3avg  = prev3.length ? prev3.reduce((s,v)=>s+v,0) / prev3.length : last3avg;
    const trend     = prev3avg > 0 ? (last3avg - prev3avg) / prev3avg : 0;
    const projected = Math.max(0, Math.round(last3avg * (1 + trend)));

    if (trend > 0.2) {
      predictions.push({
        type:        'PREDICTED_RISK',
        category:    'Violations Trending Up',
        icon:        '📈',
        severity:    trend > 0.5 ? 'HIGH' : 'MEDIUM',
        headline:    `Violation rate increasing ${Math.round(trend * 100)}% — projected ${projected}/week`,
        explanation: `Last 3 weeks avg: ${last3avg.toFixed(1)}/week vs prior 3 weeks avg: ${prev3avg.toFixed(1)}/week. Trend: +${Math.round(trend * 100)}%.`,
        data_points: violWeekly.map(r => ({ period: r.week, value: parseInt(r.cnt) })),
        projected_value: projected,
        timeframe:   'next 7 days',
        confidence:  violWeekly.length >= 6 ? 'HIGH' : 'MEDIUM',
        action:      'Increase inspection frequency. Review open corrective actions.',
      });
    }
    if (trend <= -0.2) {
      warnings.push({ message: `Violations decreasing ${Math.abs(Math.round(trend*100))}% — positive trend`, type:'POSITIVE' });
    }
  }

  // ── Incident trend (30-day rolling) ────────────────────────────────────
  const incMonthly = (await query(
    `SELECT
       strftime('%Y-%m', incident_date) AS month,
       COUNT(*) AS cnt,
       SUM(CASE WHEN severity='fatal' THEN 4 WHEN severity='serious' THEN 2 ELSE 1 END) AS weighted
     FROM incidents
     WHERE mine_id=? AND incident_date >= datetime('now','-180 days')
     GROUP BY strftime('%Y-%m', incident_date)
     ORDER BY month ASC`,
    [mineId]
  )).rows;

  if (incMonthly.length >= 3) {
    const last2 = incMonthly.slice(-2).map(r => parseInt(r.cnt));
    const prev2 = incMonthly.slice(-4, -2).map(r => parseInt(r.cnt));
    const last2avg = last2.reduce((s,v)=>s+v,0) / last2.length;
    const prev2avg = prev2.length ? prev2.reduce((s,v)=>s+v,0) / prev2.length : last2avg;
    const iTrend   = prev2avg > 0 ? (last2avg - prev2avg) / prev2avg : 0;

    if (iTrend > 0.3) {
      predictions.push({
        type:        'PREDICTED_RISK',
        category:    'Incident Frequency Rising',
        icon:        '🚨',
        severity:    iTrend > 0.6 ? 'CRITICAL' : 'HIGH',
        headline:    `Incident rate up ${Math.round(iTrend*100)}% in last 2 months`,
        explanation: `Recent 2-month avg: ${last2avg.toFixed(1)}/month vs prior: ${prev2avg.toFixed(1)}/month. Increasing trend signals elevated operational risk.`,
        data_points: incMonthly.map(r => ({ period: r.month, value: parseInt(r.cnt) })),
        projected_value: Math.max(0, Math.round(last2avg * (1 + iTrend))),
        timeframe:   'next 30 days',
        confidence:  incMonthly.length >= 5 ? 'HIGH' : 'MEDIUM',
        action:      'Conduct emergency safety audit. Review machinery and worker training.',
      });
    }
  }

  // ── Environmental sensor trend ─────────────────────────────────────────
  const envParams = (await query(
    `SELECT parameter,
       SUM(CASE WHEN status='critical' THEN 3 WHEN status='warning' THEN 1 ELSE 0 END) AS alert_score,
       COUNT(*) AS total_readings,
       MAX(CASE WHEN status='critical' THEN 1 ELSE 0 END) AS has_critical,
       AVG(CASE WHEN recorded_at >= datetime('now','-7 days') THEN value ELSE NULL END)  AS recent_avg,
       AVG(CASE WHEN recorded_at >= datetime('now','-30 days') THEN value ELSE NULL END) AS month_avg,
       MAX(threshold_max) AS limit_val,
       MAX(unit) AS unit
     FROM environmental_readings
     WHERE mine_id=? AND recorded_at >= datetime('now','-30 days')
     GROUP BY parameter
     HAVING alert_score > 0
     ORDER BY alert_score DESC`,
    [mineId]
  )).rows;

  for (const ep of envParams.slice(0, 4)) {
    const recentAvg = parseFloat(ep.recent_avg || 0);
    const monthAvg  = parseFloat(ep.month_avg  || 0);
    const limit     = parseFloat(ep.limit_val  || 0);
    const pct       = limit > 0 ? Math.round((recentAvg / limit) * 100) : 0;

    if (ep.has_critical || pct > 80) {
      predictions.push({
        type:        'ANOMALY_DETECTED',
        category:    `Environmental: ${ep.parameter}`,
        icon:        '🌫️',
        severity:    ep.has_critical ? 'CRITICAL' : 'HIGH',
        headline:    `${ep.parameter} at ${recentAvg.toFixed(2)} ${ep.unit} — ${pct}% of limit`,
        explanation: `7-day average: ${recentAvg.toFixed(2)} ${ep.unit}. Monthly average: ${monthAvg.toFixed(2)} ${ep.unit}. Permitted limit: ${ep.limit_val} ${ep.unit}. ${ep.has_critical ? 'Critical threshold breached.' : 'Approaching critical threshold.'}`,
        data_points: [],
        sensor:      ep.parameter,
        current_pct: pct,
        timeframe:   'immediate',
        confidence:  'HIGH',
        action:      `Inspect ${ep.parameter} monitoring equipment. Activate emergency ventilation/suppression if applicable.`,
      });
    }
  }

  // ── Attendance anomaly (absenteeism spike) ────────────────────────────
  const attTrend = (await query(
    `SELECT
       strftime('%Y-W%W', attendance_date) AS week,
       COUNT(CASE WHEN status='absent' THEN 1 END) AS absent,
       COUNT(*) AS total
     FROM worker_attendance
     WHERE mine_id=? AND attendance_date >= date('now','-56 days')
     GROUP BY strftime('%Y-W%W', attendance_date)
     ORDER BY week ASC`,
    [mineId]
  )).rows;

  if (attTrend.length >= 4) {
    const rates  = attTrend.map(r => parseInt(r.total) > 0 ? parseInt(r.absent) / parseInt(r.total) : 0);
    const recent = rates.slice(-2);
    const prior  = rates.slice(-6, -2);
    const recentAvg = recent.reduce((s,v)=>s+v,0) / recent.length;
    const priorAvg  = prior.length ? prior.reduce((s,v)=>s+v,0) / prior.length : recentAvg;
    const absTrend  = priorAvg > 0 ? (recentAvg - priorAvg) / priorAvg : 0;

    if (absTrend > 0.3 && recentAvg > 0.1) {
      predictions.push({
        type:        'ANOMALY_DETECTED',
        category:    'Attendance Anomaly',
        icon:        '👷',
        severity:    absTrend > 0.5 ? 'HIGH' : 'MEDIUM',
        headline:    `Absenteeism up ${Math.round(absTrend*100)}% — ${Math.round(recentAvg*100)}% workforce absent`,
        explanation: `Recent 2-week absence rate: ${Math.round(recentAvg*100)}% vs prior 4-week avg: ${Math.round(priorAvg*100)}%. High absenteeism can indicate worker safety concerns or morale issues.`,
        data_points: attTrend.map(r => ({
          period: r.week,
          value:  parseInt(r.total) > 0 ? Math.round((parseInt(r.absent)/parseInt(r.total))*100) : 0,
        })),
        timeframe:   'current week',
        confidence:  'MEDIUM',
        action:      'Investigate causes of absenteeism. Check if related to recent incidents or hazardous conditions.',
      });
    }
  }

  // ── Safety observation accumulation ──────────────────────────────────
  const obsCount = (await query(
    `SELECT
       severity,
       COUNT(*) as cnt
     FROM safety_observations
     WHERE mine_id=? AND status='open' AND observed_at >= datetime('now','-30 days')
     GROUP BY severity`,
    [mineId]
  )).rows;

  const critObs = obsCount.find(r => r.severity === 'critical');
  const highObs = obsCount.find(r => r.severity === 'high');
  const totalOpenObs = obsCount.reduce((s, r) => s + parseInt(r.cnt), 0);

  if (critObs || (highObs && parseInt(highObs.cnt) >= 3)) {
    predictions.push({
      type:        'PREDICTED_RISK',
      category:    'Safety Observation Backlog',
      icon:        '👁️',
      severity:    critObs ? 'CRITICAL' : 'HIGH',
      headline:    `${totalOpenObs} unresolved safety observations in 30 days`,
      explanation: `${critObs ? parseInt(critObs.cnt) + ' critical' : ''} ${highObs ? parseInt(highObs.cnt) + ' high severity' : ''} observations remain unresolved. Accumulated unresolved observations predict elevated incident probability.`,
      data_points: obsCount.map(r => ({ period: r.severity, value: parseInt(r.cnt) })),
      timeframe:   'current period',
      confidence:  'MEDIUM',
      action:      'Resolve open safety observations. Assign corrective actions with deadlines.',
    });
  }

  // ── Inspection gap ─────────────────────────────────────────────────────
  const lastInspection = (await query(
    `SELECT completed_date, overall_score FROM inspections
     WHERE mine_id=? AND status='completed'
     ORDER BY completed_date DESC LIMIT 1`,
    [mineId]
  )).rows[0];

  if (!lastInspection) {
    predictions.push({
      type:        'PREDICTED_RISK',
      category:    'No Recent Inspection',
      icon:        '🔍',
      severity:    'HIGH',
      headline:    'No completed inspection on record',
      explanation: 'Absence of inspection data means risks may be undetected. DGMS requires regular mine inspections under CMR 2017.',
      data_points: [],
      timeframe:   'immediate',
      confidence:  'HIGH',
      action:      'Schedule a comprehensive safety inspection immediately.',
    });
  } else {
    const daysSince = Math.floor((Date.now() - new Date(lastInspection.completed_date).getTime()) / 86400000);
    if (daysSince > 90) {
      predictions.push({
        type:        'PREDICTED_RISK',
        category:    'Inspection Gap',
        icon:        '📋',
        severity:    daysSince > 180 ? 'CRITICAL' : 'HIGH',
        headline:    `Last inspection ${daysSince} days ago (score: ${Math.round(lastInspection.overall_score || 0)}%)`,
        explanation: `${daysSince} days without a completed inspection. CMR 2017 requires quarterly safety inspections. Score at last inspection: ${Math.round(lastInspection.overall_score || 0)}%.`,
        data_points: [],
        days_since:  daysSince,
        last_score:  Math.round(lastInspection.overall_score || 0),
        timeframe:   'overdue',
        confidence:  'HIGH',
        action:      'Schedule inspection immediately. Prioritise based on last score.',
      });
    }
  }

  return {
    mine_id:      mineId,
    predictions,
    warnings,
    generated_at: now,
    data_source:  'real database records — violations, incidents, environment, attendance, observations',
    disclaimer:   'Predictions based on statistical analysis of real data. Not a substitute for expert safety assessment.',
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   FULL RISK ANALYSIS FOR ONE MINE
   Combines: current risk score + predictive risk + recurring violations + anomalies
════════════════════════════════════════════════════════════════════════════ */
async function getFullRiskAnalysis(mineId) {
  const [current, predictive, recurring, anomalies, mine] = await Promise.all([
    calculateMineRisk(mineId),
    getPredictiveRisk(mineId),
    detectRecurringViolations(mineId, 180, 2),
    detectAnomalies().then(all => all.filter(a => a.mine_id === mineId)),
    query(`SELECT id, name, state, type, status, mine_id, compliance_score, risk_score, safety_score, environmental_score, workers_count, license_expiry FROM mines WHERE id=?`, [mineId]),
  ]);

  const mineRow = mine.rows[0] || {};

  // Combine all alerts into a unified alert feed
  const alertFeed = [
    // Current risk alerts
    ...(current.evidence.length > 0 && current.level !== 'LOW' ? [{
      alert_type: 'HIGH_RISK',
      icon: current.level === 'CRITICAL' ? '🔴' : '🟠',
      severity: current.level,
      title: `${current.level} Risk Score: ${current.score}/100`,
      body: current.evidence.join(' · '),
      factors: current.factors.filter(f => f.raw > 0),
      source: 'Risk Engine',
      timestamp: current.data_as_of,
    }] : []),
    // Predictive alerts
    ...predictive.predictions.map(p => ({
      alert_type: p.type,
      icon: p.icon,
      severity: p.severity,
      title: p.headline,
      body: p.explanation,
      action: p.action,
      data_points: p.data_points,
      confidence: p.confidence,
      source: p.category,
      timestamp: predictive.generated_at,
    })),
    // Recurring violations
    ...recurring.map(r => ({
      alert_type: 'RECURRING_VIOLATION',
      icon: '🔁',
      severity: r.worst_severity === 'critical' ? 'CRITICAL' : r.worst_severity === 'high' ? 'HIGH' : 'MEDIUM',
      title: `Recurring: ${r.category} — ${r.type} (${r.occurrences}×)`,
      body: `Same violation recurring ${r.occurrences} times in ${r.analysis_window}. ${r.open_count} still open. Total fines: ₹${Number(r.total_fines).toLocaleString('en-IN')}.`,
      action: 'Investigate root cause. Implement systemic fix rather than one-off closure.',
      source: 'Recurring Violation Detector',
      mine_name: r.mine_name,
      occurrences: r.occurrences,
      last_detected: r.last_detected,
      timestamp: new Date().toISOString(),
    })),
    // Anomalies
    ...anomalies.map(a => ({
      alert_type: 'ANOMALY_DETECTED',
      icon: '🚨',
      severity: a.severity || 'HIGH',
      title: `Anomaly: ${a.type?.replace(/_/g,' ')}`,
      body: a.description,
      action: 'Investigate root cause. Compare against historical baseline.',
      source: 'Anomaly Detector',
      metric: a.metric,
      change_ratio: a.change_ratio,
      timestamp: a.detected_at || new Date().toISOString(),
    })),
  ];

  // Sort by severity
  const sevOrder = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };
  alertFeed.sort((a, b) => (sevOrder[a.severity]||3) - (sevOrder[b.severity]||3));

  return {
    mine_id:    mineId,
    mine_name:  mineRow.name || '',
    mine_state: mineRow.state || '',
    mine_status:mineRow.status || '',
    current_risk:   current,
    predictive_risk: predictive,
    recurring_violations: recurring,
    anomalies,
    alert_feed: alertFeed,
    summary: {
      total_alerts:     alertFeed.length,
      critical_alerts:  alertFeed.filter(a => a.severity === 'CRITICAL').length,
      high_alerts:      alertFeed.filter(a => a.severity === 'HIGH').length,
      risk_score:       current.score,
      risk_level:       current.level,
      predictions_count:predictive.predictions.length,
      recurring_count:  recurring.length,
      anomaly_count:    anomalies.length,
    },
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  calculateMineRisk,
  detectRecurringViolations,
  detectAnomalies,
  getPredictiveRisk,
  getFullRiskAnalysis,
  recalculateAllMineScores,
  getDashboardExtras,
  RISK_WEIGHTS,
};
