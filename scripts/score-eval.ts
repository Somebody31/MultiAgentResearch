// Score faithfulness eval results from scripts/run-eval.ts.
//
// Two planted suites (plus baseline):
//   gate           — plant re-injected every normalize; catch + leak rates
//   self_correct   — plant once; recovery rate (caught + pass + no leak)
//
// Usage:
//   bun run scripts/score-eval.ts
//   bun run scripts/score-eval.ts -- --in data/eval-results.json

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalRow, EvalSuite } from "./run-eval.ts";

const ROOT = join(import.meta.dir, "..");
const DEFAULT_IN = join(ROOT, "data", "eval-results.json");

function parseArgs(argv: string[]) {
  let inPath = DEFAULT_IN;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--in") inPath = argv[++i] ?? DEFAULT_IN;
  }
  return { inPath };
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${((100 * n) / d).toFixed(1)}% (${n}/${d})`;
}

function suiteOf(r: EvalRow): EvalSuite {
  if (r.suite === "gate" || r.suite === "self_correct" || r.suite === "baseline") {
    return r.suite;
  }
  // Legacy rows: treat planted as gate, else baseline.
  const hasPlant =
    r.planted_unsupported_claim != null &&
    r.planted_unsupported_claim.trim() !== "";
  return hasPlant ? "gate" : "baseline";
}

function scoreGate(rows: EvalRow[]) {
  const planted = rows.filter(
    (r) =>
      r.planted_unsupported_claim != null &&
      r.planted_unsupported_claim.trim() !== "",
  );
  const caught = planted.filter((r) => r.faithfulness_gate_caught_plant === true);
  const leaked = planted.filter((r) => r.planted_claim_leaked_to_final === true);

  console.log("## Eval #1 — gate (plant every_normalize)");
  console.log("Question: is the faithfulness gate tough enough to catch/block bad content?\n");
  console.log(`  rows: ${rows.length}`);
  console.log(`  Faithfulness catch rate: ${pct(caught.length, planted.length)}`);
  console.log(
    `    (revise_loops >= 1 — gate fired at least once)`,
  );
  console.log(`  Leak rate:               ${pct(leaked.length, planted.length)}`);
  console.log(
    `    (plant still appears in final report)`,
  );
  console.log(
    `  Blocked cleanly:         ${pct(
      planted.filter(
        (r) =>
          r.faithfulness_gate_caught_plant === true &&
          r.planted_claim_leaked_to_final === false,
      ).length,
      planted.length,
    )}`,
  );
  console.log(
    `    (caught and plant not in final — usually unfaithful fallback)`,
  );
  console.log("");
}

function scoreSelfCorrect(rows: EvalRow[]) {
  const planted = rows.filter(
    (r) =>
      r.planted_unsupported_claim != null &&
      r.planted_unsupported_claim.trim() !== "",
  );
  const recovered = planted.filter((r) => r.self_corrected === true);
  const caught = planted.filter((r) => r.faithfulness_gate_caught_plant === true);
  const leaked = planted.filter((r) => r.planted_claim_leaked_to_final === true);
  const passButLeak = planted.filter(
    (r) =>
      r.faithfulness_gate_verdict === "pass" &&
      r.planted_claim_leaked_to_final === true,
  );
  const rewriteThenFallback = planted.filter(
    (r) =>
      r.faithfulness_gate_caught_plant === true &&
      r.faithfulness_gate_verdict === "revise" &&
      r.planted_claim_leaked_to_final === false,
  );

  console.log("## Eval #2 — self_correct (plant once)");
  console.log(
    "Question: after a flag, can rewrite normalize remove the bad claim?\n",
  );
  console.log(`  rows: ${rows.length}`);
  console.log(`  Catch rate (needed for rewrite): ${pct(caught.length, planted.length)}`);
  console.log(
    `  Self-correct recovery:         ${pct(recovered.length, planted.length)}`,
  );
  console.log(
    `    (caught + final pass + plant absent from final)`,
  );
  console.log(
    `  Rewrite then fallback:         ${pct(rewriteThenFallback.length, planted.length)}`,
  );
  console.log(
    `    (caught, still revise after rewrite, no leak — honest fail)`,
  );
  console.log(`  Leak rate:                     ${pct(leaked.length, planted.length)}`);
  console.log(
    `  Pass-with-leak (bad):          ${pct(passButLeak.length, planted.length)}`,
  );
  console.log("");
}

function scoreBaseline(rows: EvalRow[]) {
  let pass = 0;
  let revise = 0;
  let error = 0;
  for (const r of rows) {
    if (r.faithfulness_gate_verdict === "pass") pass += 1;
    else if (r.faithfulness_gate_verdict === "revise") revise += 1;
    else error += 1;
  }
  console.log("## Baseline (no plant)");
  console.log(`  rows: ${rows.length}`);
  console.log(`  final pass:   ${pass}`);
  console.log(`  final revise: ${revise}`);
  console.log(`  error:        ${error}`);
  console.log("");
}

async function main() {
  const { inPath } = parseArgs(process.argv.slice(2));
  const rows = JSON.parse(await readFile(inPath, "utf8")) as EvalRow[];

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(`No rows in ${inPath}. Run scripts/run-eval.ts first.`);
    process.exit(1);
  }

  const gate = rows.filter((r) => suiteOf(r) === "gate");
  const selfCorrect = rows.filter((r) => suiteOf(r) === "self_correct");
  const baseline = rows.filter((r) => suiteOf(r) === "baseline");

  console.log("Faithfulness eval summary");
  console.log("(whole-draft faithfulness gate — not claim-level fact-check)\n");
  console.log(`Results file: ${inPath}`);
  console.log(`Total rows: ${rows.length}`);
  console.log(`  gate:          ${gate.length}`);
  console.log(`  self_correct:  ${selfCorrect.length}`);
  console.log(`  baseline:      ${baseline.length}`);
  console.log("");

  if (gate.length) scoreGate(gate);
  if (selfCorrect.length) scoreSelfCorrect(selfCorrect);
  if (baseline.length) scoreBaseline(baseline);

  // Per-row table
  const idW = Math.max(4, ...rows.map((r) => r.id.length));
  console.log(
    [
      "id".padEnd(idW),
      "suite".padEnd(12),
      "verdict".padEnd(7),
      "loops",
      "caught",
      "leaked",
      "fixed",
    ].join("  "),
  );
  console.log("-".repeat(idW + 55));

  for (const r of rows) {
    console.log(
      [
        r.id.padEnd(idW),
        suiteOf(r).padEnd(12),
        String(r.faithfulness_gate_verdict).padEnd(7),
        String(r.revise_loops).padStart(5),
        String(r.faithfulness_gate_caught_plant).padStart(6),
        String(r.planted_claim_leaked_to_final).padStart(6),
        String(r.self_corrected ?? "—").padStart(5),
      ].join("  "),
    );
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
