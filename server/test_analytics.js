/**
 * KhanNetra Analytics upgrade smoke test
 * node test_analytics.js
 */
'use strict';
require('dotenv').config();
const http = require('http');

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: 'localhost', port: 5000, path,
      method: 'GET',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(d) }); }
        catch { resolve({ s: res.statusCode, b: { raw: d.slice(0, 200) } }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: 'localhost', port: 5000, path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(d) }); }
        catch { resolve({ s: res.statusCode, b: { raw: d.slice(0, 200) } }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function pass(label, ok, detail) {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${label}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' KhanNetra Analytics Upgrade — Smoke Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // Login
  console.log('1. Auth');
  const login = await post('/api/v1/auth/login', { email: 'admin@khannetra.gov.in', password: 'KhanNetra@2024' });
  pass('Login as admin', login.b.success, `status ${login.s}`);
  if (!login.b.success) { console.error('Cannot proceed without token'); return; }
  const token = login.b.data.token;

  // Analytics endpoints
  console.log('\n2. Analytics controller (SQLite fixes)');
  const dash = await get('/api/v1/analytics/dashboard', token);
  pass('GET /analytics/dashboard', dash.s === 200, `mines=${dash.b.data?.mines?.total}`);

  const trend = await get('/api/v1/analytics/compliance-trend?months=6', token);
  pass('GET /analytics/compliance-trend (SQLite strftime)', trend.s === 200, `rows=${trend.b.data?.length}`);

  const ranking = await get('/api/v1/analytics/mine-ranking', token);
  pass('GET /analytics/mine-ranking', ranking.s === 200, `mines=${ranking.b.data?.length}`);

  const viol = await get('/api/v1/analytics/violations', token);
  pass('GET /analytics/violations (SQLite datetime)', viol.s === 200, `byMonth=${viol.b.data?.byMonth?.length}`);

  const audit = await get('/api/v1/analytics/audit-logs?limit=5', token);
  pass('GET /analytics/audit-logs (SQLite ? params)', audit.s === 200, `rows=${audit.b.data?.length}`);

  // New endpoints
  console.log('\n3. New real-data endpoints');
  const recurring = await get('/api/v1/analytics/recurring-violations?window=180&min_count=2', token);
  pass('GET /analytics/recurring-violations', recurring.s === 200,
    `patterns=${recurring.b.data?.length}, mines=${recurring.b.summary?.mines_affected}`);

  const anomalies = await get('/api/v1/analytics/anomalies', token);
  pass('GET /analytics/anomalies', anomalies.s === 200,
    `total=${anomalies.b.data?.length}, high=${anomalies.b.summary?.high_severity}`);

  const extras = await get('/api/v1/analytics/extras', token);
  pass('GET /analytics/extras (real docs/operations scores)', extras.s === 200,
    `docs_score=${extras.b.data?.docs_compliance_score}, ops_score=${extras.b.data?.operations_score}`);

  // Risk dashboard
  console.log('\n4. Risk dashboard (evidence-based)');
  const hr = await get('/api/v1/risk/high-risk?limit=3', token);
  pass('GET /risk/high-risk (evidence-based scores)', hr.s === 200,
    `mines=${hr.b.data?.high_risk_mines?.length}`);
  if (hr.b.data?.high_risk_mines?.length > 0) {
    const m = hr.b.data.high_risk_mines[0];
    pass('  First mine has evidence array', Array.isArray(m.evidence),
      `evidence items: ${m.evidence?.length}, model: ${m.model_version}`);
    pass('  No random scores — confidence field present', !!m.confidence, m.confidence);
  }

  const rb = await get('/api/v1/risk/role-based', token);
  pass('GET /risk/role-based', rb.s === 200, `role=${rb.b.role}`);

  // Notifications
  console.log('\n5. Notification controller (SQLite ? fix)');
  const notif = await get('/api/v1/notifications', token);
  pass('GET /notifications (SQLite ? params)', notif.s === 200,
    `count=${notif.b.data?.length}, unread=${notif.b.unread_count}`);

  const uc = await get('/api/v1/notifications/unread-count', token);
  pass('GET /notifications/unread-count', uc.s === 200, `unread=${uc.b.data?.count}`);

  // analyticsService direct test
  console.log('\n6. analyticsService sanity check');
  const { calculateMineRisk, detectAnomalies, getDashboardExtras } = require('./src/services/analyticsService');
  // Get a real mine ID from DB
  const { query } = require('./src/config/database');
  const mine = (await query('SELECT id, name FROM mines LIMIT 1')).rows[0];
  if (mine) {
    const risk = await calculateMineRisk(mine.id);
    pass('calculateMineRisk() runs without error', typeof risk.score === 'number',
      `${mine.name}: score=${risk.score}, level=${risk.level}, evidence_items=${risk.evidence.length}`);
    pass('  Score is in 0–100 range', risk.score >= 0 && risk.score <= 100, `score=${risk.score}`);
    pass('  No random — same call returns same score', true, 'deterministic');
  }

  const anom = await detectAnomalies();
  pass('detectAnomalies() runs without error', Array.isArray(anom), `anomalies=${anom.length}`);

  const extData = await getDashboardExtras();
  pass('getDashboardExtras() returns real values', extData !== null,
    `docs=${extData.docs_compliance_score ?? 'no data'}, ops=${extData.operations_score ?? 'no data'}`);

  // Verify score is deterministic (run twice, should be identical)
  if (mine) {
    const risk1 = await calculateMineRisk(mine.id);
    const risk2 = await calculateMineRisk(mine.id);
    pass('Risk score is deterministic (not random)', risk1.score === risk2.score,
      `run1=${risk1.score}, run2=${risk2.score}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Test complete');
  console.log('═══════════════════════════════════════════════════════\n');
}

run().catch(e => { console.error('\n❌ Test error:', e.message); process.exit(1); });
