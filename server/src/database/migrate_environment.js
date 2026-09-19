/**
 * KhanNetra — Environmental Monitoring Migration
 * Creates env_parameters + env_alerts tables, extends environmental_readings.
 * Safe to run multiple times.
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Database = require('better-sqlite3');
const { v4 } = require('uuid');

const db = new Database(path.join(__dirname, '../../khannetra.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

function addColIfMissing(table, col, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
    console.log(`  + ${table}.${col}`);
  }
}

console.log('\n=== Environmental Monitoring Migration ===\n');

/* ── 1. Extend environmental_readings ──────────────────────────────── */
console.log('environmental_readings:');
[
  ['category',       "TEXT DEFAULT 'Air Quality'"],  // Air Quality|Water|Noise|Waste|Land
  ['sensor_id',      'TEXT'],                        // optional sensor identifier
  ['sensor_type',    'TEXT'],                        // manual|automatic|iot
  ['section',        'TEXT'],                        // mine section / zone
  ['latitude',       'REAL'],
  ['longitude',      'REAL'],
  ['weather_condition','TEXT'],                      // sunny|cloudy|rainy|windy
  ['wind_speed',     'REAL'],
  ['wind_direction', 'TEXT'],
  ['temperature',    'REAL'],
  ['humidity',       'REAL'],
  ['updated_at',     'TEXT'],
].forEach(([col, def]) => addColIfMissing('environmental_readings', col, def));

/* ── 2. env_parameters ─ master threshold/unit config ──────────────── */
console.log('env_parameters:');
db.exec(`
  CREATE TABLE IF NOT EXISTS env_parameters (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,       -- e.g. PM10, CH4
    display_name  TEXT,
    category      TEXT NOT NULL,              -- Air Quality|Water|Noise|Waste|Land
    unit          TEXT NOT NULL,
    threshold_min REAL,
    threshold_max REAL NOT NULL,
    critical_max  REAL,                       -- >critical_max = critical
    description   TEXT,
    cpcb_standard TEXT,                       -- CPCB/CEGB standard reference
    is_active     INTEGER DEFAULT 1,
    sort_order    INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now'))
  )
`);

/* ── 3. env_alerts ─ dedicated alert log ───────────────────────────── */
console.log('env_alerts:');
db.exec(`
  CREATE TABLE IF NOT EXISTS env_alerts (
    id             TEXT PRIMARY KEY,
    reading_id     TEXT,
    mine_id        TEXT NOT NULL,
    parameter      TEXT NOT NULL,
    category       TEXT,
    value          REAL NOT NULL,
    unit           TEXT,
    threshold_max  REAL,
    severity       TEXT NOT NULL,             -- warning|critical
    location       TEXT,
    section        TEXT,
    message        TEXT,
    is_acknowledged INTEGER DEFAULT 0,
    acknowledged_by TEXT,
    acknowledged_at TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_env_alerts_mine ON env_alerts(mine_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_env_alerts_ack  ON env_alerts(is_acknowledged)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_env_readings_cat ON environmental_readings(category)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_env_readings_ts  ON environmental_readings(recorded_at)`);

