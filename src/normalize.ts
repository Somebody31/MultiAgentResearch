// Turn many short findings into one draft paragraph set.

import { askLlm } from "./llm.ts";
import type { Finding } from "./research.ts";

export async function normalizeClaims(
  query: string,
  findings: Finding[],
): Promise<string> {
  const listed = findings
    .map(
      (f, i) =>
        `[${i + 1}] (sub-question: ${f.subQuestion})\n` +
        `Claim: ${f.claim}\n` +
        `Source: ${f.sourceUrl}`,
    )
    .join("\n\n");

  const prompt = `Merge research findings into one coherent draft.

Original query:
${query}

Findings (may include duplicates):
${listed}

Rules:
- Use only these findings
- Merge overlapping claims
- Note gaps if something important is missing
- Neutral tone

Return ONLY the draft text.`;

  return await askLlm(prompt);
}
