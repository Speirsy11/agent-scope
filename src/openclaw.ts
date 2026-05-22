import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { Db } from './db.js';
import { archivePath } from './paths.js';
import { redactText } from './redact.js';
import { appendJsonl, jsonStringify, nowIso, parseJson, sha256, sinceToIso } from './util.js';

export type OpenClawImportOptions = {
  dir?: string;
  agent?: string;
  since?: string;
  privacyMode?: 'metadata_only' | 'redacted_text' | 'raw_text';
  includeAll?: boolean;
  includeUsageCache?: boolean;
};

type Message = { role: string; content: string; created_at: string; metadata?: Record<string, unknown> };

function defaultSessionDir(agent = 'main') {
  return path.join(os.homedir(), '.openclaw', 'agents', agent, 'sessions');
}

function readJsonl(file: string): any[] {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function isSessionJsonl(file: string, includeAll = false) {
  const base = path.basename(file);
  if (!base.endsWith('.jsonl')) return false;
  if (base.includes('.trajectory.')) return false;
  if (includeAll) return true;
  if (base.includes('.checkpoint.')) return false;
  if (base.includes('.deleted.')) return false;
  if (base.includes('.reset.')) return false;
  return true;
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const part of content as any[]) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' && typeof part.text === 'string') parts.push(part.text);
    if (part.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    // Deliberately skip reasoning/thinking signatures and bulky tool payloads.
  }
  return parts.join('\n').trim();
}

function parseSessionFile(file: string): { sessionId: string; startedAt: string; cwd?: string; provider?: string; model?: string; messages: Message[] } | undefined {
  const records = readJsonl(file);
  if (records.length === 0) return undefined;
  let sessionId = path.basename(file).replace(/\.jsonl.*/, '');
  let startedAt = nowIso();
  let cwd: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  const messages: Message[] = [];
  for (const r of records) {
    if (r.type === 'session') {
      sessionId = r.id || sessionId;
      startedAt = r.timestamp || startedAt;
      cwd = r.cwd || cwd;
    }
    if (r.type === 'model_change') {
      provider = r.provider || provider;
      model = r.modelId || model;
    }
    if (r.type === 'custom' && r.customType === 'model-snapshot') {
      provider = r.data?.provider || provider;
      model = r.data?.modelId || model;
    }
    if (r.type === 'message' && r.message?.role) {
      const content = textFromContent(r.message.content);
      if (!content) continue;
      messages.push({ role: r.message.role, content, created_at: r.timestamp || new Date(r.message.timestamp || Date.now()).toISOString(), metadata: { openclawMessageId: r.id } });
    }
  }
  if (!messages.length) return undefined;
  return { sessionId, startedAt, cwd, provider, model, messages };
}

function insertConversation(db: Db, parsed: NonNullable<ReturnType<typeof parseSessionFile>>, file: string, privacyMode: OpenClawImportOptions['privacyMode']) {
  const id = `openclaw_${parsed.sessionId}`;
  const mode = privacyMode || 'redacted_text';
  const convStmt = db.prepare(`INSERT OR REPLACE INTO conversations (id, source, project, title, started_at, ended_at, privacy_mode, metadata) VALUES (@id,@source,@project,@title,@started_at,@ended_at,@privacy_mode,@metadata)`);
  const msgStmt = db.prepare(`INSERT OR REPLACE INTO messages (id, conversation_id, role, created_at, content_hash, content_chars, content_redacted, content_raw, metadata) VALUES (@id,@conversation_id,@role,@created_at,@content_hash,@content_chars,@content_redacted,@content_raw,@metadata)`);
  const project = parsed.cwd?.split('/').filter(Boolean).pop() || 'openclaw';
  convStmt.run({ id, source: 'openclaw', project, title: `OpenClaw ${parsed.sessionId}`, started_at: parsed.startedAt, ended_at: parsed.messages.at(-1)?.created_at, privacy_mode: mode, metadata: jsonStringify({ sessionId: parsed.sessionId, file, cwd: parsed.cwd, provider: parsed.provider, model: parsed.model }) });
  for (let idx = 0; idx < parsed.messages.length; idx++) {
    const m = parsed.messages[idx];
    const redacted = redactText(m.content);
    msgStmt.run({ id: `msg_${sha256(`${id}:${idx}:${m.role}:${m.content}`).slice(0, 24)}`, conversation_id: id, role: m.role, created_at: m.created_at, content_hash: sha256(m.content), content_chars: m.content.length, content_redacted: mode === 'redacted_text' ? redacted : undefined, content_raw: mode === 'raw_text' ? redacted : undefined, metadata: jsonStringify(m.metadata) });
  }
  appendJsonl(archivePath(), { type: 'conversation', source: 'openclaw', id, project, started_at: parsed.startedAt, privacy_mode: mode, file });
  return parsed.messages.length;
}

