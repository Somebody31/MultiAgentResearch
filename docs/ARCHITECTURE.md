# Architecture

Short reference for how the system works **today**. Planned work: [ROADMAP.md](./ROADMAP.md).

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Bun |
| HTTP | Hono |
| Orchestration | LangGraph.js (`Send` fan-out) |
| LLM | DeepSeek V4 Flash (`DEEPSEEK_API_KEY`) |
| Web search | Tavily (`TAVILY_API_KEY`) |

Jobs are **in-memory** (`src/jobs.ts`). Restart clears them. No Redis / BullMQ / Cloud Run in the current product.

## Pipeline (fixed mode)

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

## Search

- `searchAll()` → `searchWeb()` only (web).
- Evals freeze web via `EVAL_WEB_FIXTURES` + `evals/fixtures/web-research.json`.

## Dynamic mode (not shipped)

`orchestration: "dynamic"` is reserved. Stubs: `src/reasoning/`. Design and checklist: [ROADMAP.md](./ROADMAP.md).

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
| [CONTEXT.md](../CONTEXT.md) | Domain glossary (local) |
| [DECISIONS.md](./DECISIONS.md) | Change log (local) |
| [AGENTS.md](../AGENTS.md) | Agent coding rules (local) |
