// Score faithfulness eval results from scripts/run-eval.ts.
//
// Metrics (not "truth" or claim-level fact-check):
//   - faithfulness catch rate: % of planted rows where the gate revised (≥1 loop)
//   - leak rate: % of planted rows where plant text still appears in final report
//   - pass vs revise counts (final faithfulness gate verdict)
//
// Usage:
//   bun run scripts/score-eval.ts
//   bun run scripts/score-eval.ts -- --in data/eval-results.json

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalRow } from "./run-eval.ts";

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

async function main() {
  const { inPath } = parseArgs(process.argv.slice(2));
  const rows = JSON.parse(await readFile(inPath, "utf8")) as EvalRow[];

  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(`No rows in ${inPath}. Run scripts/run-eval.ts first.`);
    process.exit(1);
  }

  const planted = rows.filter(
    (r) =>
      r.planted_unsupported_claim != null &&
      r.planted_unsupported_claim.trim() !== "",
  );
  const baseline = rows.filter(
    (r) =>
      r.planted_unsupported_claim == null ||
      r.planted_unsupported_claim.trim() === "",
  );

  const caught = planted.filter((r) => r.faithfulness_gate_caught_plant === true);
  const leaked = planted.filter((r) => r.planted_claim_leaked_to_final === true);

  let pass = 0;
  let revise = 0;
  let error = 0;
  for (const r of rows) {
    if (r.faithfulness_gate_verdict === "pass") pass += 1;
    else if (r.faithfulness_gate_verdict === "revise") revise += 1;
    else error += 1;
  }

  console.log("Faithfulness eval summary");
  console.log("(whole-draft faithfulness gate — not claim-level fact-check)\n");
  console.log(`Results file: ${inPath}`);
  console.log(`Total rows: ${rows.length}`);
  console.log(`  with plant: ${planted.length}`);
  console.log(`  baseline (no plant): ${baseline.length}`);
  console.log("");
  console.log(
    `Faithfulness catch rate: ${pct(caught.length, planted.length)}`,
  );
  console.log(
    `  (planted rows where revise_loops >= 1 — gate fired at least once)`,
  );
  console.log(`Leak rate:               ${pct(leaked.length, planted.length)}`);
  console.log(
    `  (planted rows where plant text still appears in final report)`,
  );
  console.log("");
  console.log("Final faithfulness gate verdict counts (all rows):");
  console.log(`  pass:   ${pass}`);
  console.log(`  revise: ${revise}`);
  console.log(`  error:  ${error}`);
  console.log("");

  // Per-row table
  const idW = Math.max(4, ...rows.map((r) => r.id.length));
  console.log(
    [
      "id".padEnd(idW),
      "plant",
      "verdict".padEnd(7),
      "loops",
      "caught",
      "leaked",
    ].join("  "),
  );
  console.log("-".repeat(idW + 40));

  for (const r of rows) {
    const hasPlant =
      r.planted_unsupported_claim != null &&
      r.planted_unsupported_claim.trim() !== "";
    console.log(
      [
        r.id.padEnd(idW),
        hasPlant ? "yes  " : "no   ",
        String(r.faithfulness_gate_verdict).padEnd(7),
        String(r.revise_loops).padStart(5),
        String(r.faithfulness_gate_caught_plant).padStart(6),
        String(r.planted_claim_leaked_to_final).padStart(6),
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
