-- Database del gestionale: incollare nella console di D1 una sola volta
CREATE TABLE IF NOT EXISTS store (id TEXT PRIMARY KEY, version INTEGER NOT NULL, json TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL);
