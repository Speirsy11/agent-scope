import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { ingestConversationFile } from './ingest.js';
import { exportGbrain, runInsights } from './insights.js';

describe('insights', () => {
  it('extracts low-risk memory candidates and exports gbrain markdown', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentscope-test-'));
    process.env.AGENTSCOPE_HOME = dir;
    const conv = path.join(dir, 'conv.json');
    fs.writeFileSync(conv, JSON.stringify({ source: 'test', project: 'AgentScope', privacy_mode: 'redacted_text', messages: [{ role: 'user', content: 'We decided AgentScope should stay local-first.', created_at: '2026-05-22T12:00:00.000Z' }] }));
    const db = openDb(path.join(dir, 'db.sqlite'));
    ingestConversationFile(db, conv);
    const result = runInsights(db, '2026-05-22');
    expect(result.inserted).toBe(1);
    const exported = exportGbrain(db, true);
    expect(exported.count).toBe(1);
    expect(fs.readFileSync(exported.file, 'utf8')).toContain('local-first');
    db.close();
  });
});
