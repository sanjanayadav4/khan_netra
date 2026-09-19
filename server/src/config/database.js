/**
 * KhanNetra – SQLite adapter (no PostgreSQL needed)
 * Exposes the same query(sql, params) => { rows } API as pg.
 */
const path = require('path');
let _db = null;

function getDB() {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '../../khannetra.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

// Translate pg SQL → SQLite SQL
function translate(sql) {
  return sql
    .replace(/\$(\d+)/g, '?')
    .replace(/ILIKE/gi, 'LIKE')
    .replace(/::[\w\[\]]+/g, '')
    .replace(/\buuid_generate_v4\(\)/gi,
      `(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||` +
      `substr(lower(hex(randomblob(2))),2)||'-'||` +
      `substr('89ab',abs(random())%4+1,1)||` +
      `substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))`)
    .replace(/NOW\s*\(\)/gi, "datetime('now')")
    .replace(/CURRENT_DATE/gi, "date('now')")
    .replace(/DATE_TRUNC\('month'\s*,\s*([^)]+)\)/gi, "strftime('%Y-%m-01',$1)")
    .replace(/DATE_TRUNC\('year'\s*,\s*([^)]+)\)/gi,  "strftime('%Y-01-01',$1)")
    .replace(/DATE_TRUNC\('day'\s*,\s*([^)]+)\)/gi,   "date($1)")
    .replace(/DATE_TRUNC\('hour'\s*,\s*([^)]+)\)/gi,  "strftime('%Y-%m-%dT%H:00:00',$1)")
    .replace(/EXTRACT\s*\(\s*DAY\s+FROM\s+\(([^)]+)\s+-\s+([^)]+)\)\)/gi,
      "CAST(julianday($1)-julianday($2) AS INTEGER)")
    .replace(/datetime\('now'\)\s*-\s*INTERVAL\s*'(\d+)\s+(\w+)'/gi,
      (_,n,u)=>`datetime('now','-${n} ${u}')`)
    .replace(/datetime\('now'\)\s*-\s*'(\d+)\s+(\w+)'/gi,
      (_,n,u)=>`datetime('now','-${n} ${u}')`)
    .replace(/date\('now'\)\s*\+\s*INTERVAL\s*'(\d+)\s+(\w+)'/gi,
      (_,n,u)=>`date('now','+${n} ${u}')`)
    .replace(/NOW\s*\(\)\s*-\s*INTERVAL\s*'([^']+)'/gi, (_,iv)=>{
      const m = iv.match(/(\d+)\s*(\w+)/);
      return m ? `datetime('now','-${m[1]} ${m[2]}')` : `datetime('now','-1 month')`;
    })
    .replace(/INTERVAL\s*'([^']+)'/gi, (_,iv)=>{
      const m = iv.match(/(\d+)\s*(\w+)/);
      return m ? `datetime('now','+${m[1]} ${m[2]}')` : `datetime('now')`;
    })
    .replace(/DISTINCT ON \([^)]+\)/gi, '')          // no DISTINCT ON in SQLite
    .replace(/NULLIF\(([^,]+),\s*0\)/gi, 'NULLIF($1,0)')
    .replace(/\bBOOLEAN\b/gi, 'INTEGER')
    .replace(/\bTEXT\[\]/gi, 'TEXT')
    .replace(/\bJSON[Bb]\b/gi, 'TEXT')
    .replace(/\bSERIAL\b/gi, 'INTEGER')
    .replace(/DEFAULT uuid_generate_v4\(\)/gi, '')
    .replace(/ON CONFLICT DO NOTHING/gi, 'OR IGNORE INTO')
    .replace(/INSERT OR IGNORE INTO INTO/gi, 'INSERT OR IGNORE INTO');
}

const query = async (sql, params = []) => {
  const db = getDB();
  const sqliteSql = translate(sql);
  try {
    const upper = sqliteSql.trim().toUpperCase().replace(/\s+/g,' ');
    const isRead = upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('PRAGMA');

    if (isRead) {
      const rows = db.prepare(sqliteSql).all(...params);
      return { rows };
    }

    const hasReturning = /RETURNING/i.test(sqliteSql);
    const withoutRet   = sqliteSql.replace(/\s*RETURNING\s+[\s\S]*/i, '');
    const info         = db.prepare(withoutRet).run(...params);

    if (hasReturning) {
      const tbl = (withoutRet.match(/(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE)\s+(\w+)/i)||[])[1];
      if (tbl) {
        // For UPDATE, try to re-fetch the affected row via last param (usually the id)
        const lastParam = params[params.length - 1];
        const colMatch  = withoutRet.match(/WHERE\s+(\w+)\s*=\s*\?/i);
        const col       = colMatch ? colMatch[1] : 'rowid';
        let row = null;
        try {
          row = db.prepare(`SELECT * FROM ${tbl} WHERE ${col} = ?`).get(lastParam);
        } catch {
          try { row = db.prepare(`SELECT * FROM ${tbl} WHERE rowid = ?`).get(info.lastInsertRowid); } catch {}
        }
        return { rows: row ? [row] : [], rowCount: info.changes };
      }
    }
    return { rows: [], rowCount: info.changes };
  } catch (err) {
    console.error('DB error:', err.message, '\nSQL:', sqliteSql.slice(0,300));
    throw err;
  }
};

const getClient = async () => {
  let done = false;
  return { query, release: () => { done = true; } };
};

// Synchronous transaction helper
const runTransaction = (fn) => {
  const db = getDB();
  return db.transaction(fn)();
};

module.exports = { query, getClient, pool: { query, end: async()=>{} }, runTransaction, getDB };
