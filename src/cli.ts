#!/usr/bin/env node
import { Command } from 'commander';
import { openDb, initStore } from './db.js';
import { ingestClaudeJsonl, ingestCodexJsonl, ingestConversationFile, ingestGeminiJsonl } from './ingest.js';
import { dbPath, dataDir } from './paths.js';
import { listRuns, models, printTable, projects, summary } from './reports.js';
import { exportGbrain, reviewInsights, runInsights, setInsightStatus } from './insights.js';
import { ingestOpenClaw } from './openclaw.js';
import { startDashboard } from './dashboard.js';
import { installLaunchd, nightlyStatus, runNightly } from './nightly.js';
import { exportAnalytics } from './analytics.js';

const program = new Command();
program.name('agentscope').description('Local-first observability and memory mining for AI agents').version('0.1.0');

program.command('init').description('Initialize local AgentScope storage').action(() => {
  console.log(`Initialized AgentScope at ${initStore()}`);
});

const ingest = program.command('ingest').description('Ingest logs and traces');
ingest.command('codex <jsonl>').description('Ingest codex-usage-logger JSONL').action((jsonl) => {
  const db = openDb();
  const result = ingestCodexJsonl(db, jsonl);
  db.close();
  console.log(result);
});
ingest.command('claude <jsonl>').description('Ingest Claude usage JSONL').action((jsonl) => {
  const db = openDb();
  const result = ingestClaudeJsonl(db, jsonl);
  db.close();
  console.log(result);
});
ingest.command('gemini <jsonl>').description('Ingest Gemini usage JSONL').action((jsonl) => {
  const db = openDb();
  const result = ingestGeminiJsonl(db, jsonl);
  db.close();
  console.log(result);
});
ingest.command('conversation <file>').description('Ingest conversation JSON/JSONL').action((file) => {
  const db = openDb();
  const result = ingestConversationFile(db, file);
  db.close();
  console.log(result);
});
ingest.command('openclaw').description('Ingest OpenClaw local session JSONL and usage cache').option('--dir <dir>', 'OpenClaw sessions directory').option('--agent <agent>', 'OpenClaw agent id', 'main').option('--since <since>', 'today, 2d, 7d, or ISO date', '7d').option('--privacy <mode>', 'metadata_only, redacted_text, raw_text', 'redacted_text').option('--all', 'Include checkpoint/deleted/reset session files').option('--no-usage-cache', 'Skip .usage-cost-cache.json import').action((opts) => {
  const db = openDb();
  const result = ingestOpenClaw(db, { dir: opts.dir, agent: opts.agent, since: opts.since, privacyMode: opts.privacy, includeAll: opts.all, includeUsageCache: opts.usageCache });
  db.close();
  console.log(result);
});

program.command('summary').option('--since <since>', 'today, 7d, 30d, or ISO date', 'today').option('--project <project>').description('Show usage summary').action((opts) => {
  const db = openDb();
  console.dir(summary(db, opts), { depth: null });
  db.close();
});

program.command('runs').option('--failed', 'Only failed runs').option('--limit <n>', 'Limit', '25').description('List runs').action((opts) => {
  const db = openDb();
  printTable(listRuns(db, { failed: opts.failed, limit: Number(opts.limit) }));
  db.close();
});

program.command('projects').description('Project rollup').action(() => { const db = openDb(); printTable(projects(db)); db.close(); });
program.command('models').description('Model rollup').action(() => { const db = openDb(); printTable(models(db)); db.close(); });

const insights = program.command('insights').description('Extract and review memory candidates');
insights.command('run').option('--date <date>', 'today or YYYY-MM-DD', 'today').description('Run daily insight extraction').action((opts) => {
  const db = openDb();
  console.log(runInsights(db, opts.date));
  db.close();
});
insights.command('review').description('Show pending insight candidates').action(() => {
  const db = openDb();
  printTable(reviewInsights(db));
  db.close();
});
insights.command('approve <id>').description('Approve an insight candidate').action((id) => {
  const db = openDb();
  console.log(setInsightStatus(db, id, 'approved'));
  db.close();
});
insights.command('reject <id>').description('Reject an insight candidate').action((id) => {
  const db = openDb();
  console.log(setInsightStatus(db, id, 'rejected'));
  db.close();
});

const gbrain = program.command('gbrain').description('GBrain export helpers');
gbrain.command('ingest').option('--dry-run', 'Do not mark exported', true).option('--apply', 'Mark exported after writing file').description('Export approved/low-risk candidates for GBrain ingestion').action((opts) => {
  const db = openDb();
  console.log(exportGbrain(db, !opts.apply));
  db.close();
});

const exportCmd = program.command('export').description('Export AgentScope data');
exportCmd.command('analytics')
  .option('--format <format>', 'jsonl, csv, or duckdb-sql', 'jsonl')
  .option('--out <file>', 'Output file')
  .option('--since <iso>', 'Only export runs started after this ISO timestamp')
  .description('Export runs for local analytics and DuckDB workflows')
  .action((opts) => {
    const db = openDb();
    const result = exportAnalytics(db, opts);
    db.close();
    console.log(result);
  });

program.command('dashboard').option('--host <host>', 'Bind host', '127.0.0.1').option('--port <port>', 'Port', '3737').description('Start the local-only dashboard').action((opts) => {
  const db = openDb();
  startDashboard(db, { host: opts.host, port: Number(opts.port) });
});

const nightly = program.command('nightly').description('Nightly import and memory-mining automation');
nightly.command('run').description('Run OpenClaw import, insight extraction, and GBrain dry-run export once').action(() => runNightly(process.argv[1]));
nightly.command('install').description('Install a user launchd job for 23:30 local time daily').action(() => console.log(installLaunchd(process.argv[1])));
nightly.command('status').description('Show launchd status and recent nightly logs').action(() => console.dir(nightlyStatus(), { depth: null }));

program.command('doctor').description('Check local setup').action(() => {
  const db = openDb();
  const counts = {
    db: dbPath(),
    home: dataDir(),
    runs: (db.prepare('SELECT COUNT(*) n FROM runs').get() as any).n,
    conversations: (db.prepare('SELECT COUNT(*) n FROM conversations').get() as any).n,
    messages: (db.prepare('SELECT COUNT(*) n FROM messages').get() as any).n,
    insights: (db.prepare('SELECT COUNT(*) n FROM insight_candidates').get() as any).n,
  };
  db.close();
  console.log(counts);
});

program.parse();
