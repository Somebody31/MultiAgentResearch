// Check draft against findings. Returns "pass" or "revise".

import { askMimo } from "./mimo.ts";
import { parseJsonObject } from "./parseJson.ts";
import type { Finding } from "./research.ts";

export type Verdict = "pass" | "revise";

export async function verifyClaims(
  draft: string,
  findings: Finding[],
): Promise<Verdict> {
  const listed = findings
    .map((f, i) => `[${i + 1}] ${f.claim} (${f.sourceUrl})`)
    .join("\n");

  const prompt = `Check a research draft against its findings.

Findings (only allowed evidence):
${listed}

Draft:
${draft}

Decide:
- "pass" if the draft mostly matches the findings
- "revise" if there are big gaps, contradictions, or unsupported claims

Return ONLY one line of JSON, exactly one of:
{"verdict":"pass"}
{"verdict":"revise"}`;

  const text = await askMimo(prompt);
  const parsed = parseJsonObject(text);
  const verdict = parsed?.verdict;

  if (verdict === "pass" || verdict === "revise") {
    return verdict;
  }

  // Bad or missing JSON → ask for another research pass.
  return "revise";
}
