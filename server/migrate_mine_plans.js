/**
 * KhanNetra — Mine Plans Migration
 * Creates mine_plans and mine_plan_layers tables.
 * Safe to run multiple times (IF NOT EXISTS / try-catch on indexes).
 */
'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, 'khannetra.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ── mine_plans ─────────────────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS mine_plans (
  id                    TEXT PRIMARY KEY,
  mine_id               TEXT NOT NULL REFERENCES mines(id),

  -- Identity
  plan_title            TEXT NOT NULL,
  plan_type             TEXT NOT NULL DEFAULT 'General Layout',
  -- General Layout | Ventilation | Electrical | Water/Drainage |
  -- Emergency Escape | Fire Risk | Working Sections | Other

  -- Versioning
  version_number        TEXT NOT NULL DEFAULT '1.0',
  version_label         TEXT,
  previous_version_id   TEXT REFERENCES mine_plans(id),
  change_description    TEXT,

  -- File (original uploaded document)
  file_name             TEXT NOT NULL,
  file_path             TEXT NOT NULL,
  file_size             INTEGER,
  mime_type             TEXT,

  -- OCR / AI extracted metadata (never replaces original)
  ocr_status            TEXT DEFAULT 'pending',
  -- pending | processing | complete | failed | not_applicable
  ocr_extracted_data    TEXT,   -- JSON: mine name, seams, shaft names, etc.
  ocr_confidence        REAL,
  ocr_warnings          TEXT,   -- JSON array of warnings

  -- Approval / Verification (official plans must be human-verified)
  approval_status       TEXT NOT NULL DEFAULT 'pending_review',
  -- pending_review | under_review | approved | rejected | superseded
  approved_by           TEXT REFERENCES users(id),
  approved_at           TEXT,
  rejection_reason      TEXT,
  is_current_version    INTEGER DEFAULT 0,  -- 1 = this is the active/current plan

  -- Access control
  is_restricted         INTEGER DEFAULT 1,  -- restricted mine info
  allowed_roles         TEXT DEFAULT '["admin","government_officer","mine_manager","inspector","safety_officer"]',

  -- Offline download tracking
  download_count        INTEGER DEFAULT 0,
  last_downloaded_at    TEXT,

  -- Audit
  uploaded_by           TEXT NOT NULL REFERENCES users(id),
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now'))
);
`);

/* ── mine_plan_layers ─────────────────────────────────────────────────────
   Stores the interactive layer annotations (tunnels, shafts, hazard zones, etc.)
   Each annotation is a JSON geometry + metadata record.
   ─────────────────────────────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS mine_plan_layers (
  id            TEXT PRIMARY KEY,
  plan_id       TEXT NOT NULL REFERENCES mine_plans(id) ON DELETE CASCADE,

  layer_type    TEXT NOT NULL,
  -- tunnel | shaft | entry_exit | working_area | ventilation_intake
  -- ventilation_return | emergency_escape | electrical | water_drainage
  -- fire_risk | hazard_zone | inspection_point | safety_observation
  -- incident_location | assembly_point | other

  label         TEXT,
  description   TEXT,

  -- Geometry stored as JSON { type, coordinates } — simple polygon/point/polyline
  -- Coordinates are normalised 0-1 fractions of the plan image dimensions
  geometry      TEXT NOT NULL,   -- JSON

  -- Style
  color         TEXT DEFAULT '#f59e0b',
  opacity       REAL DEFAULT 0.6,
  icon          TEXT,

  -- Link to existing KhanNetra records
  linked_type   TEXT,   -- inspection | incident | violation | field_report | corrective_action
  linked_id     TEXT,

  -- Status
  is_active     INTEGER DEFAULT 1,

  -- Audit
  created_by    TEXT REFERENCES users(id),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
`);

/* ── mine_plan_access_logs ────────────────────────────────────────────────
   Security audit: who viewed/downloaded which plan version.
   ─────────────────────────────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS mine_plan_access_logs (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES mine_plans(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,  -- view | download | print | share | edit_layer | approve | reject
  ip_address  TEXT,
  device_info TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
`);

/* ── Indexes ─────────────────────────────────────────────────────────────*/
const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_mine_plans_mine_id     ON mine_plans(mine_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_plans_status      ON mine_plans(approval_status)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_plans_current     ON mine_plans(mine_id, is_current_version)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_plan_layers_plan  ON mine_plan_layers(plan_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_plan_layers_type  ON mine_plan_layers(layer_type)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_plan_access_plan  ON mine_plan_access_logs(plan_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_plan_access_user  ON mine_plan_access_logs(user_id)`,
];
for (const sql of indexes) {
  try { db.exec(sql); } catch (e) { console.warn('Index skip:', e.message); }
}

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'mine_plan%'"
).all().map(t => t.name);

console.log('✅ Mine plan tables ready:', tables.join(', '));

const pCols = db.prepare('PRAGMA table_info(mine_plans)').all().map(c => c.name);
console.log('   mine_plans columns:', pCols.join(', '));

db.close();
