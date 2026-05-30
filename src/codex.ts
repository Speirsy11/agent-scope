import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import { Db } from './db.js';
import { archivePath } from './paths.js';
import { appendJsonl, jsonStringify, sha256, sinceToIso } from './util.js';

export type CodexLocalImportOptions = {
  stateDb?: string;
  since?: string;
};

function defaultStateDb() {
  return path.join(os.homedir(), '.codex', 'state_5.sqlite');
}

function projectFromCwd(cwd?: string) {
  return cwd?.split('/').filter(Boolean).pop() || 'codex';
}

function isoFromUnixSeconds(value?: number | null) {
  return new Date((value || Math.floor(Date.now() / 1000)) * 1000).toISOString();
}

export function ingestCodexLocal(db: Db, options: CodexLocalImportOptions = {}) {
  const stateDb = options.stateDb || defaultStateDb();
  const sinceIso = sinceToIso(options.since || '30d');
  const sinceUnix = Math.floor(Date.parse(sinceIso) / 1000);
  const source = new Database(stateDb, { readonly: true, fileMustExist: true });
  const rows = source.prepare(`
SELECT
  id, rollout_path, created_at, updated_at, source, model_provider, cwd,
  title, tokens_used, git_sha, git_branch, git_origin_url, cli_version,
  agent_nickname, agent_role, model, reasoning_effort, thread_source, preview
FROM threads
WHERE created_at >= @since
ORDER BY created_at
`).all({ since: sinceUnix }) as any[];
  source.close();

  const stmt = db.prepare(`
INSERT OR IGNORE INTO runs (
  id, source, external_id, project, provider, model, workflow, cwd,
  git_remote, git_branch, git_commit, started_at, ended_at, duration_ms,
  status, input_tokens, output_tokens, total_tokens, estimated_tokens,
  estimated_cost_usd, error, metadata
) VALUES (
  @id, @source, @external_id, @project, @provider, @model, @workflow, @cwd,
  @git_remote, @git_branch, @git_commit, @started_at, @ended_at, @duration_ms,
  @status, @input_tokens, @output_tokens, @total_tokens, @estimated_tokens,
  @estimated_cost_usd, @error, @metadata
)`);

  let inserted = 0, skipped = 0;
  const tx = db.transaction((items: any[]) => {
    for (const row of items) {
      const startedAt = isoFromUnixSeconds(row.created_at);
      const endedAt = isoFromUnixSeconds(row.updated_at);
      const durationMs = row.updated_at && row.created_at ? Math.max(0, (row.updated_at - row.created_at) * 1000) : 0;
      const rec = {
        id: `run_codex_${row.id || sha256(JSON.stringify(row)).slice(0, 16)}`,
        source: 'codex-local',
        external_id: row.id,
        project: projectFromCwd(row.cwd),
        provider: row.model_provider || 'openai-codex',
        model: row.model || 'unknown',
        workflow: row.thread_source || row.source || 'codex-thread',
        cwd: row.cwd,
        git_remote: row.git_origin_url,
        git_branch: row.git_branch,
        git_commit: row.git_sha,
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: durationMs,
        status: 'success',
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: row.tokens_used || 0,
        estimated_tokens: 0,
        // Codex CLI thread totals from ChatGPT/Codex auth are usage telemetry, not API billing.
        estimated_cost_usd: 0,
        error: undefined,
        metadata: jsonStringify({
          rolloutPath: row.rollout_path,
          cliVersion: row.cli_version,
          agentNickname: row.agent_nickname,
          agentRole: row.agent_role,
          reasoningEffort: row.reasoning_effort,
          titleHash: row.title ? sha256(row.title) : undefined,
          previewHash: row.preview ? sha256(row.preview) : undefined,
        }),
      };
      const info = stmt.run(rec);
      if (info.changes) { inserted++; appendJsonl(archivePath(), { type: 'run', ...rec }); } else skipped++;
    }
  });
  tx(rows);

  return { stateDb, since: sinceIso, scanned: rows.length, inserted, skipped };
}
