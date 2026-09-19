/**
 * Safe migration: add location_in_mine column to inspections table.
 * Skips if column already exists.
 */
'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'khannetra.db'));

try {
  db.exec('ALTER TABLE inspections ADD COLUMN location_in_mine TEXT');
  console.log('✅ Added column: inspections.location_in_mine');
} catch (e) {
  if (e.message && e.message.toLowerCase().includes('duplicate')) {
    console.log('ℹ️  Column location_in_mine already exists — skipping');
  } else {
    console.error('Migration error:', e.message);
    process.exit(1);
  }
}

// Verify
const cols = db.prepare('PRAGMA table_info(inspections)').all().map(c => c.name);
console.log('Current inspections columns:', cols.join(', '));
db.close();
