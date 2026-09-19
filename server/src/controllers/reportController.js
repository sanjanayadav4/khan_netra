/**
 * KhanNetra — Report Controller  v2
 * Supports 8 report types, all from real DB data.
 * Endpoints:
 *   GET /reports/preview  — JSON data for report preview in UI
 *   GET /reports/pdf      — PDF download
 *   GET /reports/excel    — Excel download
 */
'use strict';

const { query } = require('../config/database');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const { v4: uuid } = require('uuid');

/* ── helpers ────────────────────────────────────────────────────── */
function dateRange(from_date, to_date, col = 'created_at') {
  const parts = [];
  if (from_date) parts.push(`${col} >= '${from_date}'`);
  if (to_date)   parts.push(`${col} <= '${to_date} 23:59:59'`);
  return parts.join(' AND ');
}
function andWhere(mine_id, mineCol = 'mine_id') {
  return mine_id ? `AND ${mineCol} = '${mine_id}'` : '';
}
function whereWhere(mine_id, mineCol = 'mine_id') {
  return mine_id ? `WHERE ${mineCol} = '${mine_id}'` : '';
}

/* ════════════════════════════════════════════════════════════════════
   DATA FETCHERS  — return structured JS objects, reused by preview+PDF
   ════════════════════════════════════════════════════════════════════ */
async function fetchDailyMineData({ mine_id, from_date, to_date }) {
  const dr = dateRange(from_date, to_date, 'm.created_at');
  const mf = mine_id ? `WHERE m.id='${mine_id}'` : '';
  const mines = (await query(
    `SELECT m.id, m.mine_id as code, m.name, m.state, m.district, m.type, m.status,
            m.compliance_score, m.risk_score, m.safety_score, m.environmental_score,
            m.workers_count, m.current_production_mt, m.production_capacity_mt,
            m.license_number, m.license_expiry,
            (SELECT COUNT(*) FROM violations v WHERE v.mine_id=m.id AND v.status!='closed') as open_violations,
            (SELECT COUNT(*) FROM incidents  i WHERE i.mine_id=m.id AND i.status!='closed') as open_incidents,
            (SELECT COUNT(*) FROM inspections ins WHERE ins.mine_id=m.id AND ins.status='scheduled') as pending_inspections,
            (SELECT COUNT(*) FROM environmental_readings er WHERE er.mine_id=m.id AND er.status IN ('warning','critical') AND er.recorded_at>=datetime('now','-7 days')) as env_alerts
     FROM mines m ${mf}
     ORDER BY m.compliance_score ASC`
  )).rows;

  const summary = {
    total: mines.length,
    operational: mines.filter(m => m.status === 'operational').length,
    avg_compliance: mines.length ? Math.round(mines.reduce((s,m)=>s+parseFloat(m.compliance_score||0),0)/mines.length) : 0,
    avg_risk: mines.length ? Math.round(mines.reduce((s,m)=>s+parseFloat(m.risk_score||0),0)/mines.length) : 0,
    critical_mines: mines.filter(m => parseFloat(m.risk_score||0) >= 70).length,
  };
  return { mines, summary };
}

async function fetchWeeklySafetyData({ mine_id, from_date, to_date }) {
  const mfA = andWhere(mine_id);
  const dr   = from_date || to_date ? `AND (${dateRange(from_date, to_date, 'incident_date')})` : `AND incident_date >= date('now','-7 days')`;

  const [incidents, violations, observations, inspections] = await Promise.all([
    query(`SELECT i.*, m.name as mine_name FROM incidents i JOIN mines m ON i.mine_id=m.id WHERE 1=1 ${mfA} ${dr.replace('incident_date','i.incident_date')} ORDER BY i.incident_date DESC LIMIT 100`),
    query(`SELECT v.*, m.name as mine_name FROM violations v JOIN mines m ON v.mine_id=m.id WHERE 1=1 ${mfA} AND v.status!='closed' ORDER BY v.detected_date DESC LIMIT 100`),
    query(`SELECT so.*, m.name as mine_name FROM safety_observations so JOIN mines m ON so.mine_id=m.id WHERE 1=1 ${mfA} ORDER BY so.observed_at DESC LIMIT 50`),
    query(`SELECT ins.*, m.name as mine_name FROM inspections ins JOIN mines m ON ins.mine_id=m.id WHERE ins.status='completed' ${mfA} AND ins.completed_date >= date('now','-7 days') ORDER BY ins.completed_date DESC LIMIT 30`),
  ]);

  const incRows = incidents.rows;
  return {
    incidents: incRows,
    violations: violations.rows,
    observations: observations.rows,
    inspections: inspections.rows,
    summary: {
      total_incidents: incRows.length,
      fatalities:  incRows.reduce((s,r)=>s+parseInt(r.fatalities_count||0),0),
      injuries:    incRows.reduce((s,r)=>s+parseInt(r.injuries_count||0),0),
      critical:    incRows.filter(r=>r.severity==='critical'||r.severity==='fatal').length,
      open_violations: violations.rows.length,
      completed_inspections: inspections.rows.length,
    },
  };
}

