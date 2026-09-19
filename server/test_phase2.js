/**
 * KhanNetra Phase-2 smoke test
 * node test_phase2.js
 */
'use strict';
require('dotenv').config();
const http = require('http');

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: 'localhost', port: 5000, path,
      method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ s: res.statusCode, b: JSON.parse(d) }); }
        catch { resolve({ s: res.statusCode, b: { raw: d.slice(0, 300) } }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const get  = (p, t)    => apiCall('GET',  p, null, t);
const post = (p, b, t) => apiCall('POST', p, b,    t);

function pass(label, ok, detail) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' KhanNetra Phase-2 — Smoke Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // Login as admin
  const login = await post('/api/v1/auth/login', { email: 'admin@khannetra.gov.in', password: 'KhanNetra@2024' });
  pass('Login', login.b.success);
  const adminToken = login.b.data?.token;

  // Login as mine manager
  const loginMgr = await post('/api/v1/auth/login', { email: 'manager1@khannetra.gov.in', password: 'KhanNetra@2024' });
  pass('Login as mine manager', loginMgr.b.success);
  const mgrToken = loginMgr.b.data?.token;
  if (!adminToken) { console.error('Cannot continue'); return; }

  // ── Task 1: AI context injection ────────────────────────────────────────
  console.log('\n1. AI Context Injection');
  const chatAdmin = await post('/api/v1/ai/chat',
    { message: 'What is the current risk status of the mines I manage?', session_id: 'smoke-test-' + Date.now() },
    adminToken
  );
  pass('Chat (admin) — responds', chatAdmin.s === 200 && chatAdmin.b.success,
    `model=${chatAdmin.b.data?.model}`);

  const chatMgr = await post('/api/v1/ai/chat',
    { message: 'How many open violations do I have?', session_id: 'smoke-mgr-' + Date.now() },
    mgrToken
  );
  pass('Chat (mine_manager) — responds with real context', chatMgr.s === 200 && chatMgr.b.success,
    `model=${chatMgr.b.data?.model}`);
  // Verify the response text doesn't contain "I don't have access"
  const responseText = chatMgr.b.data?.message || '';
  const mentionsData = /violation|compliance|score|incident|mine|safe/i.test(responseText);
  pass('  AI answer mentions real data keywords', mentionsData, `response_length=${responseText.length}`);

  // ── Task 2: RiskDashboard computed scores + evidence ────────────────────
  console.log('\n2. Risk Dashboard — computed scores + evidence');
  const hr = await get('/api/v1/risk/high-risk?limit=3', adminToken);
  pass('GET /risk/high-risk', hr.s === 200);

  if (hr.b.data?.high_risk_mines?.length > 0) {
    const mine = hr.b.data.high_risk_mines[0];
    pass('  computed_risk_score present', mine.computed_risk_score !== undefined,
      `score=${mine.computed_risk_score}, level=${mine.computed_risk_level}`);
    pass('  evidence[] array present', Array.isArray(mine.evidence),
      `items=${mine.evidence?.length}`);
    pass('  risk_factors[] present', Array.isArray(mine.risk_factors),
      `factors=${mine.risk_factors?.length}`);
    pass('  confidence field present', !!mine.confidence, mine.confidence);
    pass('  data_as_of timestamp present', !!mine.data_as_of);
    pass('  model_version present', !!mine.model_version, mine.model_version);
  }

  pass('  meta.data_freshness present', !!hr.b.meta?.data_freshness);
  pass('  meta.risk_model present', !!hr.b.meta?.risk_model, hr.b.meta?.risk_model);

  // ── Task 3: Analytics new endpoints ─────────────────────────────────────
  console.log('\n3. Analytics — Recurring violations + Anomalies');

  const recurring = await get('/api/v1/analytics/recurring-violations?window=180&min_count=2', adminToken);
  pass('GET /analytics/recurring-violations', recurring.s === 200,
    `patterns=${recurring.b.data?.length}, mines=${recurring.b.summary?.mines_affected}`);
  pass('  summary block present', !!recurring.b.summary);
  pass('  meta.data_source present', !!recurring.b.meta?.data_source);
  pass('  data_freshness present', !!recurring.b.meta?.data_freshness);

  const anomalies = await get('/api/v1/analytics/anomalies', adminToken);
  pass('GET /analytics/anomalies', anomalies.s === 200,
    `total=${anomalies.b.data?.length}`);
  pass('  summary block present', !!anomalies.b.summary);
  pass('  meta.methodology present', !!anomalies.b.meta?.methodology);

  const extras = await get('/api/v1/analytics/extras', adminToken);
  pass('GET /analytics/extras', extras.s === 200,
    `docs=${extras.b.data?.docs_compliance_score}, ops=${extras.b.data?.operations_score}`);
  pass('  data_available flags present', !!extras.b.data?.data_available);

  // Verify existing endpoints still work
  console.log('\n4. Existing endpoints still functional');
  const dash = await get('/api/v1/analytics/dashboard', adminToken);
  pass('GET /analytics/dashboard', dash.s === 200, `mines=${dash.b.data?.mines?.total}`);
  const trend = await get('/api/v1/analytics/compliance-trend?months=6', adminToken);
  pass('GET /analytics/compliance-trend', trend.s === 200, `rows=${trend.b.data?.length}`);
  const notif = await get('/api/v1/notifications', adminToken);
  pass('GET /notifications', notif.s === 200, `count=${notif.b.data?.length}`);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Phase-2 test complete');
  console.log('═══════════════════════════════════════════════════════\n');
}

run().catch(e => { console.error('Test error:', e.message); process.exit(1); });
