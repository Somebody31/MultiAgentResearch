// Check draft against findings. Returns "pass" or "revise".

import { askMimo } from "./mimo.ts";
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

  // Pull the JSON object out of the model text.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return "revise";

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      verdict?: string;
    };
    if (parsed.verdict === "pass" || parsed.verdict === "revise") {
      return parsed.verdict;
    }
  } catch {
    // bad JSON from the model → treat as revise
  }

  return "revise";
}
