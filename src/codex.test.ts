import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestCodexLocal } from './codex.js';
import { openDb } from './db.js';

describe('Codex local import', () => {
  it('imports thread usage from Codex state SQLite', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentscope-codex-'));
    process.env.AGENTSCOPE_HOME = dir;
    const stateDb = path.join(dir, 'state_5.sqlite');
    const source = new Database(stateDb);
    source.exec(`
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  rollout_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  cwd TEXT NOT NULL,
  title TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  git_sha TEXT,
  git_branch TEXT,
  git_origin_url TEXT,
  cli_version TEXT NOT NULL DEFAULT '',
  agent_nickname TEXT,
  agent_role TEXT,
  model TEXT,
  reasoning_effort TEXT,
  thread_source TEXT,
  preview TEXT NOT NULL DEFAULT ''
);
`);
    source.prepare(`INSERT INTO threads (id, rollout_path, created_at, updated_at, source, model_provider, cwd, title, tokens_used, git_sha, git_branch, git_origin_url, cli_version, model, reasoning_effort, thread_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('thread-1', '/tmp/thread.jsonl', 1_780_000_000, 1_780_000_060, 'codex', 'openai', '/Users/me/project-a', 'private title', 12345, 'abc', 'main', 'git@example.com:me/project-a.git', '1.2.3', 'gpt-5.5', 'medium', 'cli');
    source.close();

    const db = openDb(path.join(dir, 'agentscope.db'));
    const result = ingestCodexLocal(db, { stateDb, since: '2026-01-01' });
    expect(result.inserted).toBe(1);
    const run = db.prepare(`SELECT source, project, provider, model, total_tokens, estimated_cost_usd FROM runs`).get() as any;
    expect(run).toMatchObject({ source: 'codex-local', project: 'project-a', provider: 'openai', model: 'gpt-5.5', total_tokens: 12345, estimated_cost_usd: 0 });
    db.close();
  });
});
