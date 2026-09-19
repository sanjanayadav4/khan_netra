/**
 * KhanNetra – Disaster Alert Service
 * Sources: USGS (earthquakes), NDMA/IMD via open APIs, Open-Meteo (weather alerts)
 * Matches alerts with registered mine coordinates and calculates severity.
 */
'use strict';

const https  = require('https');
const http   = require('http');
const { query } = require('../config/database');
const { v4: uuid } = require('uuid');

/* ── Haversine distance (km) ──────────────────────────────────────── */
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ── Severity from magnitude / distance / type ────────────────────── */
function calcEarthquakeSeverity(mag, distKm) {
  if (mag >= 6.5 && distKm <= 300) return 'CRITICAL';
  if (mag >= 5.5 && distKm <= 400) return 'HIGH';
  if (mag >= 4.5 && distKm <= 500) return 'MEDIUM';
  return 'LOW';
}

function calcWeatherSeverity(type, value) {
  const t = (type || '').toLowerCase();
  if (t.includes('cyclone') || t.includes('tornado') || t.includes('hurricane')) return 'CRITICAL';
  if (t.includes('flood') && value > 100) return 'HIGH';
  if (t.includes('flood')) return 'MEDIUM';
  if (t.includes('lightning') || t.includes('thunder')) return 'HIGH';
  if (t.includes('heavy rain') && value > 150) return 'HIGH';
  if (t.includes('rain') && value > 64) return 'MEDIUM';
  return 'LOW';
}

/* ── Generic HTTP/HTTPS GET ──────────────────────────────────────── */
function fetchJSON(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const opts = new URL(url);
    const options = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: {
        'User-Agent': 'KhanNetra-DGMS-DisasterMonitor/1.0 (contact: khannetra@dgms.gov.in)',
        'Accept': 'application/json, application/geo+json, */*',
      },
    };
    let data = '';
    const req = lib.request(options, res => {
      // Follow redirects up to 3 times
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return fetchJSON(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode === 429) {
        return reject(new Error(`Rate limited by ${opts.hostname} (429) — skipping this poll`));
      }
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} from ${opts.hostname}`));
      }
      // Check Content-Type header — reject early if clearly not JSON
      const ct = (res.headers['content-type'] || '').toLowerCase();
      const isJsonCt = ct.includes('json') || ct.includes('geo') || ct === '' || ct.includes('*/*');
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => {
        const trimmed = data.trim();
        // Guard: must start with { or [ regardless of Content-Type
        if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
          return reject(new Error(
            `Non-JSON response from ${opts.hostname} (HTTP ${res.statusCode}) — ` +
            `got ${trimmed.slice(0, 40).replace(/\n/g, ' ')}...`
          ));
        }
        try { resolve(JSON.parse(trimmed)); }
        catch (e) { reject(new Error(`JSON parse failed from ${opts.hostname}: ${e.message}`)); }
      });
    });
    req.on('error', (e) => reject(new Error(`Network error reaching ${opts.hostname}: ${e.message}`)));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeoutMs}ms reaching ${opts.hostname}`));
    });
    req.end();
  });
}

/* ── Load mines from DB ───────────────────────────────────────────── */
async function getMines() {
  const r = await query('SELECT id, name, state, district, latitude, longitude FROM mines WHERE latitude IS NOT NULL');
  return r.rows;
}

/* ── Find mines within radius ─────────────────────────────────────── */
function findAffectedMines(mines, lat, lon, radiusKm) {
  return mines
    .filter(m => m.latitude && m.longitude)
    .filter(m => distanceKm(lat, lon, m.latitude, m.longitude) <= radiusKm)
    .map(m => ({ id: m.id, name: m.name, distance: Math.round(distanceKm(lat, lon, m.latitude, m.longitude)) }));
}

/* ── Check duplicate ─────────────────────────────────────────────── */
async function isDuplicate(externalId) {
  if (!externalId) return false;
  const r = await query('SELECT id FROM disaster_alerts WHERE external_id = ?', [externalId]);
  return r.rows.length > 0;
}

