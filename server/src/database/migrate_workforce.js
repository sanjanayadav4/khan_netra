 /**
 * KhanNetra — Workforce Migration
 * Adds missing columns to existing tables and creates
 * safety_certifications + worker_certifications tables.
 * Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN OR IGNORE patterns).
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../../khannetra.db');
const db     = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

function addColIfMissing(table, col, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
    console.log(`  + ${table}.${col}`);
  }
}

console.log('\n=== KhanNetra Workforce Migration ===\n');

/* ── 1. Extend workers table ──────────────────────────────────────────── */
console.log('workers:');
[
  ['blood_group',           'TEXT'],
  ['training_status',       "TEXT DEFAULT 'not_started'"],  // not_started|in_progress|completed|expired
  ['safety_training_date',  'TEXT'],
  ['training_expiry_date',  'TEXT'],
  ['medical_fitness_date',  'TEXT'],
  ['medical_expiry_date',   'TEXT'],
  ['qr_code',               'TEXT'],  // UUID used as QR payload
  ['biometric_id',          'TEXT'],
  ['address',               'TEXT'],
  ['district',              'TEXT'],
  ['state',                 'TEXT'],
].forEach(([col, def]) => addColIfMissing('workers', col, def));

/* ── 2. Extend contractors table ─────────────────────────────────────── */
console.log('contractors:');
[
  ['contract_value',        'REAL'],
  ['performance_rating',    'REAL DEFAULT 0'],  // 0–5
  ['expiry_alert_days',     'INTEGER DEFAULT 30'],
  ['expiry_alert_sent',     'INTEGER DEFAULT 0'],
  ['total_violations',      'INTEGER DEFAULT 0'],
  ['total_incidents',       'INTEGER DEFAULT 0'],
  ['penalty_amount',        'REAL DEFAULT 0'],
  ['remarks',               'TEXT'],
].forEach(([col, def]) => addColIfMissing('contractors', col, def));

/* ── 3. safety_certifications — types of certs (master list) ─────────── */
console.log('safety_certifications:');
db.exec(`
  CREATE TABLE IF NOT EXISTS safety_certifications (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    category     TEXT NOT NULL,    -- 'safety'|'technical'|'medical'|'regulatory'
    description  TEXT,
    validity_months INTEGER DEFAULT 12,
    is_mandatory INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
  )
`);

/* ── 4. worker_certifications — per-worker cert records ──────────────── */
console.log('worker_certifications:');
db.exec(`
  CREATE TABLE IF NOT EXISTS worker_certifications (
    id                 TEXT PRIMARY KEY,
    worker_id          TEXT NOT NULL,
    cert_name          TEXT NOT NULL,
    cert_category      TEXT,           -- 'safety'|'technical'|'medical'|'regulatory'
    issuing_authority  TEXT,
    certificate_number TEXT,
    issue_date         TEXT,
    expiry_date        TEXT,
    status             TEXT DEFAULT 'valid',  -- valid|expired|revoked|pending
    document_url       TEXT,
    notes              TEXT,
    created_by         TEXT,
    created_at         TEXT DEFAULT (datetime('now')),
    updated_at         TEXT DEFAULT (datetime('now'))
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_wc_worker ON worker_certifications(worker_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_wc_expiry ON worker_certifications(expiry_date)`);

/* ── 5. contractor_workers junction (live count) — view ─────────────── */
// Just an index — no separate table needed; workers.contractor_id is the FK
db.exec(`CREATE INDEX IF NOT EXISTS idx_workers_contractor ON workers(contractor_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_workers_mine_status ON workers(mine_id, status)`);

/* ── 6. Seed master certification types ──────────────────────────────── */
const { v4 } = require('uuid');
const existing = db.prepare(`SELECT COUNT(*) as c FROM safety_certifications`).get();
if (existing.c === 0) {
  const certStmt = db.prepare(`
    INSERT OR IGNORE INTO safety_certifications
      (id, name, category, description, validity_months, is_mandatory)
    VALUES (?,?,?,?,?,?)`);
  const certs = [
    [v4(), 'Gas Testing Certificate',       'safety',     'Authority to test for mine gases',                12, 1],
    [v4(), 'First Aid Certificate',         'safety',     'First aid and emergency response',                24, 1],
    [v4(), 'Shot Firer Certificate',        'technical',  'Certified to handle explosives in mines',         12, 1],
    [v4(), 'Winding Engine Driver Cert',    'technical',  'Certified winding engine operator',               36, 0],
    [v4(), 'Mine Foreman Certificate',      'regulatory', 'DGMS Mine Foreman statutory certificate',         60, 0],
    [v4(), 'Overman Certificate',           'regulatory', 'DGMS Overman statutory certificate',             60, 0],
    [v4(), 'Mining Sardar Certificate',     'regulatory', 'DGMS Mining Sardar statutory certificate',        60, 0],
    [v4(), 'Medical Fitness Certificate',   'medical',    'Annual medical fitness for underground work',     12, 1],
    [v4(), 'PPE Training',                  'safety',     'Personal Protective Equipment usage training',   12, 1],
    [v4(), 'Fire Fighting Training',        'safety',     'Mine fire fighting certification',                24, 0],
    [v4(), 'Electrical Safety Certificate', 'technical',  'Electrical safety for mines',                    24, 0],
    [v4(), 'Machinery Operation Cert',      'technical',  'Certified heavy machinery operator',             36, 0],
    [v4(), 'Rescue Team Certificate',       'safety',     'Mine rescue team member certification',           12, 0],
  ];
  for (const c of certs) certStmt.run(...c);
  console.log(`  Seeded ${certs.length} certification types`);
}

/* ── 7. Backfill qr_code for existing workers ────────────────────────── */
const noQr = db.prepare(`SELECT id FROM workers WHERE qr_code IS NULL OR qr_code = ''`).all();
if (noQr.length > 0) {
  const upd = db.prepare(`UPDATE workers SET qr_code=? WHERE id=?`);
  for (const w of noQr) upd.run(v4(), w.id);
  console.log(`  Backfilled qr_code for ${noQr.length} workers`);
}

db.pragma('foreign_keys = ON');
db.close();
console.log('\n✅ Migration complete\n');
