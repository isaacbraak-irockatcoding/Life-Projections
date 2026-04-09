const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'lifesim.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Run migrations (skip PRAGMA lines already run above)
const migrationSql = fs.readFileSync(
  path.join(__dirname, 'migrations', '001_init.sql'),
  'utf8'
);
// Execute each statement individually (node:sqlite doesn't support multi-statement exec with PRAGMA)
migrationSql
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('PRAGMA'))
  .forEach(s => { try { db.exec(s + ';'); } catch {} });

// ── Compatibility shim: node:sqlite uses different API than better-sqlite3 ──
// better-sqlite3: db.prepare(sql).run(...), .get(...), .all(...)
// node:sqlite:     db.prepare(sql).run(...), .get(...), .all(...)  ← same!
// The main difference: node:sqlite .run() returns {changes, lastInsertRowid}

module.exports = db;
