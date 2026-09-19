/**
 * KhanNetra — Production & Disaster Migration
 * Creates: production_records, production_targets, machinery_status
 * Extends: disaster_alerts with manual_create fields
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

function addCol(table, col, def) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!existing.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`  + ${table}.${col}`);
  }
}

console.log('\n=== Production & Disaster Migration ===\n');

/* ── 1. production_targets ──────────────────────────────────────────── */
console.log('production_targets:');
db.exec(`
  CREATE TABLE IF NOT EXISTS production_targets (
    id              TEXT PRIMARY KEY,
    mine_id         TEXT NOT NULL,
    target_date     TEXT NOT NULL,    -- YYYY-MM-DD (daily target) or YYYY-MM (monthly)
    period_type     TEXT DEFAULT 'daily',   -- daily | monthly | weekly
    mineral_type    TEXT DEFAULT 'Coal',
    target_tonnes   REAL NOT NULL,
    unit            TEXT DEFAULT 'T',
    set_by          TEXT,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(mine_id, target_date, period_type, mineral_type)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pt_mine_date ON production_targets(mine_id, target_date)`);

/* ── 2. production_records ──────────────────────────────────────────── */
console.log('production_records:');
db.exec(`
  CREATE TABLE IF NOT EXISTS production_records (
    id                  TEXT PRIMARY KEY,
    mine_id             TEXT NOT NULL,
    record_date         TEXT NOT NULL,      -- YYYY-MM-DD
    shift               TEXT DEFAULT 'all', -- day | night | general | all
    mineral_type        TEXT DEFAULT 'Coal',
    actual_tonnes       REAL NOT NULL,
    target_tonnes       REAL,               -- denormalised from production_targets
    achievement_pct     REAL,               -- computed: (actual/target)*100
    working_hours       REAL,
    workers_deployed    INTEGER,
    active_machines     INTEGER,
    productivity_tph    REAL,               -- tonnes per hour
    stripping_ratio     REAL,               -- OB:Coal ratio (opencast)
    section             TEXT,               -- mine section / seam / face
    notes               TEXT,
    recorded_by         TEXT,
    verified_by         TEXT,
    status              TEXT DEFAULT 'recorded',  -- recorded | verified | disputed
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pr_mine_date ON production_records(mine_id, record_date)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pr_date      ON production_records(record_date)`);

/* ── 3. machinery_status ────────────────────────────────────────────── */
console.log('machinery_status:');
db.exec(`
  CREATE TABLE IF NOT EXISTS machinery_status (
    id                  TEXT PRIMARY KEY,
    mine_id             TEXT NOT NULL,
    machine_name        TEXT NOT NULL,
    machine_code        TEXT,
    machine_type        TEXT NOT NULL,    -- Excavator|Dumper|Drill|Conveyor|Crusher|Pump|Ventilation|other
    capacity_tph        REAL,
    status              TEXT DEFAULT 'operational',  -- operational|maintenance|breakdown|idle|retired
    last_status_change  TEXT DEFAULT (datetime('now')),
    downtime_start      TEXT,
    downtime_reason     TEXT,
    downtime_hours      REAL DEFAULT 0,
    location_in_mine    TEXT,
    operator_name       TEXT,
    last_service_date   TEXT,
    next_service_date   TEXT,
    notes               TEXT,
    reported_by         TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ms_mine   ON machinery_status(mine_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_ms_status ON machinery_status(status)`);

/* ── 4. Extend disaster_alerts ──────────────────────────────────────── */
console.log('disaster_alerts:');
[
  ['created_by',    'TEXT'],
  ['is_manual',     'INTEGER DEFAULT 0'],
  ['mine_id',       'TEXT'],
  ['sensor_value',  'REAL'],
  ['sensor_unit',   'TEXT'],
  ['threshold_val', 'REAL'],
  ['zone',          'TEXT'],
].forEach(([col, def]) => addCol('disaster_alerts', col, def));

