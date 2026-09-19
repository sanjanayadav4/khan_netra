/**
 * Inspection workflow smoke test
 * node test_inspection.js
 */
'use strict';
require('dotenv').config();
const http = require('http');

function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: 'localhost', port: 5000, path, method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
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
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const get  = (p, t)    => apiCall('GET',  p, null, t);
const post = (p, b, t) => apiCall('POST', p, b,    t);
const put  = (p, b, t) => apiCall('PUT',  p, b,    t);

function pass(label, ok, detail) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Inspection Workflow Smoke Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // Login as inspector
  const loginIns = await post('/api/v1/auth/login', {
    email: 'inspector1@khannetra.gov.in', password: 'KhanNetra@2024'
  });
  pass('Login as inspector', loginIns.b.success);
  const insToken = loginIns.b.data?.token;

  // Login as admin
  const loginAdmin = await post('/api/v1/auth/login', {
    email: 'admin@khannetra.gov.in', password: 'KhanNetra@2024'
  });
  pass('Login as admin', loginAdmin.b.success);
  const adminToken = loginAdmin.b.data?.token;
  if (!adminToken) return;

  // Get a mine ID
  const mines = await get('/api/v1/mines?limit=1', adminToken);
  const mineId = mines.b.data?.[0]?.id;
  pass('Got mine ID', !!mineId, mineId?.slice(0, 8));

  // Get inspector user ID (for assignment test)
  const users = await get('/api/v1/ai/users', adminToken);
  const inspector = (users.b.data || []).find(u => u.role === 'inspector');
  pass('Got inspector user', !!inspector, inspector?.full_name);

  console.log('\n1. Schedule inspection (admin, with inspector assignment + location)');
  const created = await post('/api/v1/inspections', {
    mine_id:          mineId,
    type:             'Routine Safety',
    scheduled_date:   new Date().toISOString().split('T')[0],
    inspector_id:     inspector?.id || undefined,
    location_in_mine: 'Entry Gate, Level 2',
  }, adminToken);
  pass('Create inspection', created.s === 201, `#${created.b.data?.inspection_number}`);
  const insId = created.b.data?.id;
  pass('  location_in_mine saved', created.b.data?.location_in_mine === 'Entry Gate, Level 2',
    created.b.data?.location_in_mine);
  pass('  inspector_id assigned', !!created.b.data?.inspector_id);

  console.log('\n2. List inspections — inspector sees their assigned ones');
  const list = await get('/api/v1/inspections', insToken);
  pass('GET /inspections (inspector role)', list.s === 200, `rows=${list.b.data?.length}`);

  console.log('\n3. Update to "in_progress"');
  if (insId) {
    const inProgress = await put(`/api/v1/inspections/${insId}`, {
      status: 'in_progress',
    }, adminToken);
    pass('Update status to in_progress', inProgress.s === 200, `status=${inProgress.b.data?.status}`);
  }

  console.log('\n4. Complete inspection with findings + score');
  if (insId) {
    const mineScoreBefore = (await get(`/api/v1/mines/${mineId}`, adminToken)).b.data?.risk_score;

    const completed = await put(`/api/v1/inspections/${insId}`, {
      status:           'completed',
      overall_score:    72.5,
      findings:         'Ventilation in Level 2 adequate. Fire extinguishers checked — all valid. PPE compliance 95%.',
      recommendations:  'Replace dust suppression nozzle in conveyor belt area. Schedule quarterly follow-up.',
      follow_up_required: 1,
      follow_up_date:   new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      location_in_mine: 'Entry Gate, Level 2, Seam 14',
    }, adminToken);

    pass('Complete inspection', completed.s === 200, `score=${completed.b.data?.overall_score}`);
    pass('  findings saved', !!completed.b.data?.findings, `${String(completed.b.data?.findings || '').slice(0, 40)}…`);
    pass('  recommendations saved', !!completed.b.data?.recommendations);
    pass('  follow_up_required saved', completed.b.data?.follow_up_required === 1);
    pass('  status is completed', completed.b.data?.status === 'completed');
    pass('  completed_date set', !!completed.b.data?.completed_date);
    pass('  location_in_mine saved', !!completed.b.data?.location_in_mine);

    // Give recalc a moment to run
    await new Promise(r => setTimeout(r, 800));

    // Check mine's last_inspection_date was updated
    const mineAfter = await get(`/api/v1/mines/${mineId}`, adminToken);
    pass('  mine.last_inspection_date updated', !!mineAfter.b.data?.last_inspection_date);
  }

  console.log('\n5. Save checklist (feeds compliance risk engine)');
  if (insId) {
    const cl = await post('/api/v1/inspections/checklist', {
      inspection_id: insId,
      items: [
        { category: 'Ventilation',       item_description: 'Air circulation adequate', is_compliant: true,  score: 90, remarks: 'Good airflow' },
        { category: 'Fire Safety',       item_description: 'Extinguishers valid',      is_compliant: true,  score: 85, remarks: 'All valid' },
        { category: 'PPE',               item_description: 'Workers wearing PPE',      is_compliant: true,  score: 95, remarks: '95% compliance' },
        { category: 'Dust Control',      item_description: 'Suppression systems',      is_compliant: false, score: 40, remarks: 'Nozzle needs replacement' },
        { category: 'Strata Control',    item_description: 'Roof support adequate',    is_compliant: true,  score: 80, remarks: 'Satisfactory' },
        { category: 'Electrical Safety', item_description: 'Equipment certified',      is_compliant: true,  score: 88, remarks: 'All certified' },
        { category: 'Emergency Procedures', item_description: 'Escape routes clear',  is_compliant: true,  score: 92, remarks: 'Routes clear' },
        { category: 'First Aid',         item_description: 'Kits stocked',             is_compliant: true,  score: 85, remarks: 'Stocked' },
      ],
    }, adminToken);
    pass('Save checklist', cl.s === 200, `overall_score=${cl.b.data?.overall_score?.toFixed(1)}`);
  }

  console.log('\n6. Retrieve completed inspection with checklist');
  if (insId) {
    const detail = await get(`/api/v1/inspections/${insId}`, adminToken);
    pass('GET inspection detail', detail.s === 200);
    pass('  checklist items present', (detail.b.data?.checklist?.length || 0) > 0,
      `${detail.b.data?.checklist?.length} items`);
    pass('  findings in detail', !!detail.b.data?.findings);
  }

  console.log('\n7. Validation — missing required fields rejected');
  const badCreate = await post('/api/v1/inspections', { type: 'Routine Safety' }, adminToken);
  pass('Missing mine_id rejected', badCreate.s === 400, badCreate.b.message);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Inspection test complete');
  console.log('═══════════════════════════════════════════════════════\n');
}

run().catch(e => { console.error('Test error:', e.message); process.exit(1); });
