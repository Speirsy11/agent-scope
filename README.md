# AgentScope

Local-first observability and memory mining for AI agents on an always-on Mac mini.

AgentScope tracks agent/model runs, token usage, estimated cost, conversation traces, failures, and durable insights worth remembering. It is CLI-first, stores everything locally in SQLite/JSONL, and can prepare approved memory candidates for GBrain ingestion.

## Principles

- Local-first: no cloud server or external database required.
- Privacy-first: raw prompts and outputs are opt-in.
- Useful before pretty: CLI summaries before dashboards.
- Durable memory: extract decisions, preferences, project facts, todos, and lessons from daily traces.

## Quick start

```bash
npm install
npm run build
node dist/cli.js init
node dist/cli.js ingest codex ~/.codex-usage/runs.jsonl
node dist/cli.js ingest codex-local --since 30d
node dist/cli.js ingest claude ~/claude-usage.jsonl
node dist/cli.js ingest gemini ~/gemini-usage.jsonl
node dist/cli.js summary --since 7d
node dist/cli.js insights run --date today
node dist/cli.js dashboard
```

Default data directory: `~/.agentscope`.

## OpenClaw dogfooding

Import local OpenClaw session conversations and the usage-cost cache:

```bash
agentscope ingest openclaw --since 7d --privacy redacted_text
agentscope summary --since 7d
agentscope dashboard
```

Install the nightly Mac mini job at 23:30 local time:

```bash
agentscope nightly install
```

The nightly job runs OpenClaw import, daily insight extraction, and a GBrain dry-run export. Use `agentscope gbrain ingest --apply` when you want to import low-risk approved candidates into GBrain.

## Commands

```bash
agentscope init
agentscope ingest codex <jsonl>
agentscope ingest codex-local [--since 30d] [--state-db ~/.codex/state_5.sqlite]
agentscope ingest claude <jsonl>
agentscope ingest gemini <jsonl>
agentscope ingest conversation <json|jsonl>
agentscope ingest openclaw [--since 7d] [--privacy redacted_text]
agentscope summary [--since today|7d|30d] [--project name]
agentscope runs [--failed] [--limit n]
agentscope projects
agentscope models
agentscope insights run [--date today|YYYY-MM-DD]
agentscope insights review
agentscope insights approve <id>
agentscope insights reject <id>
agentscope gbrain ingest [--dry-run|--apply]
agentscope export analytics [--format jsonl|csv|duckdb-sql] [--out file]
agentscope dashboard [--port 3737]
agentscope nightly run
agentscope nightly install
agentscope nightly status
agentscope doctor
```

## Codex CLI Usage

For normal Codex CLI usage without OpenClaw, import local thread usage from Codex's state database:

```bash
agentscope ingest codex-local --since 30d
agentscope summary --since 30d
agentscope dashboard
```

This reads `~/.codex/state_5.sqlite`, imports one run per Codex thread, and uses the `threads.tokens_used` total. It stores cwd/project, model/provider, git metadata, duration, and total tokens. It does not import raw prompts or responses.

## Status

MVP foundation: local SQLite store, native Codex CLI usage import, Codex/Claude/Gemini JSONL import, OpenClaw session/usage import, conversation import, summaries, local dashboard with filters/detail views and insight approval actions, nightly launchd automation/status, insight candidates, analytics exports, and GBrain export/import hook.

## Dashboard

```bash
agentscope dashboard
```

The dashboard binds to `127.0.0.1` by default and includes:

- 7/30/90 day and project/model/status filters.
- Daily usage, project, and model rollups.
- Recent run and conversation detail panes.
- Pending insight review actions.

## Analytics Export

```bash
agentscope export analytics --format jsonl
agentscope export analytics --format csv
agentscope export analytics --format duckdb-sql
```

The DuckDB format writes a CSV companion file plus a small SQL import script so the data can be loaded locally without adding a runtime analytics dependency.
