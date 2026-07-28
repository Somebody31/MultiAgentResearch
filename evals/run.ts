// Run faithfulness-oriented evals (not claim-level fact-checking).
//
// For each question in evals/questions.json:
//   - baseline (no plant): one run
//   - with plant: two runs
//       gate           — plantMode every_normalize (re-inject every pass)
//       self_correct   — plantMode once (inject first normalize only)
//   - web search frozen via EVAL_WEB_FIXTURES when the fixture file exists
//   - up to --concurrency parallel graph runs (default 5)
//
// Usage:
//   bun run evals/run.ts
//   bun run evals/run.ts -- --id plant-entity-orbit-wallet-send
//   bun run evals/run.ts -- --concurrency 5 --out evals/results.json
//
// Then: bun run evals/score.ts

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { textContainsPlant } from "../src/fingerprints.ts";
import { llmCacheStats, resetLlmCacheStats } from "../src/llm.ts";
import {
  runResearch,
  type PlantMode,
} from "../src/pipeline.ts";
import type { Verdict } from "../src/verify.ts";

export { textContainsPlant };

const EVAL_DIR = import.meta.dir;
const QUESTIONS_PATH = join(EVAL_DIR, "questions.json");
const DEFAULT_OUT = join(EVAL_DIR, "results.json");
const WEB_FIXTURES = join(EVAL_DIR, "fixtures", "web-research.json");
const DEFAULT_CONCURRENCY = 5;

/** Eval suite: gate toughness vs self-correct rewrite. */
export type EvalSuite = "gate" | "self_correct" | "baseline";

export type EvalQuestion = {
  id: string;
  query: string;
  planted_unsupported_claim: string | null;
};

export type EvalRow = {
  id: string;
  /** Base question id without suite suffix. */
  question_id: string;
  suite: EvalSuite;
  plant_mode: PlantMode | null;
  query: string;
  planted_unsupported_claim: string | null;
  /** Final faithfulness gate verdict (last verify). */
  faithfulness_gate_verdict: Verdict | "error";
  /** How many draft rewrites ran (0 or 1 with current cap). */
  revise_loops: number;
  /**
   * True when the gate triggered at least one revise (retries >= 1).
   */
  faithfulness_gate_caught_plant: boolean | null;
  final_report: string;
  /** Plant text still present in final report (substring, case-insensitive). */
  planted_claim_leaked_to_final: boolean | null;
  /**
   * self_correct only: caught once, final pass, plant absent from final.
   * Null for other suites / no plant.
   */
  self_corrected: boolean | null;
  error?: string;
};

type EvalJob = {
  /** Unique row id (question + suite). */
  id: string;
  question_id: string;
  suite: EvalSuite;
  plant_mode: PlantMode | null;
  query: string;
  plant: string | null;
};

function parseArgs(argv: string[]) {
  const out = {
    id: null as string | null,
    outPath: DEFAULT_OUT,
    concurrency: DEFAULT_CONCURRENCY,
    /** Optional: only gate | self_correct | baseline */
    suite: null as EvalSuite | null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id") out.id = argv[++i] ?? null;
    else if (a === "--out") out.outPath = argv[++i] ?? DEFAULT_OUT;
    else if (a === "--concurrency") {
      const n = Number(argv[++i]);
      out.concurrency =
        Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_CONCURRENCY;
    } else if (a === "--suite") {
      const s = argv[++i];
      if (s === "gate" || s === "self_correct" || s === "baseline") {
        out.suite = s;
      }
    }
  }
  return out;
}

/** Expand questions into gate + self_correct jobs (or baseline). */
export function expandEvalJobs(
  questions: EvalQuestion[],
  suiteFilter?: EvalSuite | null,
): EvalJob[] {
  const jobs: EvalJob[] = [];
  for (const q of questions) {
    const hasPlant =
      q.planted_unsupported_claim != null &&
      q.planted_unsupported_claim.trim() !== "";

    if (!hasPlant) {
      if (!suiteFilter || suiteFilter === "baseline") {
        jobs.push({
          id: q.id,
          question_id: q.id,
          suite: "baseline",
          plant_mode: null,
          query: q.query,
          plant: null,
        });
      }
      continue;
    }

    const plant = q.planted_unsupported_claim;
    if (!suiteFilter || suiteFilter === "gate") {
      jobs.push({
        id: `${q.id}__gate`,
        question_id: q.id,
        suite: "gate",
        plant_mode: "every_normalize",
        query: q.query,
        plant,
      });
    }
    if (!suiteFilter || suiteFilter === "self_correct") {
      jobs.push({
        id: `${q.id}__self_correct`,
        question_id: q.id,
        suite: "self_correct",
        plant_mode: "once",
        query: q.query,
        plant,
      });
    }
  }
  return jobs;
}

