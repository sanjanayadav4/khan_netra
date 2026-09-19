'use strict';
const { query } = require('../config/database');
const { v4: uuid } = require('uuid');
const disasterService = require('../services/disasterService');

/* ── GET /disaster/alerts ──────────────────────────────────────────── */
exports.getAlerts = async (req, res, next) => {
  try {
    const { status, severity, alert_type, page = 1, limit = 30 } = req.query;
    const off = (page - 1) * limit;
    let c = [], p = [];
    if (status)     { c.push('status = ?');     p.push(status); }
    if (severity)   { c.push('severity = ?');   p.push(severity); }
    if (alert_type) { c.push('alert_type = ?'); p.push(alert_type); }
    const w     = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query(`SELECT COUNT(*) as n FROM disaster_alerts ${w}`, p)).rows[0].n;
    const rows  = (await query(
      `SELECT * FROM disaster_alerts ${w}
       ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                alert_time DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, off]
    )).rows.map(r => ({
      ...r,
      affected_mines: tryParse(r.affected_mines, []),
      raw_data:       tryParse(r.raw_data, {}),
    }));
    res.json({ success: true, data: rows, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

/* ── GET /disaster/active ──────────────────────────────────────────── */
exports.getActive = async (req, res, next) => {
  try {
    const rows = (await query(
      `SELECT * FROM disaster_alerts
       WHERE status = 'active'
       ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                alert_time DESC
       LIMIT 50`
    )).rows.map(r => ({
      ...r,
      affected_mines: tryParse(r.affected_mines, []),
      raw_data:       tryParse(r.raw_data, {}),
    }));

    // Stats summary
    const critical = rows.filter(r => r.severity === 'CRITICAL').length;
    const high     = rows.filter(r => r.severity === 'HIGH').length;
    const last_poll= (await query(`SELECT MAX(created_at) as t FROM disaster_alerts WHERE is_test=0`)).rows[0].t;

    res.json({
      success: true,
      data: rows,
      summary: { total: rows.length, critical, high, last_updated: last_poll || null },
    });
  } catch (err) { next(err); }
};

/* ── POST /disaster/acknowledge/:id ────────────────────────────────── */
exports.acknowledge = async (req, res, next) => {
  try {
    const { id } = req.params;
    const row = (await query('SELECT * FROM disaster_alerts WHERE id = ?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Alert not found' });
    await query(
      `UPDATE disaster_alerts SET status='acknowledged', acknowledged_by=?, acknowledged_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
      [req.user.id, id]
    );
    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address) VALUES (?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'ACKNOWLEDGE', 'disaster_alert', id, `Acknowledged: ${row.title}`, req.ip]
    );
    const updated = (await query('SELECT * FROM disaster_alerts WHERE id=?', [id])).rows[0];
    res.json({ success: true, data: { ...updated, affected_mines: tryParse(updated.affected_mines, []) } });
  } catch (err) { next(err); }
};

/* ── POST /disaster/resolve/:id ─────────────────────────────────────── */
exports.resolve = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resolution_notes } = req.body;
    const row = (await query('SELECT * FROM disaster_alerts WHERE id = ?', [id])).rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Alert not found' });
    await query(
      `UPDATE disaster_alerts SET status='resolved', resolved_by=?, resolved_at=datetime('now'), resolution_notes=?, updated_at=datetime('now') WHERE id=?`,
      [req.user.id, resolution_notes || 'Resolved by operator', id]
    );
    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address) VALUES (?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'RESOLVE', 'disaster_alert', id, `Resolved: ${row.title}`, req.ip]
    );
    res.json({ success: true, message: 'Alert resolved' });
  } catch (err) { next(err); }
};

