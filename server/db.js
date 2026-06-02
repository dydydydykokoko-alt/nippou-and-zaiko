const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'diary.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS diary (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    field_name TEXT,
    work_types TEXT,
    start_time TEXT,
    duration INTEGER,
    notes TEXT,
    materials TEXT,
    raw_message TEXT,
    created_at TEXT NOT NULL
  )
`);

function genId() {
  return crypto.randomBytes(6).toString('hex');
}

function insertDiary(entry) {
  const id = genId();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO diary (id, date, field_name, work_types, start_time, duration, notes, materials, raw_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    entry.date,
    entry.field_name || '',
    Array.isArray(entry.work_types) ? entry.work_types.join(',') : (entry.work_types || ''),
    entry.start_time || '',
    entry.duration || 0,
    entry.notes || '',
    JSON.stringify(entry.materials || []),
    entry.raw_message || '',
    now
  );
  return id;
}

function listDiary({ limit = 50, offset = 0 } = {}) {
  return db.prepare('SELECT * FROM diary ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset)
    .map(row => ({
      ...row,
      work_types: row.work_types ? row.work_types.split(',') : [],
      materials: JSON.parse(row.materials || '[]'),
    }));
}

function getDiary(id) {
  const row = db.prepare('SELECT * FROM diary WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    work_types: row.work_types ? row.work_types.split(',') : [],
    materials: JSON.parse(row.materials || '[]'),
  };
}

module.exports = { insertDiary, listDiary, getDiary };