async function fetchMonthlyComplianceData({ mine_id, from_date, to_date }) {
  const mfA = andWhere(mine_id, 'cr.mine_id');
  const dr  = from_date || to_date ? `AND (${dateRange(from_date, to_date, 'cr.created_at')})` : `AND cr.created_at >= date('now','-30 days')`;

  const [records, byCategory, workflow, deadlines] = await Promise.all([
    query(`SELECT cr.*, m.name as mine_name FROM compliance_records cr JOIN mines m ON cr.mine_id=m.id WHERE 1=1 ${mfA} ORDER BY cr.status, cr.category LIMIT 200`),
    query(`SELECT category, COUNT(*) as total, AVG(score) as avg_score, SUM(CASE WHEN status='compliant' THEN 1 ELSE 0 END) as compliant FROM compliance_records cr WHERE 1=1 ${mfA} GROUP BY category`),
    query(`SELECT workflow_status, COUNT(*) as count FROM compliance_records cr WHERE 1=1 ${mfA} GROUP BY workflow_status`),
    query(`SELECT cd.*, m.name as mine_name FROM compliance_deadlines cd JOIN mines m ON cd.mine_id=m.id WHERE cd.status='overdue' ${andWhere(mine_id,'cd.mine_id')} ORDER BY cd.deadline_date ASC LIMIT 20`),
  ]);

  const wf = {};
  for (const r of workflow.rows) wf[r.workflow_status] = parseInt(r.count);
  return { records: records.rows, by_category: byCategory.rows, workflow: wf, overdue_deadlines: deadlines.rows };
}

async function fetchInspectionReportData({ mine_id, from_date, to_date }) {
  const mfA = andWhere(mine_id, 'ins.mine_id');
  const dr  = from_date || to_date ? `AND (${dateRange(from_date, to_date, 'ins.completed_date')})` : `AND ins.completed_date >= date('now','-30 days')`;

  const [inspections, stats, byType] = await Promise.all([
    query(`SELECT ins.*, m.name as mine_name, u.full_name as inspector_name FROM inspections ins JOIN mines m ON ins.mine_id=m.id LEFT JOIN users u ON ins.inspector_id=u.id WHERE 1=1 ${mfA} ${dr} ORDER BY ins.completed_date DESC LIMIT 100`),
    query(`SELECT COUNT(*) as total, AVG(overall_score) as avg_score, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN risk_level='HIGH' OR risk_level='CRITICAL' THEN 1 ELSE 0 END) as high_risk FROM inspections ins WHERE 1=1 ${mfA}`),
    query(`SELECT type, COUNT(*) as count, AVG(overall_score) as avg_score FROM inspections ins WHERE 1=1 ${mfA} GROUP BY type`),
  ]);

  return { inspections: inspections.rows, stats: stats.rows[0], by_type: byType.rows };
}

