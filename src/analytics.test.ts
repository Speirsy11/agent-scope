import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportAnalytics } from './analytics.js';
import { openDb } from './db.js';
import { ingestClaudeJsonl, ingestGeminiJsonl } from './ingest.js';

describe('analytics exports and provider imports', () => {
  it('ingests Claude/Gemini usage JSONL and writes DuckDB helpers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentscope-analytics-'));
    process.env.AGENTSCOPE_HOME = dir;
    const claude = path.join(dir, 'claude.jsonl');
    const gemini = path.join(dir, 'gemini.jsonl');
    fs.writeFileSync(claude, `${JSON.stringify({ id: 'claude-1', project: 'AgentScope', model: 'claude-sonnet-4', usage: { input_tokens: 100, output_tokens: 50 }, timestamp: '2026-05-22T12:00:00.000Z' })}\n`);
    fs.writeFileSync(gemini, `${JSON.stringify({ id: 'gemini-1', project: 'AgentScope', model: 'gemini-2.5-pro', usage: { inputTokens: 25, outputTokens: 75 }, timestamp: '2026-05-22T13:00:00.000Z' })}\n`);

    const db = openDb(path.join(dir, 'db.sqlite'));
    expect(ingestClaudeJsonl(db, claude).inserted).toBe(1);
    expect(ingestGeminiJsonl(db, gemini).inserted).toBe(1);

    const exported = exportAnalytics(db, { format: 'duckdb-sql' });
    expect(fs.existsSync(exported.file)).toBe(true);
    expect(fs.readFileSync(exported.file, 'utf8')).toContain('read_csv_auto');
    expect(fs.existsSync((exported as any).companionCsv)).toBe(true);
    db.close();
  });
});
