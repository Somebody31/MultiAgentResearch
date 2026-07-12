// Merge findings into a single draft.

import { askMimo } from "./mimo.ts";
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

  const prompt = `You are an analysis agent. Merge research findings into one coherent draft.

Original research query:
${query}

Findings (may contain duplicates or near-duplicates):
${listed}

Write a single draft that:
- Covers the query using only these findings
- Merges duplicate or overlapping claims into one statement
- Notes gaps if important info is missing
- Keeps a clear, neutral tone

Return ONLY the draft text. No JSON, no preamble.`;

  return await askMimo(prompt);
}
