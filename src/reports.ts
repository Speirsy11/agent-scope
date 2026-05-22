import { Db } from './db.js';
import { sinceToIso } from './util.js';

export function summary(db: Db, opts: { since?: string; project?: string }) {
  const since = sinceToIso(opts.since);
  const where = ['started_at >= @since'];
  const params: Record<string, unknown> = { since };
  if (opts.project) { where.push('project = @project'); params.project = opts.project; }
  const clause = where.join(' AND ');
  const totals = db.prepare(`SELECT COUNT(*) runs, SUM(total_tokens) total_tokens, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens, SUM(estimated_cost_usd) cost, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes, SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) failures FROM runs WHERE ${clause}`).get(params) as any;
  const byProject = db.prepare(`SELECT COALESCE(project,'unknown') project, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs WHERE ${clause} GROUP BY COALESCE(project,'unknown') ORDER BY tokens DESC LIMIT 10`).all(params);
  const byModel = db.prepare(`SELECT COALESCE(provider,'unknown') provider, COALESCE(model,'unknown') model, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs WHERE ${clause} GROUP BY provider, model ORDER BY tokens DESC LIMIT 10`).all(params);
  return { since, project: opts.project, totals, byProject, byModel };
}

export function listRuns(db: Db, opts: { failed?: boolean; limit?: number }) {
  return db.prepare(`SELECT id, started_at, project, provider, model, status, total_tokens, estimated_cost_usd, duration_ms FROM runs ${opts.failed ? "WHERE status!='success'" : ''} ORDER BY started_at DESC LIMIT ?`).all(opts.limit || 25);
}

export function projects(db: Db) {
  return db.prepare(`SELECT COALESCE(project,'unknown') project, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs GROUP BY COALESCE(project,'unknown') ORDER BY runs DESC`).all();
}

export function models(db: Db) {
  return db.prepare(`SELECT COALESCE(provider,'unknown') provider, COALESCE(model,'unknown') model, COUNT(*) runs, SUM(total_tokens) tokens, SUM(estimated_cost_usd) cost FROM runs GROUP BY provider, model ORDER BY tokens DESC`).all();
}

export function printTable(rows: unknown) {
  console.table(rows as any);
}
