// Turn many short findings into one draft paragraph set.

import { askLlm } from "./llm.ts";
import type { Finding } from "./research.ts";

export type NormalizeOptions = {
  /**
   * If set, this is a rewrite after verify returned "revise".
   * The draft must fix these issues and stay within findings.
   */
  priorReviseReason?: string | null;
};

export async function normalizeClaims(
  query: string,
  findings: Finding[],
  options?: NormalizeOptions,
): Promise<string> {
  const listed = findings
    .map(
      (f, i) =>
        `[${i + 1}] (sub-question: ${f.subQuestion})\n` +
        `Claim: ${f.claim}\n` +
        `Source: ${f.sourceUrl}`,
    )
    .join("\n\n");

  const prior = options?.priorReviseReason?.trim() ?? "";
  const priorBlock =
    prior.length > 0
      ? `
This is a REWRITE after a faithfulness failure.
Issues the verifier flagged (must not appear in the new draft):
${prior}

Rewrite rules for these issues:
- Do not restate or rephrase the flagged unsupported claims, names, numbers, or quotes.
- Stay strictly inside the findings list; if something is missing from findings, note the gap instead of inventing.
- Prefer a slightly shorter draft over including anything that triggered the prior revise.
`
      : "";

  const prompt = `Merge research findings into one coherent draft.

Original query:
${query}

Findings (may include duplicates):
${listed}
${priorBlock}
Rules:
- Use only these findings
- Merge overlapping claims
- Note gaps if something important is missing
- Neutral tone
${prior ? "- Explicitly avoid the problems named in the prior revise reason above" : ""}

Return ONLY the draft text.`;

  return await askLlm(prompt);
}
