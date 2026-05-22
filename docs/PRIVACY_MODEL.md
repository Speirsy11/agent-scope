# Privacy Model

AgentScope assumes agent traces may contain sensitive personal, project, or credential data.

## Defaults

- Do not store raw prompts or outputs unless explicitly requested.
- Store text hashes, character counts, token counts, and metadata by default.
- Redact obvious secrets before any redacted/raw storage mode.
- Keep usage metrics separate from memory candidates.

## Privacy modes

- `metadata_only`: store hashes/counts only.
- `redacted_text`: store text after redaction.
- `raw_text`: store raw text after secret-blocking checks; intended for trusted local use only.

## Redaction targets

- API keys and bearer tokens.
- Private key blocks.
- `.env` style assignments.
- Long high-entropy strings.
- Emails and phone numbers where configured.

## Memory mining rules

- Prefer summaries over raw excerpts.
- Do not ingest secrets into GBrain.
- Mark personal/sensitive candidates for review.
- Auto-ingestion should be limited to low-risk project facts unless explicitly enabled.
