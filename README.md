# MultiAgentResearch

Multi-agent research pipeline over HTTP. Bun + Hono, MiMo for LLM calls, Tavily for search.

Orchestration is plain TypeScript in `src/pipeline.ts` (shared state + steps). No LangGraph.

## Pipeline

```
plan → research → normalize → verify → (optional re-research once) → final
```

| Step | What it does |
|------|----------------|
| plan | Query → sub-questions |
| research | Search + extract findings |
| normalize | Findings → draft |
| verify | Draft vs findings → `pass` \| `revise` |
| audit | On `revise`, re-research at most once |
| final | Draft → report |

## Setup

```bash
bun install

# .env
# MIMO_API_KEY=...
# TAVILY_API_KEY=...

bun run dev   # :8787
bun run test
```

## API

`POST /research`

```json
{ "query": "What is Bun and how does it differ from Node.js?" }
```

```json
{
  "query": "...",
  "subQuestions": ["..."],
  "findings": [{ "subQuestion": "...", "claim": "...", "sourceUrl": "..." }],
  "draft": "...",
  "verdict": "pass",
  "retries": 0,
  "finalReport": "..."
}
```

`GET /health` → `{ "ok": true }`

## Layout

```
src/
  index.ts       # HTTP
  pipeline.ts    # orchestration
  plan.ts
  research.ts
  search.ts
  normalize.ts
  verify.ts
  final.ts
  mimo.ts
```