/* ── Save alert + notify ─────────────────────────────────────────── */
async function saveAlert(alert) {
  const id = uuid();
  await query(
    `INSERT OR IGNORE INTO disaster_alerts
     (id, alert_type, source, title, description, severity, latitude, longitude, location_name,
      magnitude, wind_speed, rainfall, affected_mines, status, is_test, external_id, raw_data, alert_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, alert.alert_type, alert.source, alert.title, alert.description,
     alert.severity, alert.latitude, alert.longitude, alert.location_name,
     alert.magnitude || null, alert.wind_speed || null, alert.rainfall || null,
     JSON.stringify(alert.affected_mines || []),
     'active', alert.is_test ? 1 : 0, alert.external_id || id,
     JSON.stringify(alert.raw_data || {}), alert.alert_time || new Date().toISOString()]
  );

  // Notify relevant users (safety officers, admins, mine managers)
  if (['HIGH','CRITICAL'].includes(alert.severity)) {
    const users = (await query(
      `SELECT id FROM users WHERE role IN ('admin','government_officer','safety_officer','mine_manager') AND is_active = 1`
    )).rows;
    for (const u of users) {
      await query(
        `INSERT INTO notifications (id, user_id, title, message, type, priority)
         VALUES (?,?,?,?,?,?)`,
        [uuid(), u.id,
         `🚨 ${alert.severity} DISASTER ALERT: ${alert.alert_type}`,
         `${alert.title}. ${alert.affected_mines?.length ? `${alert.affected_mines.length} mine(s) affected.` : 'Check immediately.'}`,
         'alert', alert.severity === 'CRITICAL' ? 'critical' : 'high']
      );
    }
  }

  return id;
}

/* ══════════════════════════════════════════════════════════════════
   SOURCE 1 — USGS Earthquake Feed (real-time, past 24h, M4+)
   Primary:  https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.0_day.geojson
   Fallback: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson
══════════════════════════════════════════════════════════════════ */
async function fetchUSGSEarthquakes(mines) {
  const URLS = [
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.0_day.geojson',
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  ];

  let json = null;
  let lastErr = null;
  for (const url of URLS) {
    try {
      json = await fetchJSON(url, 12000);
      break;
    } catch (e) {
      lastErr = e;
      // Try next URL
    }
  }
  if (!json) {
    throw new Error(lastErr?.message || 'All USGS URLs failed');
  }

  const saved = [];
  const features = Array.isArray(json.features) ? json.features : [];

  for (const feat of features) {
    const p   = feat.properties;
    const geo = feat.geometry?.coordinates; // [lon, lat, depth]
    if (!geo || !p) continue;

    const [lon, lat] = geo;
    const mag = parseFloat(p.mag);
    if (isNaN(mag)) continue;

    const externalId = feat.id;
    if (await isDuplicate(externalId)) continue;

    const affected = findAffectedMines(mines, lat, lon, 600);
    if (!affected.length) continue; // only alert if mines are within range

    const severity = calcEarthquakeSeverity(mag, affected[0]?.distance || 999);
    if (severity === 'LOW' && mag < 4.5) continue;

    const id = await saveAlert({
      alert_type: 'Earthquake',
      source: 'USGS Real-Time Feed',
      title: `M${mag.toFixed(1)} Earthquake – ${p.place}`,
      description: `Magnitude ${mag.toFixed(1)} earthquake at depth ${geo[2]?.toFixed(1)} km. Place: ${p.place}. Tsunami risk: ${p.tsunami ? 'YES' : 'No'}.`,
      severity,
      latitude: lat, longitude: lon,
      location_name: p.place,
      magnitude: mag,
      affected_mines: affected,
      external_id: externalId,
      alert_time: new Date(p.time).toISOString(),
      raw_data: { mag, place: p.place, depth: geo[2], tsunami: p.tsunami, url: p.url },
    });
    saved.push(id);
  }
  return saved;
}

/* ══════════════════════════════════════════════════════════════════
   SOURCE 2 — Open-Meteo Weather Alerts for mine coordinates
   (Free, no API key needed — checks extreme weather)
══════════════════════════════════════════════════════════════════ */
async function fetchWeatherAlerts(mines) {
  const saved = [];

  for (const mine of mines) {
    if (!mine.latitude || !mine.longitude) continue;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${mine.latitude}&longitude=${mine.longitude}&daily=precipitation_sum,wind_speed_10m_max,weathercode&timezone=Asia%2FKolkata&forecast_days=1`;
      const json = await fetchJSON(url, 8000);
      const d = json.daily;
      if (!d) continue;

      const rain      = d.precipitation_sum?.[0] || 0;
      const wind      = d.wind_speed_10m_max?.[0] || 0;
      const wcode     = d.weathercode?.[0] || 0;
      const date      = d.time?.[0] || new Date().toISOString().split('T')[0];

      // WMO weather codes: 95-99 = thunderstorm, 51-67 = rain, 71-77 = snow, 80-82 = showers
      let alertType = null, alertDesc = '', alertVal = 0;

      if (wcode >= 95)          { alertType = 'Thunderstorm / Lightning'; alertDesc = 'Severe thunderstorm with lightning risk.'; alertVal = wind; }
      else if (wcode >= 80 && rain > 80)  { alertType = 'Heavy Rainfall / Flood Risk'; alertDesc = `Intense showers forecast. Expected rainfall: ${rain.toFixed(0)}mm.`; alertVal = rain; }
      else if (rain > 100)      { alertType = 'Extreme Rainfall'; alertDesc = `Extreme rainfall forecast: ${rain.toFixed(0)}mm. Flood and inundation risk.`; alertVal = rain; }
      else if (rain > 64)       { alertType = 'Heavy Rainfall'; alertDesc = `Heavy rainfall forecast: ${rain.toFixed(0)}mm.`; alertVal = rain; }
      else if (wind > 75)       { alertType = 'Cyclonic Wind'; alertDesc = `Extreme wind speed forecast: ${wind.toFixed(0)} km/h. Cyclone risk.`; alertVal = wind; }
      else if (wind > 55)       { alertType = 'Severe Wind'; alertDesc = `High wind speed forecast: ${wind.toFixed(0)} km/h.`; alertVal = wind; }

      if (!alertType) continue;

      const severity = calcWeatherSeverity(alertType, alertVal);
      if (severity === 'LOW') continue;

      const externalId = `weather-${mine.id}-${date}`;
      if (await isDuplicate(externalId)) continue;

      const id = await saveAlert({
        alert_type: alertType,
        source: 'Open-Meteo / IMD-equivalent Forecast',
        title: `${alertType} Alert – ${mine.name} (${mine.district || mine.state})`,
        description: alertDesc,
        severity,
        latitude: mine.latitude, longitude: mine.longitude,
        location_name: `${mine.district || ''}, ${mine.state}`,
        wind_speed: wind, rainfall: rain,
        affected_mines: [{ id: mine.id, name: mine.name, distance: 0 }],
        external_id: externalId,
        alert_time: new Date(date).toISOString(),
        raw_data: { rain, wind, wcode, mine_id: mine.id },
      });
      saved.push(id);
    } catch (e) {
      console.warn(`[Disaster] Weather check failed for ${mine.name}:`, e.message);
    }
  }
  return saved;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN POLL — called by cron every 10 minutes
