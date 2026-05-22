import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { Db } from './db.js';
import { dataDir } from './paths.js';
import { conversationTextsForDate } from './ingest.js';
import { dayBounds, ensureDir, jsonStringify } from './util.js';

const decisionWords = /\b(decided|decision|agreed|settled|choose|chose|will use|core requirement)\b/i;
const prefWords = /\b(prefer|likes?|wants?|does not want|don't want|avoid|default)\b/i;
const todoWords = /\b(todo|follow up|need to|should|next|later|backlog|task)\b/i;
const lessonWords = /\b(learned|lesson|fix|bug|issue|problem|risk|careful)\b/i;

function classify(text: string): string | undefined {
  if (decisionWords.test(text)) return 'decision';
  if (prefWords.test(text)) return 'preference';
  if (todoWords.test(text)) return 'todo';
  if (lessonWords.test(text)) return 'lesson';
  return undefined;
}

function sensitivity(text: string): 'low' | 'medium' | 'high' {
  if (/secret|token|password|private key|api key/i.test(text)) return 'high';
  if (/personal|family|email|phone|address|money|health/i.test(text)) return 'medium';
  return 'low';
}

export function runInsights(db: Db, date = 'today') {
  const { start, end, day } = dayBounds(date);
  const rows = conversationTextsForDate(db, start, end);
  const stmt = db.prepare(`INSERT INTO insight_candidates (id, date, kind, summary, project, confidence, sensitivity, destination, source_ids) VALUES (@id,@date,@kind,@summary,@project,@confidence,@sensitivity,@destination,@source_ids)`);
  let inserted = 0;
  for (const row of rows as any[]) {
    const text = String(row.text || '').replace(/\s+/g, ' ').trim();
    if (!text || text.startsWith('[')) continue;
    const kind = classify(text);
    if (!kind) continue;
    const summary = text.length > 260 ? `${text.slice(0, 257)}...` : text;
    const sens = sensitivity(summary);
    const destination = sens === 'low' ? (kind === 'todo' ? 'todo' : 'gbrain') : 'review';
    const exists = db.prepare(`SELECT id FROM insight_candidates WHERE date=? AND summary=?`).get(day, summary);
    if (exists) continue;
    stmt.run({ id: `ins_${nanoid()}`, date: day, kind, summary, project: row.project, confidence: 0.55, sensitivity: sens, destination, source_ids: jsonStringify([row.id]) });
    inserted++;
  }
  const candidates = db.prepare(`SELECT * FROM insight_candidates WHERE date=? ORDER BY sensitivity DESC, kind`).all(day) as any[];
  ensureDir(path.join(dataDir(), 'digests'));
  const md = ['# AgentScope Daily Insights', '', `Date: ${day}`, '', ...candidates.map((c) => `- [${c.status}] **${c.kind}** (${c.sensitivity}, ${c.destination})${c.project ? ` [${c.project}]` : ''}: ${c.summary}`), ''].join('\n');
  const digestPath = path.join(dataDir(), 'digests', `${day}.md`);
  fs.writeFileSync(digestPath, md);
  return { date: day, scannedMessages: rows.length, inserted, candidates: candidates.length, digestPath };
}

export function reviewInsights(db: Db, status = 'pending') {
  return db.prepare(`SELECT id, date, kind, sensitivity, destination, project, summary FROM insight_candidates WHERE status=? ORDER BY date DESC, created_at DESC`).all(status);
}

export function exportGbrain(db: Db, dryRun = true) {
  const rows = db.prepare(`SELECT * FROM insight_candidates WHERE status IN ('approved','pending') AND destination='gbrain' AND sensitivity='low' ORDER BY date`).all() as any[];
  const docs = rows.map((r) => `Type: ${r.kind}\nDate: ${r.date}\nProject: ${r.project || 'unknown'}\nSource: AgentScope ${r.id}\n\n${r.summary}\n`);
  ensureDir(path.join(dataDir(), 'gbrain'));
  const file = path.join(dataDir(), 'gbrain', `agentscope-gbrain-${new Date().toISOString().slice(0,10)}.md`);
  fs.writeFileSync(file, docs.join('\n---\n'));
  let gbrainImported = false;
  if (!dryRun && rows.length > 0) {
    childProcess.execFileSync('gbrain', ['import', path.dirname(file)], { stdio: 'pipe' });
    gbrainImported = true;
    const mark = db.prepare(`UPDATE insight_candidates SET status='exported' WHERE id=?`);
    rows.forEach((r) => mark.run(r.id));
  }
  return { count: rows.length, file, dryRun, gbrainImported };
}
