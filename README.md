# MultiAgentResearch

Research API: break a question into parts, search, draft, check, then report.

**Stack:** Bun, Hono, LangGraph, MiMo, Tavily  
**Start here:** `src/pipeline.ts`

## Flow

```
START → plan → Send(researchOne)×N → normalize → verify → final → END
                                    ↑                │
                                    └── revise once ─┘
```

| Node | Does |
|------|------|
| plan | Big question → smaller questions |
| researchOne | One sub-question (LangGraph `Send` fan-out) |
| normalize | Facts → draft |
| verify | Draft ok? `pass` / `revise` |
| final | Draft → report |

Search: `searchWeb` (Tavily) + `searchDocs` (files in `corpus/`, keyword rank for now).  
**Later:** better doc retrieval (embeddings and/or give full docs to the model) — see comment in `searchDocs`.

## Async jobs

Research can take a while. The API does **not** wait for the full report.

1. `POST /research` → `{ id, status: "pending" }` (HTTP 202)
2. Poll `GET /jobs/:id` until `status` is `done` or `error`
3. When `done`, read `result` (full graph state / report)

Jobs live in memory (restart clears them).

## Run

```bash
bun install

# .env
# MIMO_API_KEY=...
# TAVILY_API_KEY=...

bun run dev   # http://localhost:8787
bun run test
```

## API

```bash
# start
curl -s -X POST http://localhost:8787/research \
  -H 'content-type: application/json' \
  -d '{"query":"What is LangGraph?"}'
# → {"id":"...","status":"pending",...}

# poll
curl -s http://localhost:8787/jobs/<id>
```

`GET /health` → `{ "ok": true }`

## Files

```
src/pipeline.ts   # LangGraph graph (Send fan-out)
src/jobs.ts       # in-memory async jobs
src/index.ts      # HTTP
src/plan.ts
src/research.ts   # researchOne
src/search.ts     # web + docs
src/normalize.ts
src/verify.ts
src/final.ts
src/mimo.ts
src/parseJson.ts
corpus/           # local docs for searchDocs
```
