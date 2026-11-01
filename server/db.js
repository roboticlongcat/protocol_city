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
  zone TEXT DEFAULT 'lobby',
  flags TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  max_players INTEGER DEFAULT 3,
  color TEXT DEFAULT '#ffffff',
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  z REAL DEFAULT 0,
  radius REAL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS department_assignments (
  user_id INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL,
  role TEXT DEFAULT 'junior',
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS npcs (
  id INTEGER PRIMARY KEY,
  department_id INTEGER,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  personality TEXT DEFAULT 'friendly',
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT DEFAULT 'easy',
  reward_points INTEGER DEFAULT 10,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS task_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  result TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT,
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

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS team_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'pipeline',
  reward_points INTEGER DEFAULT 100,
  status TEXT DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS project_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  department_id INTEGER NOT NULL,
  order_index INTEGER DEFAULT 0,
  activity_id INTEGER,
  depends_on_step_id INTEGER,
  status TEXT DEFAULT 'locked',
  assigned_user_id INTEGER,
  done_at TEXT,
  FOREIGN KEY (project_id) REFERENCES team_projects(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (activity_id) REFERENCES activities(id)
);

CREATE TABLE IF NOT EXISTS project_participants (
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS world_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL DEFAULT '{}'
);
`);
// Безопасные миграции новых полей (SQLite не поддерживает IF NOT EXISTS в ALTER)
for (const sql of [
  "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'",
  "ALTER TABLE npcs ADD COLUMN behavior TEXT DEFAULT '{}'",
]) {
  try { db.exec(sql); } catch { /* колонка уже есть */ }
}
module.exports = db;