/* ── 4. Seed env_parameters ─────────────────────────────────────────── */
const existing = db.prepare('SELECT COUNT(*) as c FROM env_parameters').get();
if (existing.c === 0) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO env_parameters
      (id, name, display_name, category, unit, threshold_min, threshold_max,
       critical_max, description, cpcb_standard, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

  const params = [
    // Air Quality
    [v4(),'PM2.5',  'PM2.5 (Fine Particulate)',    'Air Quality', 'μg/m³',  0,   60,  120, 'Fine particles <2.5μm diameter',          'CPCB NAAQS 2009',    1],
    [v4(),'PM10',   'PM10 (Coarse Particulate)',   'Air Quality', 'μg/m³',  0,  100,  200, 'Particulate matter <10μm diameter',        'CPCB NAAQS 2009',    2],
    [v4(),'SO2',    'Sulphur Dioxide',             'Air Quality', 'μg/m³',  0,   80,  160, 'SO₂ from fuel combustion',                 'CPCB NAAQS SO₂',     3],
    [v4(),'NO2',    'Nitrogen Dioxide',            'Air Quality', 'μg/m³',  0,   80,  160, 'NO₂ from combustion',                      'CPCB NAAQS NO₂',     4],
    [v4(),'CH4',    'Methane',                     'Air Quality', '%',      0,    0.5,  1.5,'Mine gas — explosive above 5%',            'DGMS CMR 2017',      5],
    [v4(),'CO',     'Carbon Monoxide',             'Air Quality', 'ppm',    0,   50,  100, 'CO from incomplete combustion',            'DGMS CMR 2017',      6],
    [v4(),'CO2',    'Carbon Dioxide',              'Air Quality', 'ppm',    0, 5000, 8000, 'CO₂ concentration in mine air',            'DGMS CMR 2017',      7],
    [v4(),'H2S',    'Hydrogen Sulphide',           'Air Quality', 'ppm',    0,    1,    5, 'Toxic gas in coal mines',                  'DGMS CMR 2017',      8],
    [v4(),'Dust',   'Total Suspended Dust',        'Air Quality', 'mg/m³',  0,    3,    6, 'Total airborne dust at workplace',         'Mines Act 1952',     9],
    // Water
    [v4(),'pH',     'Water pH',                    'Water',       'pH',     6.5,  8.5,  9, 'Acidity/alkalinity of water',              'CPCB WQ Standards', 10],
    [v4(),'TDS',    'Total Dissolved Solids',      'Water',       'mg/L',   0, 2100, 3000, 'Total dissolved solids in water',          'IS 10500:2012',      11],
    [v4(),'BOD',    'Biochemical Oxygen Demand',   'Water',       'mg/L',   0,   30,   60, 'Organic load in discharge water',          'CPCB ELU 2015',      12],
    [v4(),'COD',    'Chemical Oxygen Demand',      'Water',       'mg/L',   0,  250,  500, 'Chemical pollutant load in water',         'CPCB ELU 2015',      13],
    [v4(),'TSS',    'Total Suspended Solids',      'Water',       'mg/L',   0,  100,  200, 'Suspended solids in discharge',            'CPCB ELU 2015',      14],
    [v4(),'DO',     'Dissolved Oxygen',            'Water',       'mg/L',   5,   14,  null,'Dissolved oxygen in water body',           'IS 10500:2012',      15],
    // Noise
    [v4(),'Noise',  'Noise Level',                 'Noise',       'dB(A)',  0,   75,   90, 'Ambient noise near mine boundary',         'EPA Noise Rules 2000',16],
    [v4(),'Noise_WZ','Noise (Work Zone)',           'Noise',       'dB(A)',  0,   90,  105,'Noise at worker locations',                'Factories Act 1948',  17],
    // Waste
    [v4(),'OB_Gen', 'Overburden Generated',        'Waste',       'm³/day', 0, 1000, 2000, 'Overburden material generated',           'EIA Guidelines',     18],
    [v4(),'Leachate','Leachate pH',                'Waste',       'pH',     6,    9,   10, 'pH of leachate from waste dumps',          'CPCB Solid Waste',   19],
    // Land
    [v4(),'Subsidence','Surface Subsidence',       'Land',        'mm',     0,   50,  100, 'Ground settlement above workings',         'DGMS CMR 2017',      20],
    [v4(),'Vibration', 'Blast Vibration (PPV)',    'Land',        'mm/s',   0,    5,   10, 'Peak particle velocity from blasting',     'DGMS Blasting Rules',21],
  ];
  for (const p of params) stmt.run(...p);
  console.log(`  Seeded ${params.length} parameters`);
}

/* ── 5. Back-fill category on existing readings ─────────────────────── */
const typeToCategory = {
  'Air Quality':  'Air Quality',
  'Gas Monitoring':'Air Quality',
  'Water Quality':'Water',
  'Discharge':    'Water',
  'Noise':        'Noise',
  'Dust':         'Air Quality',
  'Waste':        'Waste',
  'Land':         'Land',
  'Manual':       'Air Quality',
};
const noCategory = db.prepare(`SELECT id, reading_type, parameter FROM environmental_readings WHERE category IS NULL OR category = ''`).all();
if (noCategory.length > 0) {
  const upd = db.prepare(`UPDATE environmental_readings SET category=? WHERE id=?`);
  for (const r of noCategory) {
    const cat = typeToCategory[r.reading_type] ||
      (r.parameter.toLowerCase().includes('noise') ? 'Noise' :
       r.parameter.toLowerCase().includes('ph') || r.parameter.toLowerCase().includes('tds') ? 'Water' :
       'Air Quality');
    upd.run(cat, r.id);
  }
  console.log(`  Back-filled category for ${noCategory.length} readings`);
}

/* ── 6. Seed env_alerts from existing critical/warning readings ──────── */
const alertCount = db.prepare('SELECT COUNT(*) as c FROM env_alerts').get();
if (alertCount.c === 0) {
  const alertRows = db.prepare(
    `SELECT er.id, er.mine_id, er.parameter, er.category, er.value, er.unit,
            er.threshold_max, er.status, er.location, er.recorded_at
     FROM environmental_readings er
     WHERE er.status IN ('warning','critical')
     ORDER BY er.recorded_at DESC LIMIT 50`
  ).all();
  const ins = db.prepare(`INSERT INTO env_alerts (id,reading_id,mine_id,parameter,category,value,unit,threshold_max,severity,location,message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of alertRows) {
    ins.run(
      v4(), r.id, r.mine_id, r.parameter, r.category || 'Air Quality',
      r.value, r.unit, r.threshold_max, r.status,
      r.location,
      `${r.parameter} at ${r.value} ${r.unit || ''} exceeds limit of ${r.threshold_max} ${r.unit || ''}`.trim(),
      r.recorded_at
    );
  }
  console.log(`  Seeded ${alertRows.length} alerts from existing readings`);
}

db.pragma('foreign_keys = ON');
db.close();
console.log('\n✅ Environmental migration complete\n');