/** Run async work with a fixed concurrency pool; preserve result order. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results = new Array<R>(n);
  let next = 0;
  const workers = Math.min(Math.max(1, concurrency), Math.max(1, n));

  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= n) return;
      results[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function runJob(job: EvalJob): Promise<EvalRow> {
  const plant = job.plant;
  const hasPlant = plant != null && plant.trim() !== "";

  try {
    const state = await runResearch(job.query, {
      plantUnsupportedClaim: plant,
      plantMode: job.plant_mode ?? undefined,
    });

    const verdict = state.verdict as Verdict;
    const reviseLoops = state.retries ?? 0;
    const report = state.finalReport ?? "";
    const leaked = hasPlant ? textContainsPlant(report, plant) : null;
    const caught = hasPlant ? reviseLoops >= 1 : null;
    const selfCorrected =
      job.suite === "self_correct" && hasPlant
        ? caught === true && verdict === "pass" && leaked === false
        : null;

    return {
      id: job.id,
      question_id: job.question_id,
      suite: job.suite,
      plant_mode: job.plant_mode,
      query: job.query,
      planted_unsupported_claim: plant,
      faithfulness_gate_verdict: verdict,
      revise_loops: reviseLoops,
      faithfulness_gate_caught_plant: caught,
      final_report: report,
      planted_claim_leaked_to_final: leaked,
      self_corrected: selfCorrected,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: job.id,
      question_id: job.question_id,
      suite: job.suite,
      plant_mode: job.plant_mode,
      query: job.query,
      planted_unsupported_claim: plant,
      faithfulness_gate_verdict: "error",
      revise_loops: 0,
      faithfulness_gate_caught_plant: hasPlant ? false : null,
      final_report: "",
      planted_claim_leaked_to_final: hasPlant ? false : null,
      self_corrected:
        job.suite === "self_correct" && hasPlant ? false : null,
      error: message,
    };
  }
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

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("DEEPSEEK_API_KEY is required.");
    process.exit(1);
  }

  resetLlmCacheStats();

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

  const jobs = expandEvalJobs(selected, args.suite);
  console.log(
    `Jobs: ${jobs.length} (from ${selected.length} question(s), concurrency=${args.concurrency})`,
  );

  const rows = await mapPool(jobs, args.concurrency, async (job) => {
    console.log(`\n======== ${job.id} [${job.suite}] ========`);
    const row = await runJob(job);
    if (row.error) {
      console.log(`  ERROR: ${row.error}`);
    } else {
      console.log(`  plant_mode: ${row.plant_mode}`);
      console.log(`  faithfulness_gate_verdict: ${row.faithfulness_gate_verdict}`);
      console.log(`  revise_loops: ${row.revise_loops}`);
      console.log(
        `  faithfulness_gate_caught_plant: ${row.faithfulness_gate_caught_plant}`,
      );
      console.log(
        `  planted_claim_leaked_to_final: ${row.planted_claim_leaked_to_final}`,
      );
      if (row.suite === "self_correct") {
        console.log(`  self_corrected: ${row.self_corrected}`);
      }
      console.log(`  final_report chars: ${row.final_report.length}`);
    }
    return row;
  });

  await mkdir(dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, JSON.stringify(rows, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${rows.length} row(s) → ${args.outPath}`);

  const { hitTokens, missTokens, calls } = llmCacheStats;
  const total = hitTokens + missTokens;
  const hitPct =
    total > 0 ? ((100 * hitTokens) / total).toFixed(1) : "n/a";
  console.log(
    `LLM input cache (DeepSeek prefix): calls=${calls} hit_tokens=${hitTokens} miss_tokens=${missTokens} hit_rate=${hitPct}%`,
  );
  console.log("Per-call log: LLM_LOG_CACHE=1");
  console.log("Score with: bun run evals/score.ts");
}

// Only when this file is the entry script (not when imported for helpers/tests).
if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
