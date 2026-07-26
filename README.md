# MultiAgentResearch

Research API: break a question into parts, search, draft, check, then report.

**Stack:** Bun, Hono, LangGraph, DeepSeek V4 Flash, Tavily  
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

# Older frozen-web scenario harness (evals/README.md)
bun run eval -- --dry-run
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
src/reasoning/       # dynamic orchestration stubs (not wired; see roadmap)
scripts/run-eval.ts  # faithfulness suite
scripts/score-eval.ts
docs/FAITHFULNESS_EVALS.md
docs/ROADMAP.md      # planned work (dynamic mode, evals, UX)
evals/               # frozen-web fixtures + older scenario harness
```

## Roadmap

See **[docs/ROADMAP.md](docs/ROADMAP.md)**. Default stays **fixed** plan → N research nodes. Dynamic mode (`orchestration: "dynamic"`) is planned there; stubs live under `src/reasoning/` and still throw until wired.

## Interview demo UI

Mock research jobs in the browser — no API keys required. For the real pipeline API, use `bun run dev` above.

```bash
bun run demo
# open http://localhost:4173/   (index redirects into the tool)
# or open multi-agent-research-tool.html directly in a browser
```

Do not stop at a directory listing: that means you opened the folder root without `index.html` loading. Use `http://localhost:4173/` or the HTML file itself, not a random path that lists the repo.

