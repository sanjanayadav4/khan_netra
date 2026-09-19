/**
 * Safe migration: create worker_attendance table if it does not exist.
 * Run once: node migrate_attendance.js
 */
'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, 'khannetra.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS worker_attendance (
  id                 TEXT PRIMARY KEY,
  mine_id            TEXT NOT NULL REFERENCES mines(id),
  worker_id          TEXT,                 -- employee ID / badge number
  worker_name        TEXT NOT NULL,
  contractor_id      TEXT REFERENCES contractors(id),
  shift              TEXT NOT NULL DEFAULT 'day',  -- day | night | general
  work_area          TEXT,
  attendance_date    TEXT NOT NULL,        -- YYYY-MM-DD
  check_in_time      TEXT,                -- HH:MM or full ISO
  check_out_time     TEXT,
  status             TEXT NOT NULL DEFAULT 'present', -- present | absent | late | half_day | on_leave
  latitude           REAL,
  longitude          REAL,
  gps_accuracy       INTEGER,
  recorded_by        TEXT REFERENCES users(id),
  device_info        TEXT,                -- browser/device string for field context
  is_offline_sync    INTEGER DEFAULT 0,   -- 1 if record was created offline and synced later
  client_id          TEXT UNIQUE,         -- idempotency key from offline queue
  remarks            TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);
`);

// Index for common query patterns
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_mine_date ON worker_attendance(mine_id, attendance_date)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_worker    ON worker_attendance(worker_id)`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_client_id ON worker_attendance(client_id)`); } catch {}

const cols = db.prepare('PRAGMA table_info(worker_attendance)').all().map(c => c.name);
console.log('✅ worker_attendance table ready');
console.log('   Columns:', cols.join(', '));
db.close();
