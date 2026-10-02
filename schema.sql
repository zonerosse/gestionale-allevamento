-- Database del gestionale: incollare nella console di D1 una sola volta
CREATE TABLE IF NOT EXISTS store (id TEXT PRIMARY KEY, version INTEGER NOT NULL, json TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL);

-- Contratti firmati dai proprietari (la tabella si crea anche da sola)
CREATE TABLE IF NOT EXISTS contracts (dog TEXT PRIMARY KEY, owner TEXT, json TEXT, signed_at TEXT);
