# Event Schema

## Run

```json
{
  "id": "run_...",
  "source": "codex-usage-logger",
  "project": "AgentWorkbench",
  "provider": "openai",
  "model": "gpt-5.5",
  "workflow": "code_review",
  "cwd": "/path/to/project",
  "git_remote": "git@github.com:owner/repo.git",
  "git_branch": "main",
  "git_commit": "abc123",
  "started_at": "2026-05-22T09:00:00.000Z",
  "ended_at": "2026-05-22T09:01:00.000Z",
  "duration_ms": 60000,
  "status": "success",
  "input_tokens": 1000,
  "output_tokens": 500,
  "total_tokens": 1500,
  "estimated_tokens": true,
  "estimated_cost_usd": 0.01,
  "metadata": {}
}
```

## Conversation

```json
{
  "id": "conv_...",
  "source": "openclaw",
  "project": "agent-scope",
  "title": "Planning conversation",
  "started_at": "2026-05-22T09:00:00.000Z",
  "privacy_mode": "redacted_text",
  "metadata": {},
  "messages": [
    {
      "role": "user",
      "content": "...",
      "created_at": "2026-05-22T09:00:00.000Z"
    }
  ]
}
```

## Insight candidate

```json
{
  "kind": "decision|preference|project_fact|todo|lesson|risk",
  "summary": "...",
  "project": "agent-scope",
  "confidence": 0.8,
  "sensitivity": "low|medium|high",
  "destination": "gbrain|memory|todo|ignore"
}
```
