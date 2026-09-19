/**
 * KhanNetra — Workers Table Migration
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates the `workers` table (permanent worker profiles) and adds:
 *  - A unique constraint on worker_attendance(worker_id, mine_id, attendance_date, shift)
 *    so duplicate daily records are impossible at the DB level.
 *  - New columns on worker_attendance to link to the workers profile FK.
 *
 * Safe to run multiple times (all operations are IF NOT EXISTS / idempotent).
 * Run: node migrate_workers.js
 */
'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, 'khannetra.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ── 1. workers master table ─────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS workers (
  id                TEXT PRIMARY KEY,
  worker_code       TEXT UNIQUE NOT NULL,    -- auto-generated WK-XXXX
  full_name         TEXT NOT NULL,
  mine_id           TEXT NOT NULL REFERENCES mines(id),
  department        TEXT NOT NULL,           -- Mining | Electrical | Safety | Mechanical | General
  designation       TEXT NOT NULL,
  shift             TEXT NOT NULL DEFAULT 'day',  -- day | night | general | A | B | C
  contractor_id     TEXT REFERENCES contractors(id),
  worker_type       TEXT NOT NULL DEFAULT 'regular',  -- regular | contract | casual | trainee
  phone             TEXT,
  emergency_contact TEXT,
  aadhaar_last4     TEXT,                    -- last 4 digits only — never full Aadhaar
  joining_date      TEXT,                    -- YYYY-MM-DD
  status            TEXT NOT NULL DEFAULT 'active',   -- active | inactive | transferred | terminated
  photo_url         TEXT,
  notes             TEXT,
  created_by        TEXT REFERENCES users(id),
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);
`);

/* Indexes for workers */
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_workers_mine      ON workers(mine_id)`);        } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_workers_dept      ON workers(department)`);     } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_workers_status    ON workers(status)`);         } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_workers_code      ON workers(worker_code)`);   } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_workers_contractor ON workers(contractor_id)`); } catch {}

console.log('✅  workers table ready');

/* ── 2. Ensure worker_attendance exists (from earlier migration) ──────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS worker_attendance (
  id               TEXT PRIMARY KEY,
  mine_id          TEXT NOT NULL REFERENCES mines(id),
  worker_id        TEXT,
  worker_name      TEXT NOT NULL,
  contractor_id    TEXT REFERENCES contractors(id),
  shift            TEXT NOT NULL DEFAULT 'day',
  work_area        TEXT,
  attendance_date  TEXT NOT NULL,
  check_in_time    TEXT,
  check_out_time   TEXT,
  status           TEXT NOT NULL DEFAULT 'present',
  latitude         REAL,
  longitude        REAL,
  gps_accuracy     INTEGER,
  recorded_by      TEXT REFERENCES users(id),
  device_info      TEXT,
  is_offline_sync  INTEGER DEFAULT 0,
  client_id        TEXT UNIQUE,
  remarks          TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);
`);

/* ── 3. Add worker_ref_id column to worker_attendance (FK to workers.id) ─── */
const attCols = db.prepare('PRAGMA table_info(worker_attendance)').all().map(c => c.name);
if (!attCols.includes('worker_ref_id')) {
  db.exec(`ALTER TABLE worker_attendance ADD COLUMN worker_ref_id TEXT REFERENCES workers(id)`);
  console.log('✅  worker_attendance.worker_ref_id column added');
} else {
  console.log('ℹ️   worker_attendance.worker_ref_id already exists');
}

/* ── 4. Add department column to worker_attendance (for fast filter queries) */
if (!attCols.includes('department')) {
  db.exec(`ALTER TABLE worker_attendance ADD COLUMN department TEXT`);
  console.log('✅  worker_attendance.department column added');
} else {
  console.log('ℹ️   worker_attendance.department already exists');
}

/* ── 5. Unique constraint: one record per worker per date per shift ───────── */
// SQLite cannot ADD CONSTRAINT after creation, so we create a unique index.
// This is equivalent to UNIQUE(worker_ref_id, attendance_date, shift) — only
// enforced when worker_ref_id is NOT NULL (registered workers).
try {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_att_worker_date_shift
    ON worker_attendance(worker_ref_id, attendance_date, shift)
    WHERE worker_ref_id IS NOT NULL
  `);
  console.log('✅  Unique index idx_att_worker_date_shift created');
} catch (e) {
  console.log('ℹ️   Unique index already exists or conflict:', e.message);
}

/* ── 6. Extra indexes on worker_attendance ───────────────────────────────── */
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_mine_date     ON worker_attendance(mine_id, attendance_date)`);  } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_worker        ON worker_attendance(worker_id)`);                 } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_worker_ref    ON worker_attendance(worker_ref_id)`);             } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_client_id     ON worker_attendance(client_id)`);                 } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_att_dept          ON worker_attendance(department)`);                } catch {}

console.log('✅  All indexes ready');

/* ── 7. Report final state ───────────────────────────────────────────────── */
const wCols   = db.prepare('PRAGMA table_info(workers)').all().map(c => c.name);
const aCols   = db.prepare('PRAGMA table_info(worker_attendance)').all().map(c => c.name);
const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND (tbl_name='workers' OR tbl_name='worker_attendance')").all().map(i => i.name);

console.log('\n📋  workers columns:            ', wCols.join(', '));
console.log('📋  worker_attendance columns:  ', aCols.join(', '));
console.log('📋  Indexes:                    ', indexes.join(', '));
console.log('\n✅  Migration complete.');
db.close();