/* ── POST /disaster/create  — manual alert by authorized officials ─── */
exports.createManual = async (req, res, next) => {
  try {
    const {
      alert_type, title, description, severity = 'HIGH',
      mine_id, zone, location_name,
      sensor_value, sensor_unit, threshold_val,
      latitude, longitude, affected_mines,
    } = req.body;

    if (!alert_type || !title || !severity)
      return res.status(400).json({ success: false, message: 'alert_type, title, severity are required' });

    const VALID_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (!VALID_SEVERITIES.includes(severity))
      return res.status(400).json({ success: false, message: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` });

    // Dedup guard — prevent duplicate active manual alerts for same mine+type within 1 hour
    if (mine_id) {
      const dupCheck = (await query(
        `SELECT id FROM disaster_alerts
         WHERE mine_id=? AND alert_type=? AND is_manual=1
         AND status='active' AND alert_time >= datetime('now','-1 hour')`,
        [mine_id, alert_type]
      )).rows[0];
      if (dupCheck) {
        return res.status(409).json({
          success: false,
          message: 'An active alert of this type for this mine was already created within the last hour.',
          existing_id: dupCheck.id,
        });
      }
    }

    const id = uuid();
    // Build affected_mines JSON
    let affectedMinesJson = '[]';
    if (mine_id) {
      const mine = (await query('SELECT id, name FROM mines WHERE id=?', [mine_id])).rows[0];
      if (mine) {
        affectedMinesJson = JSON.stringify([{ id: mine.id, name: mine.name, distance: 0 }]);
      }
    }
    if (affected_mines) {
      try { affectedMinesJson = JSON.stringify(typeof affected_mines === 'string' ? JSON.parse(affected_mines) : affected_mines); }
      catch {}
    }

    await query(
      `INSERT INTO disaster_alerts
         (id, alert_type, source, title, description, severity,
          latitude, longitude, location_name, affected_mines, status,
          is_test, is_manual, mine_id, zone,
          sensor_value, sensor_unit, threshold_val,
          created_by, alert_time, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,1,?,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))`,
      [
        id, alert_type, `Manual — ${req.user.full_name || req.user.email}`,
        title, description || null, severity,
        latitude  ? parseFloat(latitude)  : null,
        longitude ? parseFloat(longitude) : null,
        location_name || null, affectedMinesJson, 'active',
        mine_id || null, zone || null,
        sensor_value  ? parseFloat(sensor_value)  : null,
        sensor_unit   || null,
        threshold_val ? parseFloat(threshold_val) : null,
        req.user.id,
      ]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,mine_id,ip_address)
       VALUES (?,?,?,?,?,?,?,?)`,
      [uuid(), req.user.id, 'CREATE_MANUAL_ALERT', 'disaster_alert', id,
       `Manual alert: [${severity}] ${title}`, mine_id || null, req.ip]
    );

    // Notify admins + environment officers
    const recipients = (await query(
      `SELECT id FROM users WHERE role IN ('admin','government_officer','safety_officer','mine_manager') AND is_active=1`
    )).rows;
    for (const u of recipients) {
      await query(
        `INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority,created_at)
         VALUES (?,?,?,?,?,?,?,datetime('now'))`,
        [uuid(), u.id, mine_id || null,
         `🚨 ${severity} Alert: ${alert_type}`,
         `${title}${zone ? ' — Zone: '+zone : ''}`,
         'disaster', severity === 'CRITICAL' ? 'critical' : 'high']
      ).catch(() => {});
    }

    const row = (await query('SELECT * FROM disaster_alerts WHERE id=?', [id])).rows[0];
    res.status(201).json({
      success: true,
      message: 'Emergency alert created successfully',
      data: { ...row, affected_mines: tryParse(row.affected_mines, []) },
    });
  } catch (err) { next(err); }
};

/* ── POST /disaster/rule-engine — check env readings for threshold breaches ── */
exports.runRuleEngine = async (req, res, next) => {
  try {
    const RULES = [
      { param: 'CH4',   threshold: 0.5,  unit: '%',      type: 'Gas Leak',  title_tmpl: 'High Methane (CH₄) Level', severity: 'CRITICAL', desc: 'Methane concentration above safe threshold — risk of explosion.' },
      { param: 'CO',    threshold: 50,   unit: 'ppm',    type: 'Gas Leak',  title_tmpl: 'High Carbon Monoxide (CO)', severity: 'HIGH',     desc: 'Carbon monoxide above safe limit — risk of asphyxiation.' },
      { param: 'H2S',   threshold: 1,    unit: 'ppm',    type: 'Gas Leak',  title_tmpl: 'Hydrogen Sulphide Detected',severity: 'HIGH',     desc: 'H₂S above safe limit — toxic gas detected.' },
      { param: 'Noise', threshold: 90,   unit: 'dB(A)',  type: 'Machinery', title_tmpl: 'Excessive Noise Level',     severity: 'MEDIUM',   desc: 'Noise exceeds safe workplace limits.' },
    ];

    const mineId = req.query.mine_id || null;
    let triggered = 0;

    for (const rule of RULES) {
      // Get latest reading for this parameter
      const cond = mineId ? `AND mine_id='${mineId}'` : '';
      const latest = (await query(
        `SELECT er.*, m.name as mine_name, m.id as mine_id
         FROM environmental_readings er JOIN mines m ON er.mine_id=m.id
         WHERE er.parameter=? ${cond}
         AND er.recorded_at >= datetime('now','-2 hours')
         ORDER BY er.recorded_at DESC LIMIT 1`,
        [rule.param]
      )).rows[0];

      if (!latest || parseFloat(latest.value) <= rule.threshold) continue;

      // Dedup — don't create if active alert for same mine+type within 2h
      const dup = (await query(
        `SELECT id FROM disaster_alerts
         WHERE mine_id=? AND alert_type=? AND status='active'
         AND alert_time >= datetime('now','-2 hours')`,
        [latest.mine_id, rule.type]
      )).rows[0];
      if (dup) continue;

      const id       = uuid();
      const extId    = `rule-${rule.param}-${latest.mine_id}-${new Date().toISOString().slice(0,13)}`;
      const title    = `${rule.title_tmpl} — ${latest.mine_name}`;
      const affMines = JSON.stringify([{ id: latest.mine_id, name: latest.mine_name, distance: 0 }]);

      await query(
        `INSERT INTO disaster_alerts
           (id,alert_type,source,title,description,severity,location_name,affected_mines,
            status,is_test,is_manual,mine_id,sensor_value,sensor_unit,threshold_val,
            external_id,alert_time,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,datetime('now'),datetime('now'),datetime('now'))`,
        [id, rule.type, 'Environmental Sensor / Rule Engine', title, rule.desc, rule.severity,
         latest.location || null, affMines, 'active',
         latest.mine_id, parseFloat(latest.value), rule.unit, rule.threshold,
         extId]
      );
      triggered++;

      // Notify
      const recipients = (await query(
        `SELECT id FROM users WHERE role IN ('admin','government_officer','safety_officer') AND is_active=1`
      )).rows;
      for (const u of recipients) {
        await query(
          `INSERT INTO notifications (id,user_id,mine_id,title,message,type,priority,created_at)
           VALUES (?,?,?,?,?,?,?,datetime('now'))`,
          [uuid(), u.id, latest.mine_id,
           `🔴 ${rule.severity}: ${rule.title_tmpl}`,
           `${latest.parameter}: ${latest.value} ${rule.unit} at ${latest.mine_name} (limit: ${rule.threshold})`,
           'disaster', rule.severity === 'CRITICAL' ? 'critical' : 'high']
        ).catch(() => {});
      }
    }

    res.json({ success: true, message: `Rule engine ran — ${triggered} new alert(s) triggered`, triggered });
  } catch (err) { next(err); }
};

