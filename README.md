# MultiAgentResearch

Research API: break a question into parts, search, draft, check, then report.

**Stack:** Bun, Hono, MiMo, Tavily  
**Start here:** `src/pipeline.ts` (full flow in one place)

## Flow

```
plan → research → normalize → verify → (retry once if needed) → final
```

| Step | Does |
|------|------|
| plan | Big question → smaller questions |
| research | Search → short facts |
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
src/pipeline.ts   # order of steps — read first
src/index.ts      # HTTP
src/plan.ts
src/research.ts
src/search.ts     # searchWeb + searchDocs + searchAll
src/normalize.ts
src/verify.ts
src/final.ts
src/mimo.ts       # language model helper
```
