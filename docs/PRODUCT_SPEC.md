# AgentScope Product Spec

## Goal

AgentScope is a local-first observability platform for AI agents and LLM usage. It runs on Charlie's always-on Mac mini and answers:

- Which agents ran?
- Which models/providers were used?
- How many tokens were consumed?
- What did it cost?
- Which projects are most expensive or failure-prone?
- What conversations contained useful durable insights?
- What should be remembered in GBrain or curated memory?

## Non-goals for MVP

- Hosted SaaS backend.
- Multi-user auth.
- Public network service.
- Hosted web dashboard. MVP includes a local-only dashboard command bound to localhost.
- Storing raw private conversations by default.

## Core features

1. Usage observability
   - Runs, timestamps, duration, status, error metadata.
   - Input/output/total tokens.
   - Exact vs estimated token flag.
   - Provider/model/project/workflow attribution.
   - Estimated cost by pricing table.

2. Conversation logging
   - Conversation/session records.
   - Message records with role, timestamp, text mode, hashes, char counts.
   - Tool-call metadata.
   - Privacy modes: metadata_only, redacted_text, raw_text.

3. Daily memory mining
   - Scan traces for decisions, preferences, project facts, todos, lessons, risks.
   - Write reviewable candidates.
   - Score confidence and sensitivity.
   - Prepare GBrain ingestion documents.

4. Local-first storage
   - SQLite for queryable state.
   - JSONL archive for raw normalized events.
   - Config under `~/.agentscope`.

5. CLI-first UX
   - Ingest, summarize, review, export, dashboard, nightly, doctor commands.

6. Mac mini automation
   - User launchd job for nightly OpenClaw import, insight extraction, and GBrain dry-run export.
   - No hosted server or external queue.

## Later features

- Richer local-only dashboard with approval/edit actions.
- OpenClaw native session importer enhancements.
- Claude/Gemini wrappers.
- Parquet/DuckDB analytics exports.
