import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, dbPath } from './paths.js';
import { ensureDir } from './util.js';

export type Db = Database.Database;

export function openDb(file = dbPath()): Db {
  ensureDir(path.dirname(file));
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function initStore(): string {
  ensureDir(dataDir());
  const db = openDb();
  db.close();
  fs.mkdirSync(path.join(dataDir(), 'digests'), { recursive: true });
  fs.mkdirSync(path.join(dataDir(), 'gbrain'), { recursive: true });
  return dbPath();
}

export function migrate(db: Db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  project TEXT,
  provider TEXT,
  model TEXT,
  workflow TEXT,
  cwd TEXT,
  git_remote TEXT,
  git_branch TEXT,
  git_commit TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_tokens INTEGER DEFAULT 1,
  estimated_cost_usd REAL DEFAULT 0,
  error TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project);
CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  project TEXT,
  title TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  privacy_mode TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conversations_started ON conversations(started_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_chars INTEGER NOT NULL,
  content_redacted TEXT,
  content_raw TEXT,
  metadata TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS insight_candidates (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  project TEXT,
  confidence REAL NOT NULL,
  sensitivity TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source_ids TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_insights_date ON insight_candidates(date);
CREATE INDEX IF NOT EXISTS idx_insights_status ON insight_candidates(status);
`);
}
