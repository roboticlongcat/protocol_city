const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "protocol-city.db"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_states (
  user_id INTEGER PRIMARY KEY,
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  z REAL DEFAULT 0,
  rot_y REAL DEFAULT 0,
  zone TEXT DEFAULT 'spawn',
  flags TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  z REAL DEFAULT 0,
  radius REAL DEFAULT 8,
  color TEXT DEFAULT '#ffffff',
  data TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS npcs (
  id INTEGER PRIMARY KEY,
  zone_id INTEGER,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  model TEXT DEFAULT 'qwen2.5:3b',
  personality TEXT DEFAULT 'friendly'
);

CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS mission_progress (
  user_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  step INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, mission_id)
);

CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  method TEXT,
  path TEXT,
  status INTEGER,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS npc_dialogues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  npc_id INTEGER,
  role TEXT,
  content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;