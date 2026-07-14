// Check draft against findings → pass | revise.

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

  const prompt = `You are a critique / verifier agent. Check a research draft against its findings.

Findings (the only allowed evidence):
${listed}

Draft to check:
${draft}

Decide:
- "pass"   if the draft is mostly faithful: no major unsupported claims,
           no serious contradictions, and covers the main points.
- "revise" if there are important gaps, contradictions, or claims that
           are not supported by the findings.

Return ONLY valid JSON on one line, exactly one of:
{"verdict":"pass"}
{"verdict":"revise"}`;

  const text = await askMimo(prompt);

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "revise";
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      verdict?: string;
    };
    if (parsed.verdict === "pass" || parsed.verdict === "revise") {
      return parsed.verdict;
    }
  } catch {
    // ignore parse errors
  }

  return "revise";
}
