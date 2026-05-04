const Database = require("better-sqlite3");
const db = new Database("innerecho.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    plan TEXT DEFAULT "free",
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS mood_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    emoji_score INTEGER,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    role TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS circles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS circle_members (
    circle_id INTEGER,
    user_id INTEGER,
    PRIMARY KEY(circle_id, user_id),
    FOREIGN KEY(circle_id) REFERENCES circles(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS circle_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    circle_id INTEGER,
    user_id INTEGER,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(circle_id) REFERENCES circles(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

module.exports = db;
