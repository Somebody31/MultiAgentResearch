# Future: dynamic reasoning + LLM-called subagents

**Status:** planned (not wired into production or evals)  
**Default today:** fixed graph — `plan` → fixed fan-out of `researchOne` × N → normalize → verify → final

## Problem

The baseline graph plans **once** into **2–4 sub-questions**, then runs **exactly one research node per sub-question**. That is great for:

- predictable cost / latency
- faithfulness evals with plants
- interview demos of LangGraph `Send`

It is weak for **reasoning-type** questions that need:

- multi-step deduction, not only web snippets
- **variable** tool/agent calls (search again, compare, critique, math)
- adaptive depth (stop early when enough, or spawn more work)

## Target shape

```
START → reasoner (LLM) ─┬─ tool/agent call ──┐
                        │         ▲          │
                        │         └── results │
                        └─ finish ────────────┴→ normalize → verify → final
```

Differences from today:

| | Fixed (current) | Dynamic (future) |
|--|-----------------|------------------|
| Fan-out | One-shot plan → N research nodes | Loop: LLM chooses next action(s) |
| N | Bounded by planner (2–4) | Bounded by **budget** (steps / tokens / agents) |
| Node types | `researchOne` only | Registry: web research, reason, critique, optional code/calc |
| Control | Graph edges | LLM tool/function calls (or structured “next actions”) |
| Evidence | Findings from search | Findings **plus** reasoning traces tagged by source |

## Orchestration modes

Expose an explicit mode so production stays safe:

```ts
type OrchestrationMode = "fixed" | "dynamic";
// default: "fixed"
```

- **`fixed`** — current `pipeline.ts` graph (unchanged).
- **`dynamic`** — new graph or runtime in `src/reasoning/` (not implemented yet).

API sketch (future):

```http
POST /research
{ "query": "...", "orchestration": "dynamic" }
```

Omit or `"fixed"` keeps today’s behavior.

## Reasoner loop (proposed)

1. **State:** `query`, `scratchpad`, `findings[]`, `step`, `budget`.
2. **LLM decides** one of:
   - `call_agents: [{ agent, input }]` — one or more in parallel (`Send` or Promise pool)
   - `finish: { rationale }` — enough evidence / reasoning to draft
3. **Execute** agents; append results to findings / scratchpad.
4. If `step >= maxSteps` or tokens exhausted → force finish.
5. Hand off to **existing** normalize → verify → final (reuse faithfulness stack).

### Why reuse normalize/verify

Dynamic agents invent more intermediate text. The faithfulness gate (LLM + strict fingerprints) should still require the **draft** to stick to allowed evidence. Reasoning steps that are not grounded should be labeled (e.g. `source: "reasoner"`) and either:

- excluded from “allowed evidence” for verify, or  
- included only when marked as inference with premises in findings  

Default preference: **verify against web findings + explicit cited premises**, not free-form scratchpad.

## Agent registry (proposed)

| Agent id | Role | Inputs → outputs |
|----------|------|------------------|
| `web_research` | Today’s `researchOne` / Tavily | sub-question → Finding[] |
| `reason` | Pure LLM step on scratchpad + findings | question + context → claim(s) with `kind: "inference"` |
| `critique` | Adversarial check of draft or plan | text → issues[] |
| (later) `calc` / tools | Deterministic helpers | expression → value |

The **reasoner** only emits agent ids from this registry (no free-form code). That keeps safety and evalability.

## Budgets & safety

- `maxSteps` (e.g. 6–12)  
- `maxParallelAgents` per step (e.g. 3)  
- `maxFindings`  
- Hard timeout wall clock  
- No recursive spawn beyond depth limit  
- Dynamic mode **off** by default; feature flag / request field  

## LangGraph notes

Two viable implementations:

1. **Outer loop node** — single `reasoner` node with conditional edge back to itself until `finish`, plus `Send` to agent nodes that rejoin the reasoner.  
2. **Supervisor subgraph** — LangGraph-style supervisor pattern; same budgets.

Prefer (1) for fewer moving parts; keep `Send` for parallel agent fan-out **per step**, not a fixed plan-time N.

## Evals (later)

Fixed-mode faithfulness suite stays the default.

New suite ideas for dynamic mode:

- reasoning questions that need synthesis without inventing brands  
- budget adherence (never exceeds maxSteps)  
- agent choice sanity (does not call critique-only loops forever)  
- leak rate still 0% with plants on normalize  

## Out of scope for v1 of this feature

- Multi-user agent marketplace  
- Unrestricted tool use / shell  
- Replacing fixed mode for all traffic  
- Human-in-the-loop approval mid-loop (possible later)

## Implementation checklist

- [ ] Types + agent registry stubs (`src/reasoning/`)  
- [ ] Reasoner prompt + JSON action schema  
- [ ] Dynamic graph or loop wired behind `orchestration: "dynamic"`  
- [ ] API + `runResearch` option  
- [ ] Budgets + timeouts  
- [ ] Reuse normalize / verify / final  
- [ ] Unit tests for action parse + budget stop  
- [ ] Optional dynamic eval smoke  
- [ ] Docs + DECISIONS when shipping  

## Related code today

- `src/pipeline.ts` — fixed graph + `Send` fan-out  
- `src/plan.ts` — one-shot 2–4 sub-questions  
- `src/research.ts` — single web research worker  
- `src/verify.ts` / `src/fingerprints.ts` — faithfulness gate (keep for drafts)
