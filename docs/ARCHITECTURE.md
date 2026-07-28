# Architecture

Short reference for how the system works **today**. Planned work: [ROADMAP.md](./ROADMAP.md).

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| HTTP | Hono |
| Orchestration | LangGraph.js (`Send` fan-out) for **fixed** mode; reasoner loop for **dynamic** |
| LLM | DeepSeek V4 Flash (`DEEPSEEK_API_KEY`) |
| Web search | Tavily (`TAVILY_API_KEY`) |
| Rate limit | Upstash Redis on `POST /research` (memory Map if Upstash env is unset) |

Jobs are **in-memory** (`src/jobs.ts`). Restart clears them.

## Rate limiting

Simple fixed window on `POST /research` only:

1. Read IP from `x-forwarded-for` (else `"unknown"`).
2. `INCR ratelimit:{ip}`; on first hit, `EXPIRE` 60s.
3. If count &gt; 10 → **429** `{ "error": "Too many requests, slow down." }`.

Code: `src/rateLimiter.ts` + `src/middleware/rateLimit.ts`.

Env (production): `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`. Without them, counters stay in a process-local Map.

## Pipeline (fixed mode — default)

```text
START → plan → Send(researchOne)×N → normalize → verify → final → END
                                    ↑                │
                                    └── revise once ─┘
```

| Stage | File | Job |
|-------|------|-----|
| plan | `src/plan.ts` | Query → 2–4 sub-questions |
| researchOne | `src/research.ts` | One sub-question → findings (Tavily) |
| normalize | `src/normalize.ts` | Findings → draft |
| verify | `src/verify.ts` | Pass or revise (LLM + fingerprint checks) |
| final | `src/final.ts` | Draft → user report |

Revise rewrites the draft from the **same findings** (no re-research). Max one revise (`MAX_RETRIES = 1`).

There is **no separate “audit” node** — the pass/revise gate lives in `verify`.

## Pipeline (dynamic mode)

```text
reasoner loop (budgeted)
  → call_agents: web_research | reason | critique  (parallel, capped)
  → or finish
       ↓
normalize → verify → final   (same stages as fixed)
```

| Piece | File | Job |
|-------|------|-----|
| Reasoner | `src/reasoning/decide.ts` | LLM picks next JSON action |
| Loop | `src/reasoning/orchestrator.ts` | Budgets, traces, agent fan-out |
| Agents | `src/reasoning/agents.ts` | `web_research`, `reason`, `critique` |
| Post-gather | `src/pipeline.ts` `writeReportFromFindings` | Draft + gate + report |

API: `POST /research` with `{ "query": "...", "orchestration": "dynamic" }`. Default remains `"fixed"`.

Budgets (defaults): `maxSteps` 8 · `maxParallelAgents` 3 · `maxFindings` 24.

## Search

- `searchAll()` → `searchWeb()` only (web).
- Evals freeze web via `EVAL_WEB_FIXTURES` + `evals/fixtures/web-research.json`.

## Evals

Faithfulness plant suites only:

```bash
bun run eval:run
bun run eval:score
```

Details: [FAITHFULNESS_EVALS.md](./FAITHFULNESS_EVALS.md).

## Related docs

| Doc | Purpose |
|-----|---------|
| [README.md](../README.md) | Run / API |
| [ROADMAP.md](./ROADMAP.md) | Planned work |
| [CONTEXT.md](./CONTEXT.md) | Domain glossary (local) |
| [DECISIONS.md](./DECISIONS.md) | Change log (local) |
| [AGENTS.md](../AGENTS.md) | Agent coding rules (local) |