async function fetchIncidentReportData({ mine_id, from_date, to_date }) {
  const mfA = andWhere(mine_id, 'i.mine_id');
  const dr  = from_date || to_date ? `AND (${dateRange(from_date, to_date, 'i.incident_date')})` : `AND i.incident_date >= date('now','-30 days')`;

  const [incidents, bySeverity, byType, corrective] = await Promise.all([
    query(`SELECT i.*, m.name as mine_name, u.full_name as reported_by_name FROM incidents i JOIN mines m ON i.mine_id=m.id LEFT JOIN users u ON i.reported_by=u.id WHERE 1=1 ${mfA} ${dr} ORDER BY i.incident_date DESC LIMIT 200`),
    query(`SELECT severity, COUNT(*) as count, SUM(injuries_count) as injuries, SUM(fatalities_count) as fatalities FROM incidents i WHERE 1=1 ${mfA} GROUP BY severity`),
    query(`SELECT type, COUNT(*) as count FROM incidents i WHERE 1=1 ${mfA} GROUP BY type ORDER BY count DESC`),
    query(`SELECT ca.*, i.incident_number FROM corrective_actions ca JOIN incidents i ON ca.mine_id=i.mine_id WHERE ca.status!='completed' ${andWhere(mine_id,'ca.mine_id')} LIMIT 50`),
  ]);

  const rows = incidents.rows;
  return {
    incidents: rows,
    by_severity: bySeverity.rows,
    by_type: byType.rows,
    corrective_actions: corrective.rows,
    summary: {
      total: rows.length,
      fatalities: rows.reduce((s,r)=>s+parseInt(r.fatalities_count||0),0),
      injuries:   rows.reduce((s,r)=>s+parseInt(r.injuries_count||0),0),
      dgms_notified: rows.filter(r=>r.dgms_notified).length,
    },
  };
}

async function fetchEnvironmentalReportData({ mine_id, from_date, to_date }) {
  const mfA = andWhere(mine_id, 'er.mine_id');
  const dr  = from_date || to_date ? `AND (${dateRange(from_date, to_date, 'er.recorded_at')})` : `AND er.recorded_at >= datetime('now','-30 days')`;

  const [readings, alerts, byParam, byStatus] = await Promise.all([
    query(`SELECT er.*, m.name as mine_name FROM environmental_readings er JOIN mines m ON er.mine_id=m.id WHERE 1=1 ${mfA} ${dr} ORDER BY er.recorded_at DESC LIMIT 200`),
    query(`SELECT er.*, m.name as mine_name FROM environmental_readings er JOIN mines m ON er.mine_id=m.id WHERE er.status IN ('warning','critical') ${mfA} ${dr} ORDER BY er.recorded_at DESC LIMIT 50`),
    query(`SELECT parameter, COUNT(*) as total, AVG(value) as avg_val, MAX(value) as max_val, SUM(CASE WHEN status IN ('warning','critical') THEN 1 ELSE 0 END) as exceedances FROM environmental_readings er WHERE 1=1 ${mfA} GROUP BY parameter`),
    query(`SELECT status, COUNT(*) as count FROM environmental_readings er WHERE 1=1 ${mfA} GROUP BY status`),
  ]);

  return { readings: readings.rows, alerts: alerts.rows, by_parameter: byParam.rows, by_status: byStatus.rows };
}

async function fetchContractorReportData({ mine_id, from_date, to_date }) {
  const mfW = whereWhere(mine_id, 'c.mine_id');
  const contractors = (await query(
    `SELECT c.*, m.name as mine_name,
       (SELECT COUNT(*) FROM workers w WHERE w.contractor_id=c.id AND w.status='active') as active_workers
     FROM contractors c JOIN mines m ON c.mine_id=m.id ${mfW}
     ORDER BY c.compliance_score ASC`
  )).rows;

  const summary = {
    total: contractors.length,
    active: contractors.filter(c=>c.status==='active').length,
    avg_compliance: contractors.length ? Math.round(contractors.reduce((s,c)=>s+parseFloat(c.compliance_score||0),0)/contractors.length) : 0,
    low_compliance: contractors.filter(c=>parseFloat(c.compliance_score||0)<60).length,
    expiring_30d: contractors.filter(c=>{ if(!c.contract_end) return false; const d=Math.ceil((new Date(c.contract_end)-new Date())/86400000); return d>=0&&d<=30; }).length,
  };
  return { contractors, summary };
}

