// Run faithfulness-oriented evals (not claim-level fact-checking).
//
// For each question in data/eval-questions.json:
//   - optional planted unsupported text is appended after normalize (pipeline seam)
//   - web search is frozen via EVAL_WEB_FIXTURES when the fixture file exists
//   - records faithfulness gate verdict, revise loops, final report, leak
//
// Usage:
//   bun run scripts/run-eval.ts
//   bun run scripts/run-eval.ts -- --id faithfulness-plant-send-parallel
//   bun run scripts/run-eval.ts -- --out data/eval-results.json
//
// Then: bun run scripts/score-eval.ts

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runResearch } from "../src/pipeline.ts";
import type { Verdict } from "../src/verify.ts";

const ROOT = join(import.meta.dir, "..");
const QUESTIONS_PATH = join(ROOT, "data", "eval-questions.json");
const DEFAULT_OUT = join(ROOT, "data", "eval-results.json");
const WEB_FIXTURES = join(ROOT, "evals", "fixtures", "web-research.json");

export type EvalQuestion = {
  id: string;
  query: string;
  planted_unsupported_claim: string | null;
};

export type EvalRow = {
  id: string;
  query: string;
  planted_unsupported_claim: string | null;
  /** Final faithfulness gate verdict (last verify). */
  faithfulness_gate_verdict: Verdict | "error";
  /** How many revise loops ran (0 or 1 with current cap). */
  revise_loops: number;
  /**
   * True when the gate triggered at least one revise (retries >= 1).
   * Prefer this over final verdict alone when plant is re-injected after retry.
   */
  faithfulness_gate_caught_plant: boolean | null;
  final_report: string;
  /** Plant text still present in final report (substring, case-insensitive). */
  planted_claim_leaked_to_final: boolean | null;
  error?: string;
};

function parseArgs(argv: string[]) {
  const out = {
    id: null as string | null,
    outPath: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") out.id = argv[++i] ?? null;
    else if (a === "--out") out.outPath = argv[++i] ?? DEFAULT_OUT;
  }
  return out;
}

/** Loose match so light rephrasing still counts as a leak. */
export function textContainsPlant(
  haystack: string,
  plant: string | null,
): boolean {
  if (plant == null || plant.trim() === "") return false;
  const h = haystack.toLowerCase();
  const p = plant.trim().toLowerCase();
  if (h.includes(p)) return true;

  // Fallback: distinctive multi-word chunks (skip tiny words).
  const chunks = p
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 6)
    .slice(0, 6);
  if (chunks.length === 0) return false;
  const hits = chunks.filter((w) => h.includes(w)).length;
  return hits >= Math.min(3, chunks.length);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Freeze web when fixture file is present (no Tavily in eval runs).
  try {
    await readFile(WEB_FIXTURES, "utf8");
    process.env.EVAL_WEB_FIXTURES = WEB_FIXTURES;
    console.log(`Web fixtures: ${WEB_FIXTURES}`);
  } catch {
    console.log("Web fixtures: none (live Tavily if TAVILY_API_KEY is set)");
  }

  if (!process.env.MIMO_API_KEY) {
    console.error("MIMO_API_KEY is required.");
    process.exit(1);
  }

  const questions = JSON.parse(
    await readFile(QUESTIONS_PATH, "utf8"),
  ) as EvalQuestion[];

  const selected = args.id
    ? questions.filter((q) => q.id === args.id)
    : questions;

  if (selected.length === 0) {
    console.error("No questions matched. Known ids:");
    for (const q of questions) console.error(`  - ${q.id}`);
    process.exit(1);
  }

  const rows: EvalRow[] = [];

  for (const q of selected) {
    console.log(`\n======== ${q.id} ========`);
    const plant = q.planted_unsupported_claim;

    try {
      const state = await runResearch(q.query, {
        plantUnsupportedClaim: plant,
      });

      const verdict = state.verdict as Verdict;
      const reviseLoops = state.retries ?? 0;
      const report = state.finalReport ?? "";
      const hasPlant = plant != null && plant.trim() !== "";

      const row: EvalRow = {
        id: q.id,
        query: q.query,
        planted_unsupported_claim: plant,
        faithfulness_gate_verdict: verdict,
        revise_loops: reviseLoops,
        faithfulness_gate_caught_plant: hasPlant ? reviseLoops >= 1 : null,
        final_report: report,
        planted_claim_leaked_to_final: hasPlant
          ? textContainsPlant(report, plant)
          : null,
      };
      rows.push(row);

      console.log(`  faithfulness_gate_verdict: ${row.faithfulness_gate_verdict}`);
      console.log(`  revise_loops: ${row.revise_loops}`);
      console.log(
        `  faithfulness_gate_caught_plant: ${row.faithfulness_gate_caught_plant}`,
      );
      console.log(
        `  planted_claim_leaked_to_final: ${row.planted_claim_leaked_to_final}`,
      );
      console.log(`  final_report chars: ${report.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows.push({
        id: q.id,
        query: q.query,
        planted_unsupported_claim: plant,
        faithfulness_gate_verdict: "error",
        revise_loops: 0,
        faithfulness_gate_caught_plant:
          plant != null && plant.trim() !== "" ? false : null,
        final_report: "",
        planted_claim_leaked_to_final:
          plant != null && plant.trim() !== "" ? false : null,
        error: message,
      });
      console.log(`  ERROR: ${message}`);
    }
  }

  await mkdir(dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${rows.length} row(s) → ${args.outPath}`);
  console.log("Score with: bun run scripts/score-eval.ts");
}

// Only when this file is the entry script (not when imported for helpers/tests).
if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
