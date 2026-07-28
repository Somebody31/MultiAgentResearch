# Roadmap

Living list of planned work. **Default product path stays fixed orchestration** until a item is shipped and evals say otherwise.

Status legend: `done` · `partial` · `planned` · `later`

---

## Now (shipped baseline)

| Item | Status | Notes |
|------|--------|--------|
| Fixed graph: plan → parallel research → normalize → verify → final | done | `src/pipeline.ts` |
| Dynamic orchestration (reasoner + subagents) | done | `src/reasoning/`; API `orchestration: "dynamic"` |
| Web search (Tavily) | done | `src/search.ts` |
| Faithfulness gate + plant evals | done | `docs/FAITHFULNESS_EVALS.md` |
| Async jobs API | done | in-memory; restarts clear jobs |
| Rate limit on POST /research (Upstash + simple middleware) | done | `src/rateLimiter.ts`, `src/middleware/rateLimit.ts` |
| Live research console (vanilla UI, same-origin API) | done | `public/` + Hono `serveStatic` |

---

## Next

### 1. Dynamic orchestration (`orchestration: "dynamic"`)

| | |
|--|--|
| **Status** | **done** (v1) — reasoner loop + agents + same post-gather gate |
| **Code** | `src/reasoning/*` · `runResearch({ orchestration: "dynamic" })` · API body flag |
| **Why** | Fixed plan→N is great for cost and evals, weak when the question needs multi-step deduction, re-search, or adaptive depth |

```text
reasoner loop → call agents (budgeted) or finish
                    ↓
         existing normalize → verify → final
```

| Mode | Behavior |
|------|----------|
| `fixed` (default) | plan → researchOne × N (LangGraph) |
| `dynamic` | LLM picks next agent calls under budgets |

**Agents**

| Id | Role |
|----|------|
| `web_research` | `researchOne` / Tavily |
| `reason` | Inference from findings + scratchpad |
| `critique` | Gaps / unsupported claims (no new facts) |

**Budgets** (`src/reasoning/types.ts`): `maxSteps` 8 · `maxParallelAgents` 3 · `maxFindings` 24

**Checklist**

- [x] Types + agent registry
- [x] Reasoner prompt + JSON action schema (`decide.ts`, `parseAction.ts`)
- [x] Loop wired (`gatherWithDynamicAgents`)
- [x] API accepts mode; default remains `fixed`
- [x] Unit tests: action parse, budget stop, `runAgentCalls`, dynamic `runResearch`
- [ ] Optional dynamic eval smoke (budget + plant leak still 0%)
- [x] Decision log entry when shipping

**Still later / out of scope for v1**

- Replacing fixed mode for all traffic  
- Unrestricted tools / shell  
- Human approval mid-loop  
- Multi-tenant agent marketplace  

---

### 2. Eval & reliability hardening

| Item | Status | Notes |
|------|--------|--------|
| Grow faithfulness scenarios from failures | planned | Keep gate + self_correct suites |
| Job store beyond memory | later | Survive process restart |
| Structured traces / export | later | Debug + optional LangSmith |

---

### 3. Product polish (optional)

| Item | Status | Notes |
|------|--------|--------|
| Clarify step before expensive runs | later | Common deep-research pattern |
| Citation-focused final pass | later | Stronger source anchoring |

---

## Explicit non-goals (for now)

- Full multi-source corpus search (web-only by decision)
- Unattended auto-merge of research output into other systems
- Full Multitrack multi-session desk (v1 is a simpler live console only)

---

## How to use this doc

1. Prefer small vertical slices over big rewrites.  
2. New work: add a row here **before** large code.  
3. When shipping: tick checklist, move row to **Now**, append `docs/DECISIONS.md`.  
4. Design detail for dynamic mode lives in this section + `src/reasoning/` — no separate future-feature doc.  
5. Current system shape: [ARCHITECTURE.md](./ARCHITECTURE.md).
