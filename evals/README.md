# Research evals (custom harness)

This folder runs **frozen web** scenarios against the real LangGraph pipeline.

## Why

- **Web** is frozen (`EVAL_WEB_FIXTURES` → `fixtures/web-research.json`) so we do not call Tavily.
- **Model** is still live (`MIMO_API_KEY`) so plan / extract / write behave like production.
- **Gates** are simple string/url checks (fast, no judge).
- **`--judge`** is optional and uses MiMo to score semantic quality.

## Run

```bash
# list scenarios only
bun run eval -- --dry-run

# gates only (needs MIMO_API_KEY)
bun run eval

# one scenario
bun run eval -- --id send-and-map-reduce

# gates + LLM judge
bun run eval -- --judge
```

## Add a scenario

1. Edit `scenarios/web-research.json` (or add another JSON file and point `run.ts` at it).
2. If the query needs new web text, add a group under `fixtures/web-research.json` with `whenQueryMatches` keywords.
3. Keep gates loose enough that wording can vary; put nuance in `judge.passIff`.

## What “pass” means

| Layer | Meaning |
|-------|---------|
| Gates | Hard checks (phrases, findings urls). |
| Judge | Semantic check against `passIff` / `mustNot`. |

A flaky model can fail gates even when the fixture data is fine—re-run once before changing scenarios.
