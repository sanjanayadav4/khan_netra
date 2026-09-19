/**
 * KhanNetra Mine Plans — End-to-End Test
 * node test_mine_plans.js
 */
'use strict';
require('dotenv').config();
const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const sharp  = require('sharp');

function apiCall(method, path, body, token, contentType) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const r = http.request({
      host: 'localhost', port: 5000, path, method,
      headers: {
        ...(data ? { 'Content-Type': contentType || 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
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

function postMultipart(path, fields, fileField, filePath, fileName, mimeType, token) {
  return new Promise((resolve, reject) => {
    const boundary = 'KNTestBoundary' + Date.now();
    const CRLF = '\r\n';
    const fileData = fs.readFileSync(filePath);
    let body = Buffer.alloc(0);

    // Fields
    for (const [k, v] of Object.entries(fields)) {
      const part = `--${boundary}${CRLF}Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}${v}${CRLF}`;
      body = Buffer.concat([body, Buffer.from(part)]);
    }

    // File
    const filePart = `--${boundary}${CRLF}Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
    body = Buffer.concat([body, Buffer.from(filePart), fileData, Buffer.from(`${CRLF}--${boundary}--${CRLF}`)]);

    const r = http.request({
      host: 'localhost', port: 5000, path, method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
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
    r.write(body);
    r.end();
  });
}

function pass(label, ok, detail) {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' KhanNetra Mine Plans — End-to-End Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // Login
  const login = await apiCall('POST', '/api/v1/auth/login',
    { email: 'admin@khannetra.gov.in', password: 'KhanNetra@2024' }
  );
  pass('Login as admin', login.b.success, `HTTP ${login.s}`);
  const token = login.b.data?.token;
  if (!token) { console.error('No token'); return; }

  // Get an underground mine
  const mines = await apiCall('GET', '/api/v1/mines?limit=10', null, token);
  const ugMine = (mines.b.data || []).find(m => m.type?.toLowerCase().includes('underground'));
  pass('Found underground mine', !!ugMine, ugMine?.name);

  // Stats (before upload)
  const stats0 = await apiCall('GET', '/api/v1/mine-plans/stats', null, token);
  const before = stats0.b.data?.total_plans || 0;
  pass('Stats endpoint works', stats0.s === 200, `total=${before} underground=${stats0.b.data?.underground_mines}`);

  // Create a valid test JPEG (simulating a mine plan document)
  console.log('\n1. Upload test');
  const testImgPath = path.join(__dirname, 'test_mine_plan.jpg');
  const imgBuf = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 240, g: 240, b: 255 } }
  }).jpeg({ quality: 85 }).toBuffer();
  fs.writeFileSync(testImgPath, imgBuf);
  pass('Test image created', fs.existsSync(testImgPath), `${imgBuf.length} bytes`);

  // Upload plan
  const upload = await postMultipart(
    '/api/v1/mine-plans',
    {
      mine_id:         ugMine.id,
      plan_title:      'Test General Layout Plan 2026',
      plan_type:       'General Layout',
      version_number:  '1.0',
      version_label:   'Initial Upload Test',
      change_description: 'Test upload for CI verification',
      is_restricted:   '1',
    },
    'plan_file',
    testImgPath,
    'test_mine_plan.jpg',
    'image/jpeg',
    token
  );
  pass('Upload plan', upload.s === 201, `id=${upload.b.data?.id?.slice(0,8)} status=${upload.b.data?.ocr_status}`);
  const planId = upload.b.data?.id;

  // Wait for OCR to start/complete (it's async)
  await new Promise(r => setTimeout(r, 3000));

  // Get plan details
  console.log('\n2. Plan retrieval');
  const detail = await apiCall('GET', `/api/v1/mine-plans/${planId}`, null, token);
  pass('GET plan by ID', detail.s === 200, `approval=${detail.b.data?.plan?.approval_status}`);
  pass('Plan has safety overlay', !!detail.b.data?.safety_overlay, `incidents=${detail.b.data?.safety_overlay?.incidents?.length}`);
  pass('Plan has version history', Array.isArray(detail.b.data?.versions), `versions=${detail.b.data?.versions?.length}`);
  const ocrStatus = detail.b.data?.plan?.ocr_status;
  pass('OCR ran asynchronously', ['complete','failed','processing'].includes(ocrStatus), `ocr_status=${ocrStatus}`);

  // Stats (after upload)
  const stats1 = await apiCall('GET', '/api/v1/mine-plans/stats', null, token);
  pass('Stats updated', stats1.b.data?.total_plans > before, `total=${stats1.b.data?.total_plans}`);

  // Add a layer annotation
  console.log('\n3. Layer management');
  const layer = await apiCall('POST', `/api/v1/mine-plans/${planId}/layers`, {
    layer_type:  'shaft',
    label:       'Main Shaft No.1',
    description: 'Primary ventilation shaft',
    geometry:    JSON.stringify({ type: 'point', coordinates: { x: 0.3, y: 0.4 } }),
    color:       '#f59e0b',
  }, token);
  pass('Add layer annotation', layer.s === 201, `id=${layer.b.data?.id?.slice(0,8)} type=${layer.b.data?.layer_type}`);

  const layers = await apiCall('GET', `/api/v1/mine-plans/${planId}/layers`, null, token);
  pass('List layers', layers.s === 200 && layers.b.data?.length > 0, `count=${layers.b.data?.length}`);

  // Approval workflow
  console.log('\n4. Approval workflow');
  const approve = await apiCall('PUT', `/api/v1/mine-plans/${planId}/approval`, { action: 'approve' }, token);
  pass('Approve plan', approve.s === 200, `status=${approve.b.data?.approval_status}`);

  const setCurrent = await apiCall('PUT', `/api/v1/mine-plans/${planId}/approval`, { action: 'set_current' }, token);
  pass('Set as current version', setCurrent.s === 200, `is_current=${setCurrent.b.data?.is_current_version}`);

  // Access logs
  console.log('\n5. Audit trail');
  const logs = await apiCall('GET', `/api/v1/mine-plans/${planId}/logs`, null, token);
  pass('Access logs written', logs.s === 200 && logs.b.data?.length > 0, `log_entries=${logs.b.data?.length}`);

  // Mine list filter
  const list = await apiCall('GET', `/api/v1/mine-plans?mine_id=${ugMine.id}`, null, token);
  pass('Filter plans by mine', list.s === 200, `total=${list.b.pagination?.total}`);

  // Verify existing routes still work
  console.log('\n6. Existing system unchanged');
  const vis = await apiCall('GET', '/api/v1/vision/health', null, token);
  pass('Safety Vision operational', vis.s === 200 && vis.b.status === 'operational', `backend=${vis.b.model_backend}`);
  const dash = await apiCall('GET', '/api/v1/analytics/dashboard', null, token);
  pass('Dashboard data real', dash.s === 200, `mines=${dash.b.data?.mines?.total} violations=${dash.b.data?.violations?.open}`);
  const ins = await apiCall('GET', '/api/v1/inspections', null, token);
  pass('Inspections working', ins.s === 200, `count=${ins.b.data?.length}`);

  // Cleanup
  fs.unlinkSync(testImgPath);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Test complete');
  console.log('═══════════════════════════════════════════════════════\n');
}

run().catch(e => { console.error('Test error:', e.message); process.exit(1); });