/* ── 5. Seed sample production targets ──────────────────────────────── */
const targetCount = db.prepare('SELECT COUNT(*) as c FROM production_targets').get();
if (targetCount.c === 0) {
  const mines = db.prepare('SELECT id FROM mines LIMIT 6').all();
  const stmt = db.prepare(`INSERT OR IGNORE INTO production_targets (id,mine_id,target_date,period_type,mineral_type,target_tonnes,set_by) VALUES (?,?,?,?,?,?,?)`);
  const today = new Date();
  for (let d = 0; d < 30; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    const dateStr = dt.toISOString().slice(0, 10);
    for (const m of mines) {
      stmt.run(v4(), m.id, dateStr, 'daily', 'Coal', 8000 + Math.round(Math.random() * 4000), null);
    }
  }
  console.log('  Seeded production targets');
}

/* ── 6. Seed sample production records ─────────────────────────────── */
const recordCount = db.prepare('SELECT COUNT(*) as c FROM production_records').get();
if (recordCount.c === 0) {
  const mines = db.prepare('SELECT id FROM mines LIMIT 6').all();
  const targets = db.prepare('SELECT mine_id, target_date, target_tonnes FROM production_targets').all();
  const targetMap = {};
  for (const t of targets) targetMap[`${t.mine_id}_${t.target_date}`] = t.target_tonnes;

  const stmt = db.prepare(`INSERT OR IGNORE INTO production_records
    (id,mine_id,record_date,shift,mineral_type,actual_tonnes,target_tonnes,achievement_pct,
     working_hours,workers_deployed,active_machines,productivity_tph,section,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const today = new Date();
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    const dateStr = dt.toISOString().slice(0, 10);
    for (const m of mines) {
      const target = targetMap[`${m.id}_${dateStr}`] || 8000;
      const factor = 0.65 + Math.random() * 0.50;
      const actual = Math.round(target * factor);
      const achPct = Math.round((actual / target) * 100);
      const hours  = 18 + Math.round(Math.random() * 4);
      const workers = 150 + Math.round(Math.random() * 100);
      const machines = 8 + Math.round(Math.random() * 6);
      const tph = hours > 0 ? Math.round((actual / hours) * 10) / 10 : 0;
      stmt.run(v4(), m.id, dateStr, 'all', 'Coal', actual, target, achPct, hours, workers, machines, tph, 'Main Seam', 'verified', `${dateStr}T20:00:00.000Z`);
    }
  }
  console.log('  Seeded 30-day production records');
}

/* ── 7. Seed sample machinery ───────────────────────────────────────── */
const machCount = db.prepare('SELECT COUNT(*) as c FROM machinery_status').get();
if (machCount.c === 0) {
  const mines = db.prepare('SELECT id FROM mines LIMIT 2').all();
  const machines = [
    ['Excavator E-01',  'EXC-01', 'Excavator',  450,  'operational'],
    ['Excavator E-02',  'EXC-02', 'Excavator',  450,  'maintenance', 'Hydraulic system repair'],
    ['Dumper D-01',     'DMP-01', 'Dumper',     120,  'operational'],
    ['Dumper D-02',     'DMP-02', 'Dumper',     120,  'operational'],
    ['Dumper D-03',     'DMP-03', 'Dumper',     120,  'breakdown',   'Tyre blowout'],
    ['Drill Rig R-01',  'DRL-01', 'Drill',      null, 'operational'],
    ['Conveyor C-01',   'CNV-01', 'Conveyor',   800,  'operational'],
    ['Crusher CR-01',   'CRS-01', 'Crusher',    600,  'operational'],
    ['Pump P-01',       'PMP-01', 'Pump',       null, 'operational'],
    ['Ventilation V-01','VNT-01', 'Ventilation',null, 'operational'],
  ];
  const stmt = db.prepare(`INSERT INTO machinery_status (id,mine_id,machine_name,machine_code,machine_type,capacity_tph,status,downtime_reason,created_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`);
  for (const mine of mines) {
    for (const [name, code, type, cap, status, reason] of machines) {
      stmt.run(v4(), mine.id, name, code, type, cap || null, status, reason || null);
    }
  }
  console.log('  Seeded machinery status');
}

db.pragma('foreign_keys = ON');
db.close();
console.log('\n✅ Production migration complete\n');
