# MultiAgentResearch

Research API: break a question into parts, search, draft, check, then report.

**Stack:** Bun, Hono, LangGraph, DeepSeek V4 Flash, Tavily  
**Start here:** `src/pipeline.ts` · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md)

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

Search: `searchWeb` (Tavily). Research calls `searchAll()`, which currently only runs web search.

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
# DEEPSEEK_API_KEY=...
# TAVILY_API_KEY=...

bun run dev   # http://localhost:8787
bun run test

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

**Modes:** `fixed` (default) plans once then fans out research. `dynamic` runs a budgeted reasoner loop that calls `web_research` / `reason` / `critique`, then the same normalize → verify → final stages. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Files

```
src/pipeline.ts      # LangGraph graph (Send fan-out, plant seam, rewrite revise)
src/jobs.ts          # in-memory async jobs
src/index.ts         # HTTP
src/plan.ts
src/research.ts      # researchOne
src/search.ts        # web (fixtures in eval)
src/normalize.ts
src/verify.ts        # faithfulness gate + deterministic fingerprint backup
src/fingerprints.ts  # plant leak + draft-vs-findings fingerprints
src/final.ts
src/llm.ts           # DeepSeek V4 Flash (system/user for input cache)
src/parseJson.ts
src/reasoning/       # dynamic orchestration (reasoner + agents)
evals/run.ts         # faithfulness suite
evals/score.ts
evals/questions.json
evals/fixtures/      # frozen web for evals
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/FAITHFULNESS_EVALS.md
```

## Roadmap

See **[docs/ROADMAP.md](docs/ROADMAP.md)**. Default stays **fixed** plan → N research. Dynamic mode is available via `orchestration: "dynamic"`.
