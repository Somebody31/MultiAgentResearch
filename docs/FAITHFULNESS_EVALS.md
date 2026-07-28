# Faithfulness evals and verify gate

This project scores **whole-draft faithfulness** (draft vs gathered findings), not world fact-check or claim-level NLI.

## Two eval suites

Both use the same planted strings when a question has `planted_unsupported_claim`. They differ only in **injection policy**.

| Suite | Job id suffix | `plantMode` | Question |
|--------|----------------|-------------|----------|
| **gate** | `__gate` | `every_normalize` | Is the gate tough enough to catch/block bad content under re-injection? |
| **self_correct** | `__self_correct` | `once` | After a flag, can rewrite normalize remove the bad claim and pass? |
| **baseline** | (none) | no plant | Clean run: should pass without false revise |

### Plant modes (pipeline)

- **`every_normalize`**: eval seam appends the plant after **every** normalize (including after rewrite). Measures gate toughness in isolation.
- **`once`**: plant appended only on the **first** normalize (`plantInjected`). Measures self-correct.

Production leaves `plantUnsupportedClaim` null.

### Success metrics

**Gate**

- **Catch rate**: `revise_loops >= 1`
- **Leak rate**: plant fingerprints still in `final_report` (see scorer)
- **Blocked cleanly**: caught and not leaked (often unfaithful fallback)

**Self-correct**

- **Recovery**: caught **and** final `pass` **and** plant not in final
- **Rewrite then fallback**: caught, still `revise` after rewrite, no leak (honest fail)
- **Pass-with-leak**: final `pass` but plant still in final (bad)

**Baseline**

- Final pass / revise / error counts (watch false revises)

### Leak scorer (fingerprint-based)

`textContainsPlant` in `src/fingerprints.ts` does **not** use “any 3 long words.” It uses:

- exact plant substring or long sliding windows
- quoted spans, digit-bearing ids, CamelCase / hyphen brands
- stopwords and short tech tokens (`p99`, `429`, …) excluded so fallback reports and topic prose are not false leaks

## Pipeline revise path

```
plan → research (once) → normalize → verify → [revise once] → normalize → verify → final
```

- **No re-research** on revise: same findings, rewrite draft only (`reviseBump` → normalize).
- **`priorReviseReason`**: stored on first `revise`; passed into rewrite normalize and second verify.
- Cap: `MAX_RETRIES = 1`. Still `revise` after that → findings-only **unfaithful fallback** (no plant in normal report).

## Verify layers

1. **LLM** (`VERIFY_SYSTEM`): draft vs findings; suspicious of unsupported brands, model ids, attributed quotes, precise stats.
2. **Deterministic every pass**: `unsupportedFingerprintsInDraft(draft, findings)` — high-signal tokens in the draft that never appear in findings → force `revise` with those tokens named. Catches first-pass LLM misses and soft second passes (including re-injected plants).
3. **Deterministic re-check**: if `priorReviseReason` is set and LLM/layer-2 still say pass, `priorReasonStillInDraft` forces revise when prior-reason fingerprints remain.

Reason text should name unsupported spans so rewrite normalize and re-check can act on them.

## How to run

```bash
bun run eval:run -- --concurrency 20
bun run eval:score

# Smoke one question (both suites)
bun run eval:run -- --id plant-entity-cache-prism

# Cache hit logging
LLM_LOG_CACHE=1 bun run eval:run -- --concurrency 5
```

Eval end prints DeepSeek prefix cache totals (`hit_tokens` / `miss_tokens`).

## Target bar (product)

| Metric | Target |
|--------|--------|
| Gate catch | ≥ 99% |
| Gate leak | ~0% |
| Self-correct recovery | ≥ 94% |
| Self-correct pass-with-leak | ~0% |
| Baseline final pass | ≥ 14/15 |

## Related code

| Area | File |
|------|------|
| Fingerprints / plant match | `src/fingerprints.ts` |
| Verify | `src/verify.ts` |
| Plant seam + revise graph | `src/pipeline.ts` |
| Normalize rewrite | `src/normalize.ts` |
| Run / score | `evals/run.ts`, `evals/score.ts` |
| Questions | `evals/questions.json` |
| Web fixtures | `evals/fixtures/web-research.json` |