function maybeParseUsageCache(file: string): any | undefined {
  if (!fs.existsSync(file)) return undefined;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return undefined; }
}

function ingestUsageCache(db: Db, dir: string, sinceIso: string) {
  const cache = maybeParseUsageCache(path.join(dir, '.usage-cost-cache.json'));
  if (!cache || typeof cache !== 'object') return { inserted: 0, skipped: 0 };
  const entries = cache.files && typeof cache.files === 'object' ? cache.files : cache;
  const stmt = db.prepare(`INSERT OR IGNORE INTO runs (id, source, external_id, project, provider, model, workflow, cwd, started_at, ended_at, duration_ms, status, input_tokens, output_tokens, total_tokens, estimated_tokens, estimated_cost_usd, metadata) VALUES (@id,@source,@external_id,@project,@provider,@model,@workflow,@cwd,@started_at,@ended_at,@duration_ms,@status,@input_tokens,@output_tokens,@total_tokens,@estimated_tokens,@estimated_cost_usd,@metadata)`);
  let inserted = 0, skipped = 0;
  for (const [sessionFile, entry] of Object.entries(entries) as any[]) {
    if (!entry?.sessionSummary || !entry?.totals) continue;
    const startedAt = new Date(entry.sessionSummary.firstActivity || entry.scannedAt || Date.now()).toISOString();
    if (startedAt < sinceIso) continue;
    const endedAt = new Date(entry.sessionSummary.lastActivity || entry.scannedAt || Date.now()).toISOString();
    const rec = {
      id: `run_openclaw_${entry.sessionId || sha256(sessionFile).slice(0, 16)}`,
      source: 'openclaw-usage-cache',
      external_id: entry.sessionId || sessionFile,
      project: 'openclaw',
      provider: entry.modelUsage?.[0]?.provider || entry.sessionSummary?.modelUsage?.[0]?.provider || 'openai-codex',
      model: entry.modelUsage?.[0]?.model || entry.sessionSummary?.modelUsage?.[0]?.model || 'unknown',
      workflow: 'openclaw-session',
      cwd: path.dirname(sessionFile),
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: entry.sessionSummary.durationMs || 0,
      status: entry.sessionSummary.messageCounts?.errors ? 'failure' : 'success',
      input_tokens: entry.totals.input || 0,
      output_tokens: entry.totals.output || 0,
      total_tokens: entry.totals.totalTokens || 0,
      estimated_tokens: 0,
      estimated_cost_usd: entry.totals.totalCost || 0,
      metadata: jsonStringify({ sessionFile, cacheRead: entry.totals.cacheRead, cacheWrite: entry.totals.cacheWrite, toolUsage: entry.sessionSummary.toolUsage, messageCounts: entry.sessionSummary.messageCounts }),
    };
    const info = stmt.run(rec);
    if (info.changes) { inserted++; appendJsonl(archivePath(), { type: 'run', ...rec }); } else skipped++;
  }
  return { inserted, skipped };
}

export function ingestOpenClaw(db: Db, options: OpenClawImportOptions = {}) {
  const dir = options.dir || defaultSessionDir(options.agent || 'main');
  const sinceIso = sinceToIso(options.since || '7d');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => path.join(dir, f)).filter((f) => isSessionJsonl(f, options.includeAll)) : [];
  let conversations = 0, messages = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const file of files) {
      const stat = fs.statSync(file);
      if (stat.mtime.toISOString() < sinceIso) continue;
      const parsed = parseSessionFile(file);
      if (!parsed) { skipped++; continue; }
      messages += insertConversation(db, parsed, file, options.privacyMode);
      conversations++;
    }
  });
  tx();
  const usage = options.includeUsageCache === false ? { inserted: 0, skipped: 0 } : ingestUsageCache(db, dir, sinceIso);
  return { dir, since: sinceIso, conversations, messages, skipped, usageRunsInserted: usage.inserted, usageRunsSkipped: usage.skipped };
}