══════════════════════════════════════════════════════════════════ */
exports.pollAllSources = async () => {
  const startTime = Date.now();
  const results   = { earthquakes: 0, weather: 0, errors: [] };

  let mines = [];
  try { mines = await getMines(); }
  catch (e) { results.errors.push(`getMines: ${e.message}`); return results; }

  // USGS Earthquakes
  try {
    const ids = await fetchUSGSEarthquakes(mines);
    results.earthquakes = ids.length;
  } catch (e) {
    results.errors.push(`USGS: ${e.message}`);
    console.warn(`[Disaster] USGS unavailable: ${e.message.slice(0, 120)}`);
  }

  // Weather alerts
  try {
    const ids = await fetchWeatherAlerts(mines);
    results.weather = ids.length;
  } catch (e) {
    results.errors.push(`Weather: ${e.message}`);
    console.warn(`[Disaster] Weather unavailable: ${e.message.slice(0, 120)}`);
  }

  results.duration_ms = Date.now() - startTime;
  const saved = results.earthquakes + results.weather;
  if (saved > 0 || results.errors.length === 0) {
    console.log(`[Disaster] Poll: +${results.earthquakes} earthquakes, +${results.weather} weather alerts (${results.duration_ms}ms)`);
  } else if (results.errors.length > 0) {
    console.log(`[Disaster] Poll completed with external API issues (${results.duration_ms}ms) — alerts DB unaffected`);
  }
  return results;
};

/* ── Public helper: create a TEST alert ─────────────────────────── */
exports.createTestAlert = async (userId) => {
  const id = uuid();
  const testAlert = {
    id,
    alert_type: 'TEST – Earthquake',
    source: 'KhanNetra Test System',
    title: '[TEST ONLY] M5.8 Simulated Earthquake – Jharkhand Region',
    description: 'THIS IS A TEST ALERT generated for demonstration and training purposes only. DO NOT evacuate. No real emergency exists.',
    severity: 'HIGH',
    latitude: 23.80, longitude: 86.43,
    location_name: 'Jharia Coalfield, Jharkhand (TEST)',
    magnitude: 5.8,
    affected_mines: JSON.stringify([
      { id: 'test', name: 'Jharia Central Coal Mine', distance: 12 },
      { id: 'test2', name: 'Raniganj Deep Mine', distance: 180 },
    ]),
    status: 'active', is_test: 1,
    external_id: `test-${Date.now()}`,
    alert_time: new Date().toISOString(),
    raw_data: JSON.stringify({ test: true, triggered_by: userId }),
  };

  await query(
    `INSERT INTO disaster_alerts
     (id,alert_type,source,title,description,severity,latitude,longitude,location_name,
      magnitude,affected_mines,status,is_test,external_id,raw_data,alert_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [testAlert.id, testAlert.alert_type, testAlert.source, testAlert.title,
     testAlert.description, testAlert.severity, testAlert.latitude, testAlert.longitude,
     testAlert.location_name, testAlert.magnitude, testAlert.affected_mines,
     testAlert.status, testAlert.is_test, testAlert.external_id,
     testAlert.raw_data, testAlert.alert_time]
  );

  // Log audit
  await query(
    `INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,description,ip_address) VALUES (?,?,?,?,?,?,?)`,
    [uuid(), userId, 'TEST_ALERT', 'disaster_alert', id, 'TEST emergency alert created for demonstration', '127.0.0.1']
  );

  return id;
};

exports.getMines        = getMines;
exports.distanceKm      = distanceKm;
exports.findAffectedMines = findAffectedMines;