async function fetchRiskReportData({ mine_id, from_date, to_date }) {
  const mfA = andWhere(mine_id, 'm.id');
  const [mines, highViol, envAlerts, incidents] = await Promise.all([
    query(`SELECT m.id, m.name, m.state, m.risk_score, m.compliance_score, m.safety_score, m.environmental_score FROM mines m WHERE 1=1 ${mfA} ORDER BY m.risk_score DESC`),
    query(`SELECT v.category, COUNT(*) as count, m.name as mine_name FROM violations v JOIN mines m ON v.mine_id=m.id WHERE v.severity IN ('critical','high') AND v.status!='closed' ${andWhere(mine_id,'v.mine_id')} GROUP BY v.category, v.mine_id ORDER BY count DESC LIMIT 20`),
    query(`SELECT er.parameter, er.value, er.unit, er.status, m.name as mine_name FROM environmental_readings er JOIN mines m ON er.mine_id=m.id WHERE er.status='critical' ${andWhere(mine_id,'er.mine_id')} AND er.recorded_at>=datetime('now','-7 days') LIMIT 30`),
    query(`SELECT COUNT(*) as c, SUM(injuries_count) as inj FROM incidents i WHERE i.incident_date>=date('now','-30 days') ${andWhere(mine_id,'i.mine_id')}`),
  ]);

  return {
    mines: mines.rows,
    high_violations: highViol.rows,
    env_alerts: envAlerts.rows,
    incident_summary: incidents.rows[0],
  };
}

/* ── Report data dispatcher ─────────────────────────────────────── */
async function getReportData(type, params) {
  switch (type) {
    case 'daily_mine':        return fetchDailyMineData(params);
    case 'weekly_safety':     return fetchWeeklySafetyData(params);
    case 'monthly_compliance':return fetchMonthlyComplianceData(params);
    case 'inspection':        return fetchInspectionReportData(params);
    case 'incident':          return fetchIncidentReportData(params);
    case 'environmental':     return fetchEnvironmentalReportData(params);
    case 'contractor':        return fetchContractorReportData(params);
    case 'risk':              return fetchRiskReportData(params);
    // Legacy aliases
    case 'compliance':        return fetchMonthlyComplianceData(params);
    case 'violations':        return fetchWeeklySafetyData(params);
    case 'incidents':         return fetchIncidentReportData(params);
    case 'mine':              return fetchDailyMineData(params);
    default:                  return fetchDailyMineData(params);
  }
}

/* ════════════════════════════════════════════════════════════════════
   GET /reports/preview
   Returns JSON for the report preview panel
   ════════════════════════════════════════════════════════════════════ */
