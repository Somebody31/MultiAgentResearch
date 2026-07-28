// Merge many findings into one draft.

import { askLlm } from "./llm.ts";
import type { Finding } from "./research.ts";

export type NormalizeOptions = {
  /** If set, this is a rewrite after verify said "revise". */
  priorReviseReason?: string | null;
};

export const NORMALIZE_SYSTEM = `Merge research findings into one coherent draft.

Rules:
- Use only the findings provided in the user message
- Merge overlapping claims
- Note gaps if something important is missing
- Neutral tone
- If the user message includes a prior revise reason (rewrite pass), do not restate or rephrase those unsupported claims, names, numbers, or quotes; stay strictly inside findings and prefer a slightly shorter draft over inventing
- Return ONLY the draft text`;

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

  let user = `Original query:\n${query}\n\nFindings (may include duplicates):\n${listed}`;
  if (prior.length > 0) {
    user += `\n\nPrior revise reason (REWRITE — must not appear in the new draft):\n${prior}`;
  }

  return await askLlm({
    stage: "normalize",
    system: NORMALIZE_SYSTEM,
    user,
  });
}
