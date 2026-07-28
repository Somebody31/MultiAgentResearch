# MultiAgentResearch

Research API: break a question into parts, search, draft, check, then report.

**Stack:** Bun, Hono, LangGraph, DeepSeek V4 Flash, Tavily, Upstash Redis (rate limits)  
**UI:** vanilla console at `/` (same server as the API)  
**Start here:** `src/pipeline.ts` · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

## Flow

```
START → plan → Send(researchOne)×N → normalize → verify → final → END
                                    ↑                │
                                    └── revise once ─┘
```

| Node | Does |
|------|------|
| plan | Big question → smaller questions, each tagged `search` or `llm` |
| researchOne | Web search **or** LLM answer (LangGraph `Send` fan-out) |
| normalize | Facts → draft |
| verify | Draft ok? `pass` / `revise` |
| final | Draft → report |

Search: `searchWeb` (Tavily). Research calls `searchAll()`, which currently only runs web search.

## Async jobs

Research can take a while. The API does **not** wait for the full report.

1. `POST /research` → `{ id, status: "pending" }` (HTTP 202)
2. Poll `GET /jobs/:id` until `status` is `done` or `error`
3. When `done`, read `result` (full graph state / report)

Jobs live in memory (restart clears them).

## Rate limiting

`POST /research` is limited to **10 requests per 60s per IP** (`x-forwarded-for`).

- Production: set `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` (Upstash).
- Local / tests without those env vars: in-memory counter (one process).
- Over limit → **429** `{ "error": "Too many requests, slow down." }`

## Run

```bash
bun install

# .env
# DEEPSEEK_API_KEY=...
# TAVILY_API_KEY=...
# UPSTASH_REDIS_URL=...      # optional (rate limits)
# UPSTASH_REDIS_TOKEN=...    # optional (rate limits)

bun run dev   # http://localhost:8787  (console UI + API)
bun run test

# Open the live console
# http://localhost:8787/

# Faithfulness plant evals (gate + self_correct; needs DEEPSEEK_API_KEY)
# See docs/FAITHFULNESS_EVALS.md
bun run eval:run -- --concurrency 20
bun run eval:score
```

## API

```bash
# start (fixed mode — default)
curl -s -X POST http://localhost:8787/research \
  -H 'content-type: application/json' \
  -d '{"query":"What is LangGraph?"}'
# → {"id":"...","status":"pending","orchestration":"fixed",...}

# optional: dynamic reasoner + subagents
curl -s -X POST http://localhost:8787/research \
  -H 'content-type: application/json' \
  -d '{"query":"What is LangGraph?","orchestration":"dynamic"}'

# poll
curl -s http://localhost:8787/jobs/<id>
```

`GET /health` → `{ "ok": true }`  
`GET /` → research console (HTML/CSS/JS in `public/`)

**Modes:** `fixed` (default) plans once then fans out research. `dynamic` runs a budgeted reasoner loop that calls `web_research` / `reason` / `critique`, then the same normalize → verify → final stages. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Research console

Open **http://localhost:8787/** after `bun run dev`.

| Control | Behavior |
|---------|----------|
| Query | Research question |
| Orchestration | `fixed` (default) or `dynamic` |
| Start | `POST /research`, then poll `GET /jobs/:id` |
| Pipeline strip | Honest coarse state only (idle / running / done / error) — no fake per-stage progress |
| Report | `result.finalReport` when the job is done |

## Files

```
public/                    # live console (HTML/CSS/JS)
src/pipeline.ts            # LangGraph graph
src/jobs.ts                # in-memory async jobs
src/index.ts               # HTTP API + static files
src/rateLimiter.ts         # isRateLimited(ip) — Upstash or memory
src/middleware/rateLimit.ts
src/plan.ts
src/research.ts
src/search.ts
src/normalize.ts
src/verify.ts
src/fingerprints.ts
src/final.ts
src/llm.ts
src/parseJson.ts
src/reasoning/             # dynamic orchestration
evals/
docs/
```

## Roadmap

See **[docs/ROADMAP.md](docs/ROADMAP.md)**. Default stays **fixed** plan → N research. Dynamic mode is available via `orchestration: "dynamic"`.
