/**
 * KhanNetra — Global Search Controller
 * GET /search?q=<query>&limit=<n>
 * Searches across 10 entities and returns categorised results.
 */
'use strict';

const { query } = require('../config/database');

exports.search = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 5, 10);

    if (!q || q.length < 2) {
      return res.json({ success: true, data: [], query: q });
    }

    const t   = `%${q}%`;
    const role = req.user.role;
    const mineId = req.user.mine_id;

    // Mine-scoped roles: restrict to their mine
    const mineFilter = (col) =>
      ['mine_manager','safety_officer','environment_officer','mining_engineer'].includes(role) && mineId
        ? `AND ${col} = '${mineId}'`
        : '';

    const results = [];

    // 1. Mines
    if (!['contractor'].includes(role)) {
      const mf = mineFilter('m.id');
      const rows = (await query(
        `SELECT id, name, state, district, type, status, compliance_score as score
         FROM mines m
         WHERE (name LIKE ? OR mine_id LIKE ? OR state LIKE ? OR district LIKE ?) ${mf}
         ORDER BY compliance_score ASC LIMIT ?`,
        [t, t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Mine', module: '/mines', icon: '⛏',
        name: r.name,
        subtitle: `${r.state}${r.district ? ', '+r.district : ''} · ${r.type}`,
        status: r.status,
        score: r.score,
        path: `/mines/${r.id}`,
      })));
    }

    // 2. Workers
    {
      const mf = mineFilter('w.mine_id');
      const rows = (await query(
        `SELECT w.id, w.full_name as name, w.worker_code, w.department, w.designation, w.status, m.name as mine_name
         FROM workers w JOIN mines m ON w.mine_id=m.id
         WHERE (w.full_name LIKE ? OR w.worker_code LIKE ? OR w.designation LIKE ? OR w.department LIKE ?) ${mf}
         LIMIT ?`,
        [t, t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Worker', module: '/workers', icon: '👷',
        name: r.name,
        subtitle: `${r.worker_code} · ${r.department} · ${r.mine_name}`,
        status: r.status,
        path: `/workers`,
      })));
    }

    // 3. Contractors
    {
      const mf = mineFilter('c.mine_id');
      const rows = (await query(
        `SELECT c.id, c.name, c.work_type, c.status, c.compliance_score, m.name as mine_name
         FROM contractors c JOIN mines m ON c.mine_id=m.id
         WHERE (c.name LIKE ? OR c.work_type LIKE ? OR c.registration_number LIKE ?) ${mf}
         LIMIT ?`,
        [t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Contractor', module: '/contractors', icon: '🏗',
        name: r.name,
        subtitle: `${r.work_type} · ${r.mine_name}`,
        status: r.status,
        path: `/contractors`,
      })));
    }

    // 4. Inspections
    {
      const mf = mineFilter('ins.mine_id');
      const rows = (await query(
        `SELECT ins.id, ins.inspection_number as name, ins.type, ins.status, ins.overall_score,
                ins.scheduled_date as date, m.name as mine_name
         FROM inspections ins JOIN mines m ON ins.mine_id=m.id
         WHERE (ins.inspection_number LIKE ? OR ins.findings LIKE ? OR ins.type LIKE ? OR m.name LIKE ?) ${mf}
         ORDER BY ins.scheduled_date DESC LIMIT ?`,
        [t, t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Inspection', module: '/inspections', icon: '📋',
        name: r.name,
        subtitle: `${r.type} · ${r.mine_name}`,
        status: r.status,
        date: r.date,
        path: `/inspections`,
      })));
    }

    // 5. Incidents
    {
      const mf = mineFilter('i.mine_id');
      const rows = (await query(
        `SELECT i.id, i.incident_number as name, i.type, i.severity, i.status,
                i.incident_date as date, m.name as mine_name
         FROM incidents i JOIN mines m ON i.mine_id=m.id
         WHERE (i.incident_number LIKE ? OR i.description LIKE ? OR i.type LIKE ? OR m.name LIKE ?) ${mf}
         ORDER BY i.incident_date DESC LIMIT ?`,
        [t, t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Incident', module: '/incidents', icon: '🚨',
        name: r.name,
        subtitle: `${r.severity?.toUpperCase()} · ${r.mine_name}`,
        status: r.status,
        date: r.date,
        path: `/incidents`,
      })));
    }

    // 6. Compliance Records
    {
      const mf = mineFilter('cr.mine_id');
      const rows = (await query(
        `SELECT cr.id, cr.parameter_name as name, cr.category, cr.status, cr.workflow_status,
                cr.due_date as date, m.name as mine_name
         FROM compliance_records cr JOIN mines m ON cr.mine_id=m.id
         WHERE (cr.parameter_name LIKE ? OR cr.category LIKE ? OR m.name LIKE ?) ${mf}
         ORDER BY cr.due_date ASC LIMIT ?`,
        [t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Compliance', module: '/compliance', icon: '✅',
        name: r.name,
        subtitle: `${r.category} · ${r.mine_name}`,
        status: r.status,
        date: r.date,
        path: `/compliance`,
      })));
    }

    // 7. Documents
    {
      const mf = mineFilter('d.mine_id');
      const rows = (await query(
        `SELECT d.id, d.title as name, d.type, d.status,
                d.expiry_date as date, m.name as mine_name
         FROM documents d JOIN mines m ON d.mine_id=m.id
         WHERE (d.title LIKE ? OR d.type LIKE ? OR d.document_number LIKE ? OR m.name LIKE ?) ${mf}
         ORDER BY d.created_at DESC LIMIT ?`,
        [t, t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Document', module: '/documents', icon: '📄',
        name: r.name,
        subtitle: `${r.type} · ${r.mine_name}`,
        status: r.status,
        date: r.date,
        path: `/documents`,
      })));
    }

    // 8. Violations
    {
      const mf = mineFilter('v.mine_id');
      const rows = (await query(
        `SELECT v.id, v.violation_number as name, v.category, v.severity, v.status,
                v.detected_date as date, m.name as mine_name
         FROM violations v JOIN mines m ON v.mine_id=m.id
         WHERE (v.violation_number LIKE ? OR v.description LIKE ? OR v.category LIKE ? OR m.name LIKE ?) ${mf}
         ORDER BY v.detected_date DESC LIMIT ?`,
        [t, t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Violation', module: '/violations', icon: '⚠️',
        name: r.name,
        subtitle: `${r.severity?.toUpperCase()} · ${r.mine_name}`,
        status: r.status,
        date: r.date,
        path: `/violations`,
      })));
    }

    // 9. Audit Logs (admin/gov only)
    if (['admin','government_officer','inspector'].includes(role)) {
      const rows = (await query(
        `SELECT al.id, al.action, al.entity_type, al.description,
                al.created_at as date, u.full_name as user_name
         FROM audit_logs al LEFT JOIN users u ON al.user_id=u.id
         WHERE (al.description LIKE ? OR al.entity_type LIKE ? OR u.full_name LIKE ?)
         ORDER BY al.created_at DESC LIMIT ?`,
        [t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Audit Log', module: '/audit', icon: '🔒',
        name: `${r.action} — ${r.entity_type}`,
        subtitle: r.description?.slice(0, 60) || r.user_name || '—',
        status: null,
        date: r.date,
        path: `/audit`,
      })));
    }

    // 10. Disaster Alerts
    {
      const rows = (await query(
        `SELECT id, title as name, alert_type, severity, status,
                alert_time as date, location_name
         FROM disaster_alerts
         WHERE (title LIKE ? OR alert_type LIKE ? OR location_name LIKE ?)
         ORDER BY alert_time DESC LIMIT ?`,
        [t, t, t, limit]
      )).rows;
      results.push(...rows.map(r => ({
        id: r.id, type: 'Alert', module: '/disaster', icon: '🚨',
        name: r.name,
        subtitle: `${r.alert_type} · ${r.location_name || '—'}`,
        status: r.status,
        date: r.date,
        path: `/disaster`,
      })));
    }

    // Sort: exact name matches first, then by type priority
    const TYPE_PRIORITY = ['Mine','Incident','Inspection','Violation','Compliance','Worker','Contractor','Document','Alert','Audit Log'];
    results.sort((a, b) => {
      const aExact = a.name?.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
      const bExact = b.name?.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return TYPE_PRIORITY.indexOf(a.type) - TYPE_PRIORITY.indexOf(b.type);
    });

    res.json({
      success: true,
      data:  results.slice(0, 40),
      query: q,
      total: results.length,
    });
  } catch (err) { next(err); }
};
