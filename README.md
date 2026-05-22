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
agentscope ingest conversation <json|jsonl>
agentscope ingest openclaw [--since 7d] [--privacy redacted_text]
agentscope summary [--since today|7d|30d] [--project name]
agentscope runs [--failed] [--limit n]
agentscope projects
agentscope models
agentscope insights run [--date today|YYYY-MM-DD]
agentscope insights review
agentscope gbrain ingest [--dry-run|--apply]
agentscope dashboard [--port 3737]
agentscope nightly run
agentscope nightly install
agentscope doctor
```

## Status

MVP foundation: local SQLite store, Codex JSONL import, OpenClaw session/usage import, conversation import, summaries, local dashboard, nightly launchd automation, insight candidates, and GBrain export/import hook.
