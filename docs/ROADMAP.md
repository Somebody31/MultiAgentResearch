# Roadmap

Living list of planned work. **Default product path stays fixed orchestration** until a item is shipped and evals say otherwise.

Status legend: `done` · `partial` · `planned` · `later`

---

## Now (shipped baseline)

| Item | Status | Notes |
|------|--------|--------|
| Fixed graph: plan → parallel research → normalize → verify → final | done | `src/pipeline.ts` |
| Web search (Tavily) | done | `src/search.ts` |
| Faithfulness gate + plant evals | done | `docs/FAITHFULNESS_EVALS.md` |
| Async jobs API | done | in-memory; restarts clear jobs |
| Interview demo UI | done | mock jobs, no API keys |

---

## Next

### 1. Dynamic orchestration (`orchestration: "dynamic"`)

| | |
|--|--|
| **Status** | partial — types, agent registry, budget helpers, reserved API flag |
| **Code** | `src/reasoning/` · throws from `runResearch` / `gatherWithDynamicAgents` until wired |
| **Why** | Fixed plan→N is great for cost and evals, weak when the question needs multi-step deduction, re-search, or adaptive depth |

**Target (when built)**

```text
reasoner loop → call agents (budgeted) or finish
                    ↓
         existing normalize → verify → final
```

| Mode | Behavior |
|------|----------|
| `fixed` (default) | Today’s graph — unchanged |
| `dynamic` | LLM picks next agent calls under budgets |

**Agents (registry only)**

| Id | Role |
|----|------|
| `web_research` | Current `researchOne` / Tavily |
| `reason` | Inference from findings + scratchpad |
| `critique` | Gaps / unsupported claims (no new facts) |

**Budgets (defaults in `src/reasoning/types.ts`)**

- `maxSteps` (e.g. 8) · `maxParallelAgents` (e.g. 3) · `maxFindings` (e.g. 24)
- Force finish on budget exhaust; no free-form tools/shell in v1

**Faithfulness**

- Reuse normalize → verify → final
- Prefer verifying against web findings + explicit premises, not free-form scratchpad

**Implementation checklist**

- [x] Types + agent registry stubs (`src/reasoning/`)
- [x] `orchestration: "dynamic"` reserved (throws with clear error)
- [ ] Reasoner prompt + JSON action schema
- [ ] Loop wired (prefer outer reasoner node + `Send` per step)
- [ ] API accepts mode without throw; default remains `fixed`
- [ ] Unit tests: action parse, budget stop, `runAgentCalls`
- [ ] Optional dynamic eval smoke (budget + plant leak still 0%)
- [ ] Decision log entry when shipping

**Out of scope for v1**

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

### 3. Product / UX (optional)

| Item | Status | Notes |
|------|--------|--------|
| Demo UI wired to real API | later | Today: mock-only desk |
| Clarify step before expensive runs | later | Common deep-research pattern |
| Citation-focused final pass | later | Stronger source anchoring |

---

## Explicit non-goals (for now)

- Full multi-source corpus search (web-only by decision)
- Unattended auto-merge of research output into other systems

---

## How to use this doc

1. Prefer small vertical slices over big rewrites.  
2. New work: add a row here **before** large code.  
3. When shipping: tick checklist, move row to **Now**, append `docs/DECISIONS.md`.  
4. Design detail for dynamic mode lives in this section + `src/reasoning/` — no separate future-feature doc.
