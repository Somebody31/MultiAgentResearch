# MultiAgentResearch

Research API: break a question into parts, search, draft, check, then report.

**Stack:** Bun, Hono, MiMo, Tavily  
**Start here:** `src/pipeline.ts` (small graph: nodes + edges + runner)

## Flow

Hand-rolled graph (no LangGraph): each step is a **node**; `nextNode()` picks the **edge**.

```
plan → research → normalize → verify → final
                      ↑           │
                      └─ revise once (max 1 retry)
```

| Node | Does |
|------|------|
| plan | Big question → smaller questions |
| research | Search → short facts (sub-questions in parallel) |
| normalize | Facts → draft |
| verify | Draft ok? `pass` / `revise` |
| final | Draft → report |

Search lives in `src/search.ts` (`searchWeb` is real; `searchDocs` is empty for now).

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

`POST /research` body: `{ "query": "..." }`  
`GET /health` → `{ "ok": true }`

## Files

```
src/pipeline.ts   # graph runner (nodes + nextNode) — read first
src/index.ts      # HTTP
src/plan.ts
src/research.ts
src/search.ts     # searchWeb + searchDocs + searchAll
src/normalize.ts
src/verify.ts
src/final.ts
src/mimo.ts       # language model helper
src/parseJson.ts  # pull JSON out of model text
```