/* ── POST /disaster/test ─────────────────────────────────────────────── */
exports.createTest = async (req, res, next) => {
  try {
    const id = await disasterService.createTestAlert(req.user.id);
    res.status(201).json({ success: true, message: '[TEST] Emergency alert created', alert_id: id });
  } catch (err) { next(err); }
};

/* ── POST /disaster/poll (manual trigger) ──────────────────────────── */
exports.pollNow = async (req, res, next) => {
  try {
    const result = await disasterService.pollAllSources();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

/* ── GET /disaster/history ──────────────────────────────────────────── */
exports.getHistory = async (req, res, next) => {
  try {
    const { days = 7, page = 1, limit = 50 } = req.query;
    const safeDays = Math.max(1, Math.min(365, parseInt(days, 10) || 7));
    const off  = (page - 1) * limit;
    const total = (await query(
      `SELECT COUNT(*) as n FROM disaster_alerts WHERE alert_time >= datetime('now','-${safeDays} days')`
    )).rows[0].n;
    const rows = (await query(
      `SELECT da.*,
              u1.full_name as acknowledged_by_name,
              u2.full_name as resolved_by_name
       FROM disaster_alerts da
       LEFT JOIN users u1 ON da.acknowledged_by = u1.id
       LEFT JOIN users u2 ON da.resolved_by     = u2.id
       WHERE da.alert_time >= datetime('now','-${safeDays} days')
       ORDER BY da.alert_time DESC
       LIMIT ? OFFSET ?`,
      [limit, off]
    )).rows.map(r => ({ ...r, affected_mines: tryParse(r.affected_mines, []) }));
    res.json({ success: true, data: rows, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
};

/* ── GET /disaster/stats ──────────────────────────────────────────────── */
exports.getStats = async (req, res, next) => {
  try {
    const [bySeverity, byType, byStatus, trend] = await Promise.all([
      query(`SELECT severity, COUNT(*) as count FROM disaster_alerts WHERE is_test=0 GROUP BY severity`),
      query(`SELECT alert_type, COUNT(*) as count FROM disaster_alerts WHERE is_test=0 GROUP BY alert_type ORDER BY count DESC LIMIT 8`),
      query(`SELECT status, COUNT(*) as count FROM disaster_alerts WHERE is_test=0 GROUP BY status`),
      query(`SELECT strftime('%Y-%m-%d',alert_time) as day, COUNT(*) as count FROM disaster_alerts WHERE alert_time >= datetime('now','-30 days') AND is_test=0 GROUP BY day ORDER BY day`),
    ]);
    res.json({
      success: true,
      data: {
        by_severity: bySeverity.rows,
        by_type:     byType.rows,
        by_status:   byStatus.rows,
        trend:       trend.rows,
      },
    });
  } catch (err) { next(err); }
};

/* ── helper ─────────────────────────────────────────────────────────── */
function tryParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; }
  catch { return fallback; }
}
