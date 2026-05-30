import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { Db } from './db.js';
import { archivePath } from './paths.js';
import { estimateCostUsd, estimateTokens } from './pricing.js';
import { redactText } from './redact.js';
import { appendJsonl, jsonStringify, nowIso, parseJson, sha256 } from './util.js';
import { gitMetadata } from './git.js';

const PrivacyMode = z.enum(['metadata_only', 'redacted_text', 'raw_text']).default('metadata_only');

export function readJsonl(file: string): unknown[] {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function pickNumber(obj: any, keys: string[]): number {
  for (const k of keys) if (typeof obj?.[k] === 'number') return obj[k];
  return 0;
}

function deriveProject(record: any): string | undefined {
  return record.project || record.metadata?.project || record.metadata?.repo || record.cwd?.split('/').filter(Boolean).pop();
}

function normalizeUsageRecord(r: any, source: string, providerDefault: string) {
  const input = pickNumber(r, ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens', 'estimatedInputTokens'])
    || pickNumber(r.usage, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens', 'input_tokens_details'])
    || pickNumber(r.message?.usage, ['input_tokens', 'prompt_tokens']);
  const output = pickNumber(r, ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens', 'estimatedOutputTokens'])
    || pickNumber(r.usage, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens'])
    || pickNumber(r.message?.usage, ['output_tokens', 'completion_tokens']);
  const total = pickNumber(r, ['total_tokens', 'totalTokens', 'tokens', 'estimatedTotalTokens'])
    || pickNumber(r.usage, ['totalTokens', 'total_tokens', 'tokens'])
    || pickNumber(r.message?.usage, ['total_tokens', 'tokens'])
    || input + output;
  const provider = r.provider || r.metadata?.provider || r.usage?.provider || providerDefault;
  const model = r.model || r.modelId || r.metadata?.model || r.metadata?.modelId || r.message?.model || 'unknown';
  const cwd = r.cwd || r.metadata?.cwd || r.workspace || r.session?.cwd;
  const git = gitMetadata(cwd);
  const startedAt = r.started_at || r.startedAt || r.timestamp || r.created_at || r.createdAt || nowIso();
  return {
    id: r.id || r.runId || `${source}_${nanoid()}`,
    source,
    external_id: r.id || r.runId || r.request_id || r.message?.id || sha256(JSON.stringify(r)),
    project: deriveProject(r),
    provider,
    model,
    workflow: r.workflow || r.metadata?.workflow || r.command || r.tool,
    cwd,
    git_remote: git.git_remote,
    git_branch: git.git_branch,
    git_commit: git.git_commit,
    started_at: startedAt,
    ended_at: r.ended_at || r.endedAt || r.completed_at || r.completedAt || undefined,
    duration_ms: pickNumber(r, ['duration_ms', 'durationMs', 'elapsedMs', 'elapsed_ms']),
    status: r.status || (r.success === false || r.error ? 'failure' : 'success'),
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    estimated_tokens: r.estimated === false || r.estimated_tokens === false || r.usage?.estimated === false ? 0 : 1,
    estimated_cost_usd: typeof r.cost_usd === 'number' ? r.cost_usd : typeof r.costUsd === 'number' ? r.costUsd : estimateCostUsd(provider, model, input, output),
    error: r.error ? String(r.error?.message || r.error) : undefined,
    metadata: jsonStringify(r.metadata || r),
  };
}

export function ingestUsageJsonl(db: Db, file: string, source: string, providerDefault: string): { inserted: number; skipped: number } {
  const rows = readJsonl(file);
  let inserted = 0, skipped = 0;
  const stmt = db.prepare(`INSERT OR IGNORE INTO runs (id, source, external_id, project, provider, model, workflow, cwd, git_remote, git_branch, git_commit, started_at, ended_at, duration_ms, status, input_tokens, output_tokens, total_tokens, estimated_tokens, estimated_cost_usd, error, metadata) VALUES (@id,@source,@external_id,@project,@provider,@model,@workflow,@cwd,@git_remote,@git_branch,@git_commit,@started_at,@ended_at,@duration_ms,@status,@input_tokens,@output_tokens,@total_tokens,@estimated_tokens,@estimated_cost_usd,@error,@metadata)`);
  const tx = db.transaction((records: any[]) => {
    for (const r of records) {
      const rec = normalizeUsageRecord(r, source, providerDefault);
      const info = stmt.run(rec);
      if (info.changes) { inserted++; appendJsonl(archivePath(), { type: 'run', ...rec }); } else skipped++;
    }
  });
  tx(rows as any[]);
  return { inserted, skipped };
}

export function ingestCodexJsonl(db: Db, file: string): { inserted: number; skipped: number } {
  return ingestUsageJsonl(db, file, 'codex-usage-logger', 'openai');
}

export function ingestClaudeJsonl(db: Db, file: string): { inserted: number; skipped: number } {
  return ingestUsageJsonl(db, file, 'claude-usage-jsonl', 'anthropic');
}

export function ingestGeminiJsonl(db: Db, file: string): { inserted: number; skipped: number } {
  return ingestUsageJsonl(db, file, 'gemini-usage-jsonl', 'google');
}

const Message = z.object({ role: z.string(), content: z.string().default(''), created_at: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional() });
const Conversation = z.object({ id: z.string().optional(), source: z.string().default('generic'), project: z.string().optional(), title: z.string().optional(), started_at: z.string().optional(), ended_at: z.string().optional(), privacy_mode: PrivacyMode, metadata: z.record(z.string(), z.unknown()).optional(), messages: z.array(Message).default([]) });

export function ingestConversationFile(db: Db, file: string): { conversations: number; messages: number } {
  const text = fs.readFileSync(file, 'utf8').trim();
  const values = file.endsWith('.jsonl') ? text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(text);
  const conversations = Array.isArray(values) ? values : [values];
  let convCount = 0, msgCount = 0;
  const convStmt = db.prepare(`INSERT OR REPLACE INTO conversations (id, source, project, title, started_at, ended_at, privacy_mode, metadata) VALUES (@id,@source,@project,@title,@started_at,@ended_at,@privacy_mode,@metadata)`);
  const msgStmt = db.prepare(`INSERT OR REPLACE INTO messages (id, conversation_id, role, created_at, content_hash, content_chars, content_redacted, content_raw, metadata) VALUES (@id,@conversation_id,@role,@created_at,@content_hash,@content_chars,@content_redacted,@content_raw,@metadata)`);
  const tx = db.transaction((items: unknown[]) => {
    for (const raw of items) {
      const c = Conversation.parse(raw);
      const id = c.id || `conv_${nanoid()}`;
      const started = c.started_at || c.messages[0]?.created_at || nowIso();
      convStmt.run({ id, source: c.source, project: c.project, title: c.title, started_at: started, ended_at: c.ended_at, privacy_mode: c.privacy_mode, metadata: jsonStringify(c.metadata) });
      convCount++;
      appendJsonl(archivePath(), { type: 'conversation', id, source: c.source, project: c.project, started_at: started, privacy_mode: c.privacy_mode });
      c.messages.forEach((m, idx) => {
        const redacted = redactText(m.content);
        msgStmt.run({ id: `msg_${sha256(`${id}:${idx}:${m.role}:${m.content}`).slice(0, 24)}`, conversation_id: id, role: m.role, created_at: m.created_at || started, content_hash: sha256(m.content), content_chars: m.content.length, content_redacted: c.privacy_mode === 'redacted_text' ? redacted : undefined, content_raw: c.privacy_mode === 'raw_text' ? redacted : undefined, metadata: jsonStringify(m.metadata) });
        msgCount++;
      });
    }
  });
  tx(conversations);
  return { conversations: convCount, messages: msgCount };
}

export function conversationTextsForDate(db: Db, start: string, end: string) {
  const rows = db.prepare(`SELECT c.id, c.project, c.title, m.role, m.content_redacted, m.content_raw, m.content_chars, m.created_at FROM conversations c JOIN messages m ON m.conversation_id=c.id WHERE m.created_at >= ? AND m.created_at < ? ORDER BY m.created_at`).all(start, end) as any[];
  return rows.map((r) => ({ ...r, text: r.content_redacted || r.content_raw || `[${r.content_chars} chars; metadata only]` }));
}
