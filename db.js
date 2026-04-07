/**
 * db.js — Lightweight JSON file store
 * ─────────────────────────────────────
 * Drop-in replacement: swap readDB/writeDB for your preferred DB driver
 * (SQLite, PostgreSQL, MongoDB) without touching any route code.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const SCHEMA = {
  users: [],   // { id, name, email, passwordHash, createdAt, role }
  notes: [],   // { id, title, subject, description, filename, uploaderId, uploaderName, downloads, createdAt, status }
  // Leaderboard is derived at query time from users + notes — no extra table needed.
};

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(SCHEMA, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