exports.getPreview = async (req, res, next) => {
  try {
    const { type = 'daily_mine', mine_id, from_date, to_date } = req.query;
    const data = await getReportData(type, { mine_id, from_date, to_date });

    // Get mine name if filtered
    let mine_name = null;
    if (mine_id) {
      const m = (await query('SELECT name FROM mines WHERE id=?', [mine_id])).rows[0];
      mine_name = m?.name || null;
    }

    res.json({
      success: true,
      data,
      meta: {
        type,
        mine_id:   mine_id || null,
        mine_name,
        from_date: from_date || null,
        to_date:   to_date   || null,
        generated_at: new Date().toISOString(),
        generated_by: req.user.full_name,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   PDF GENERATION  — shared header/footer helper
   ════════════════════════════════════════════════════════════════════ */
function pdfHeader(doc, title, user) {
  // Blue header bar
  doc.fillColor('#1e3a5f').rect(0, 0, doc.page.width, 80).fill();
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold').text('KhanNetra', 50, 20);
  doc.fontSize(8).font('Helvetica').text('AI-Based Smart Governance & Compliance Monitoring for Coal Mines', 50, 44);
  doc.text('DGMS | Ministry of Coal | Government of India', 50, 56);
  doc.y = 100;
  // Report title
  doc.fillColor('#1e3a5f').fontSize(14).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.fillColor('#666').fontSize(8).font('Helvetica')
    .text(`Generated: ${new Date().toLocaleDateString('en-IN',{dateStyle:'full'})} by ${user.full_name}`, { align:'center' });
  doc.moveDown(0.4);
  doc.strokeColor('#1e3a5f').lineWidth(1.5).moveTo(50,doc.y).lineTo(545,doc.y).stroke();
  doc.moveDown(0.5);
}

function pdfFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fillColor('#aaa').fontSize(7)
      .text(`Page ${i+1} of ${range.count}  |  KhanNetra – Confidential Government Document  |  DGMS`,
        50, doc.page.height - 28, { align:'center' });
  }
}

function pdfSection(doc, title) {
  doc.fillColor('#1e3a5f').fontSize(11).font('Helvetica-Bold').text(title);
  doc.moveDown(0.3);
}

function pdfRow(doc, label, value, color = '#333') {
  doc.fillColor('#555').fontSize(8).font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.fillColor(color).font('Helvetica').text(String(value ?? '—'));
}

/* ════════════════════════════════════════════════════════════════════
   GET /reports/pdf
   ════════════════════════════════════════════════════════════════════ */
exports.generatePDF = async (req, res, next) => {
  try {
    const { type = 'daily_mine', mine_id, from_date, to_date } = req.query;
    const data = await getReportData(type, { mine_id, from_date, to_date });

    const TITLES = {
      daily_mine: 'Daily Mine Status Report',
      weekly_safety: 'Weekly Safety Report',
      monthly_compliance: 'Monthly Compliance Report',
      inspection: 'Inspection Report',
      incident: 'Incident Report',
      environmental: 'Environmental Monitoring Report',
      contractor: 'Contractor Performance Report',
      risk: 'Risk Assessment Report',
      compliance: 'Compliance Report',
      violations: 'Violations Report',
      incidents: 'Incidents Report',
      mine: 'Mine Status Report',
    };

    const doc = new PDFDocument({ margin:50, size:'A4', bufferPages:true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=KhanNetra-${type}-${Date.now()}.pdf`);
    doc.pipe(res);

    pdfHeader(doc, TITLES[type] || 'KhanNetra Report', req.user);

    // ── Daily Mine Report ──
    if (['daily_mine','mine'].includes(type)) {
      const { mines, summary } = data;
      pdfSection(doc, 'Mine Overview');
      pdfRow(doc, 'Total Mines', summary.total);
      pdfRow(doc, 'Operational', summary.operational);
      pdfRow(doc, 'Avg Compliance', `${summary.avg_compliance}%`);
      pdfRow(doc, 'Avg Risk', `${summary.avg_risk}%`);
      doc.moveDown(0.5);
      for (const m of mines) {
        const c = parseFloat(m.compliance_score||0);
        doc.fillColor(c>=80?'#16a34a':c>=60?'#d97706':'#dc2626').fontSize(10).font('Helvetica-Bold').text(`${m.name} — ${m.state}`);
        doc.fillColor('#444').fontSize(8).font('Helvetica')
          .text(`  Status: ${m.status}  |  Compliance: ${c.toFixed(1)}%  |  Risk: ${parseFloat(m.risk_score||0).toFixed(1)}%  |  Workers: ${m.workers_count||0}`);
        if (m.open_violations > 0) doc.fillColor('#dc2626').text(`  ⚠ Open Violations: ${m.open_violations}  |  Open Incidents: ${m.open_incidents}`);
        doc.moveDown(0.3);
      }
      if (mines.length === 0) doc.fillColor('#666').text('No mines found for the selected filters.');
    }

    // ── Weekly Safety ──
    if (['weekly_safety','violations'].includes(type)) {
      const { incidents, violations, summary } = data;
      pdfSection(doc, 'Safety Summary');
      pdfRow(doc, 'Total Incidents', summary.total_incidents);
      pdfRow(doc, 'Fatalities', summary.fatalities, '#dc2626');
      pdfRow(doc, 'Injuries', summary.injuries, '#d97706');
      pdfRow(doc, 'Open Violations', summary.open_violations);
      doc.moveDown(0.5);
      if (incidents.length > 0) {
        pdfSection(doc, 'Incidents');
        for (const i of incidents.slice(0, 30)) {
          const col = i.severity==='fatal'?'#dc2626':i.severity==='serious'?'#d97706':'#333';
          doc.fillColor(col).fontSize(9).font('Helvetica-Bold').text(`${i.incident_number || '—'}  |  ${i.severity?.toUpperCase()}  |  ${i.type}`);
          doc.fillColor('#444').fontSize(8).font('Helvetica').text(`  Mine: ${i.mine_name}  |  Date: ${i.incident_date}  |  Injuries: ${i.injuries_count}  |  Fatalities: ${i.fatalities_count}`);
          doc.moveDown(0.25);
        }
      }
    }

    // ── Monthly Compliance ──
    if (['monthly_compliance','compliance'].includes(type)) {
      const { by_category, workflow, overdue_deadlines } = data;
      pdfSection(doc, 'Compliance by Category');
      for (const c of by_category) {
        const score = parseFloat(c.avg_score||0);
        doc.fillColor(score>=80?'#16a34a':score>=60?'#d97706':'#dc2626').fontSize(9).font('Helvetica-Bold').text(`${c.category}`);
        doc.fillColor('#444').fontSize(8).font('Helvetica').text(`  Records: ${c.total}  |  Avg Score: ${score.toFixed(1)}%  |  Compliant: ${c.compliant}`);
        doc.moveDown(0.25);
      }
      doc.moveDown(0.3);
      pdfSection(doc, 'Workflow Status');
      for (const [k, v] of Object.entries(workflow)) {
        pdfRow(doc, k.replace('_',' '), v);
      }
      if (overdue_deadlines.length > 0) {
        doc.moveDown(0.3);
        pdfSection(doc, `Overdue Deadlines (${overdue_deadlines.length})`);
        for (const d of overdue_deadlines.slice(0, 20)) {
          doc.fillColor('#dc2626').fontSize(8).font('Helvetica-Bold').text(`${d.mine_name} — ${d.title || d.description?.slice(0,60) || '—'}`);
          doc.fillColor('#444').font('Helvetica').text(`  Due: ${d.deadline_date}  |  Status: ${d.status}`);
          doc.moveDown(0.2);
        }
      }
    }

    // ── Inspection Report ──
    if (type === 'inspection') {
      const { inspections, stats, by_type } = data;
      pdfSection(doc, 'Inspection Summary');
      pdfRow(doc, 'Total', stats?.total || 0);
      pdfRow(doc, 'Completed', stats?.completed || 0);
      pdfRow(doc, 'Avg Score', `${parseFloat(stats?.avg_score||0).toFixed(1)}%`);
      pdfRow(doc, 'High Risk', stats?.high_risk || 0, '#dc2626');
      doc.moveDown(0.5);
      for (const ins of inspections.slice(0, 40)) {
        const score = parseFloat(ins.overall_score||0);
        doc.fillColor(score>=80?'#16a34a':score>=60?'#d97706':'#dc2626').fontSize(9).font('Helvetica-Bold')
          .text(`${ins.inspection_number}  |  ${ins.type}  |  Score: ${score.toFixed(0)}%`);
        doc.fillColor('#444').fontSize(8).font('Helvetica')
          .text(`  Mine: ${ins.mine_name}  |  Inspector: ${ins.inspector_name||'—'}  |  Date: ${ins.completed_date||ins.scheduled_date}`);
        if (ins.findings) doc.text(`  Findings: ${ins.findings.slice(0,100)}`);
        doc.moveDown(0.3);
      }
    }

    // ── Incident Report ──
    if (type === 'incident' || type === 'incidents') {
      const { incidents, by_severity, summary } = data;
      pdfSection(doc, 'Incident Summary');
      pdfRow(doc, 'Total Incidents', summary?.total || incidents.length);
      pdfRow(doc, 'Fatalities', summary?.fatalities || 0, '#dc2626');
      pdfRow(doc, 'Injuries',   summary?.injuries   || 0, '#d97706');
      doc.moveDown(0.5);
      for (const inc of (incidents||[]).slice(0, 50)) {
        const col = inc.severity==='fatal'?'#dc2626':inc.severity==='serious'?'#d97706':'#333';
        doc.fillColor(col).fontSize(9).font('Helvetica-Bold').text(`${inc.incident_number}  |  ${inc.severity?.toUpperCase()}`);
        doc.fillColor('#444').fontSize(8).font('Helvetica')
          .text(`  Mine: ${inc.mine_name}  |  Date: ${inc.incident_date}  |  Injuries: ${inc.injuries_count}  |  Fatalities: ${inc.fatalities_count}`);
        if (inc.description) doc.text(`  ${inc.description.slice(0,100)}`);
        doc.moveDown(0.3);
      }
    }

    // ── Environmental ──
    if (type === 'environmental') {
      const { alerts, by_parameter } = data;
      pdfSection(doc, 'Environmental Parameter Summary');
      for (const p of by_parameter) {
        const col = p.exceedances > 0 ? '#dc2626' : '#16a34a';
        doc.fillColor(col).fontSize(9).font('Helvetica-Bold').text(`${p.parameter}`);
        doc.fillColor('#444').fontSize(8).font('Helvetica')
          .text(`  Readings: ${p.total}  |  Avg: ${parseFloat(p.avg_val||0).toFixed(2)}  |  Max: ${parseFloat(p.max_val||0).toFixed(2)}  |  Exceedances: ${p.exceedances}`);
        doc.moveDown(0.25);
      }
      if (alerts.length > 0) {
        doc.moveDown(0.3);
        pdfSection(doc, `Active Alerts (${alerts.length})`);
        for (const a of alerts.slice(0, 30)) {
          doc.fillColor('#dc2626').fontSize(8).font('Helvetica-Bold').text(`${a.parameter}: ${a.value} ${a.unit} [${a.status?.toUpperCase()}]`);
          doc.fillColor('#444').font('Helvetica').text(`  Mine: ${a.mine_name}  |  Location: ${a.location||'—'}`);
          doc.moveDown(0.2);
        }
      }
    }

    // ── Contractor ──
    if (type === 'contractor') {
      const { contractors, summary } = data;
      pdfSection(doc, 'Contractor Summary');
      pdfRow(doc, 'Total', summary.total);
      pdfRow(doc, 'Active', summary.active);
      pdfRow(doc, 'Avg Compliance', `${summary.avg_compliance}%`);
      pdfRow(doc, 'Low Compliance (<60%)', summary.low_compliance, '#dc2626');
      pdfRow(doc, 'Expiring in 30 days', summary.expiring_30d, '#d97706');
      doc.moveDown(0.5);
      for (const c of contractors) {
        const comp = parseFloat(c.compliance_score||0);
        doc.fillColor(comp>=80?'#16a34a':comp>=60?'#d97706':'#dc2626').fontSize(9).font('Helvetica-Bold').text(`${c.name}`);
        doc.fillColor('#444').fontSize(8).font('Helvetica')
          .text(`  Mine: ${c.mine_name}  |  Compliance: ${comp.toFixed(0)}%  |  Safety: ${parseFloat(c.safety_score||0).toFixed(0)}%  |  Workers: ${c.active_workers||0}  |  Status: ${c.status}`);
        if (c.contract_end) doc.text(`  Contract ends: ${c.contract_end}`);
        doc.moveDown(0.3);
      }
    }

    // ── Risk ──
    if (type === 'risk') {
      const { mines, high_violations, env_alerts, incident_summary } = data;
      pdfSection(doc, 'Risk Profile by Mine');
      for (const m of mines) {
        const r = parseFloat(m.risk_score||0);
        doc.fillColor(r>=70?'#dc2626':r>=50?'#d97706':'#16a34a').fontSize(9).font('Helvetica-Bold').text(`${m.name} (${m.state}) — Risk: ${r.toFixed(1)}%`);
        doc.fillColor('#444').fontSize(8).font('Helvetica').text(`  Compliance: ${parseFloat(m.compliance_score||0).toFixed(1)}%  |  Safety: ${parseFloat(m.safety_score||0).toFixed(1)}%  |  Env: ${parseFloat(m.environmental_score||0).toFixed(1)}%`);
        doc.moveDown(0.3);
      }
      if (env_alerts.length > 0) {
        doc.moveDown(0.3);
        pdfSection(doc, 'Critical Environmental Alerts');
        for (const a of env_alerts.slice(0,15)) {
          doc.fillColor('#dc2626').fontSize(8).text(`${a.parameter}: ${a.value} ${a.unit} — ${a.mine_name}`);
          doc.moveDown(0.2);
        }
      }
    }

    pdfFooter(doc);
    doc.end();

    // Audit log
    query(`INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'REPORT_EXPORT', 'report', uuid(), `PDF report exported: ${type}`, mine_id||null, req.ip]
    ).catch(()=>{});
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════════════════════════════════
   GET /reports/excel
   ════════════════════════════════════════════════════════════════════ */
exports.generateExcel = async (req, res, next) => {
  try {
    const { type, mine_id, from_date, to_date } = req.query;
    const wb = XLSX.utils.book_new();

    const mfV  = mine_id ? `WHERE v.mine_id='${mine_id}'` : '';
    const mfI  = mine_id ? `WHERE i.mine_id='${mine_id}'` : '';
    const mfC  = mine_id ? `WHERE cr.mine_id='${mine_id}'` : '';
    const mfM  = mine_id ? `WHERE id='${mine_id}'` : '';
    const mfIn = mine_id ? `WHERE ins.mine_id='${mine_id}'` : '';
    const mfEr = mine_id ? `WHERE er.mine_id='${mine_id}'` : '';
    const mfCo = mine_id ? `WHERE c.mine_id='${mine_id}'` : '';
    const mfPr = mine_id ? `WHERE mine_id='${mine_id}'` : '';

    const include = (t) => !type || type === t || type === 'all';

    if (include('mines') || include('mine') || include('daily_mine')) {
      const rows = (await query(`SELECT mine_id,name,type,state,district,status,compliance_score,risk_score,safety_score,environmental_score,workers_count,current_production_mt,production_capacity_mt,license_number,license_expiry FROM mines ${mfM} ORDER BY state,name`)).rows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{note:'No data'}]), 'Mines');
    }
    if (include('violations') || include('weekly_safety')) {
      const rows = (await query(`SELECT v.violation_number,m.name as mine_name,v.type,v.severity,v.category,v.description,v.detected_date,v.status,v.fine_amount FROM violations v JOIN mines m ON v.mine_id=m.id ${mfV} ORDER BY v.detected_date DESC LIMIT 500`)).rows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{note:'No data'}]), 'Violations');
    }
    if (include('incidents') || include('incident') || include('weekly_safety')) {
      const rows = (await query(`SELECT i.incident_number,m.name as mine_name,i.type,i.severity,i.description,i.incident_date,i.injuries_count,i.fatalities_count,i.status FROM incidents i JOIN mines m ON i.mine_id=m.id ${mfI} ORDER BY i.incident_date DESC LIMIT 500`)).rows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{note:'No data'}]), 'Incidents');
    }
    if (include('compliance') || include('monthly_compliance')) {
      const rows = (await query(`SELECT m.name as mine_name,cr.category,cr.parameter_name,cr.required_value,cr.actual_value,cr.status,cr.score,cr.due_date,cr.workflow_status FROM compliance_records cr JOIN mines m ON cr.mine_id=m.id ${mfC} ORDER BY cr.status,cr.category LIMIT 500`)).rows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{note:'No data'}]), 'Compliance');
    }
    if (include('inspection')) {
      const rows = (await query(`SELECT ins.inspection_number,m.name as mine_name,ins.type,ins.status,ins.overall_score,ins.risk_level,ins.scheduled_date,ins.completed_date,ins.findings FROM inspections ins JOIN mines m ON ins.mine_id=m.id ${mfIn} ORDER BY ins.completed_date DESC LIMIT 500`)).rows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{note:'No data'}]), 'Inspections');
    }
    if (include('environmental')) {
      const rows = (await query(`SELECT m.name as mine_name,er.parameter,er.value,er.unit,er.status,er.reading_type,er.location,er.recorded_at FROM environmental_readings er JOIN mines m ON er.mine_id=m.id ${mfEr} ORDER BY er.recorded_at DESC LIMIT 500`)).rows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{note:'No data'}]), 'Environmental');
    }
    if (include('contractor')) {
      const rows = (await query(`SELECT c.name,m.name as mine_name,c.work_type,c.status,c.compliance_score,c.safety_score,c.workers_count,c.contract_start,c.contract_end FROM contractors c JOIN mines m ON c.mine_id=m.id ${mfCo} ORDER BY c.compliance_score ASC LIMIT 200`)).rows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{note:'No data'}]), 'Contractors');
    }
    if (include('production') || include('daily_mine')) {
      const rows = (await query(`SELECT mine_id,record_date,actual_tonnes,target_tonnes,achievement_pct,productivity_tph,workers_deployed,active_machines FROM production_records ${mfPr} ORDER BY record_date DESC LIMIT 500`)).rows;
      if (rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Production');
    }

    if (wb.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{note:'No data for selected filters'}]), 'Empty');
    }

    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=KhanNetra-${type||'Export'}-${Date.now()}.xlsx`);
    res.send(buf);

    query(`INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address) VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'REPORT_EXPORT', 'report', uuid(), `Excel report exported: ${type||'all'}`, mine_id||null, req.ip]
    ).catch(()=>{});
  } catch (err) { next(err); }
};
