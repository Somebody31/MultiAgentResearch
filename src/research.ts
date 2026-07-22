// Research step: for each small question, search and extract short facts.
//
// Sub-questions do not depend on each other, so we run them in parallel:
//   researchOne(q1) ──┐
//   researchOne(q2) ──┼── wait for all ── glue into one findings list
//   researchOne(q3) ──┘
//
// That is Promise.all + flat(). Faster wall-clock time; same work overall.

import { askMimo } from "./mimo.ts";
import { parseJsonArray } from "./parseJson.ts";
import { searchAll, type SearchHit } from "./search.ts";

export type Finding = {
  subQuestion: string;
  claim: string;
  sourceUrl: string;
};

// One sub-question → its findings.
export async function researchOne(subQuestion: string): Promise<Finding[]> {
  const hits = await searchAll(subQuestion);
  return extractFindings(subQuestion, hits);
}

// All sub-questions → one combined findings list (parallel).
export async function research(subQuestions: string[]): Promise<Finding[]> {
  // Start every branch now; Promise.all waits until the slowest one finishes.
  const lists = await Promise.all(subQuestions.map(researchOne));
  // lists is like [ [f1, f2], [f3], [] ] → flat makes [f1, f2, f3]
  return lists.flat();
}

// Turn search hits into 1–3 short facts. Empty list if nothing useful.
async function extractFindings(
  subQuestion: string,
  hits: SearchHit[],
): Promise<Finding[]> {
  if (hits.length === 0) return [];

  const sources = hits
    .map(
      (r, i) =>
        `[${i + 1}] (${r.source}) ${r.title}\nURL: ${r.url}\n${r.content}`,
    )
    .join("\n\n");

  const prompt = `Extract research findings from search results.

Sub-question: ${subQuestion}

Search results:
${sources}

Return ONLY a JSON array like:
[{"claim":"short fact","sourceUrl":"https://..."}]

Use only facts from the results. 1-3 findings.`;

  const text = await askMimo(prompt);
  const rows = parseJsonArray(text);
  if (!rows) return [];

  const findings: Finding[] = [];
  for (const row of rows) {
    // Each row should look like { claim: "...", sourceUrl: "..." }
    if (typeof row !== "object" || row === null) continue;
    const claim = (row as { claim?: unknown }).claim;
    const sourceUrl = (row as { sourceUrl?: unknown }).sourceUrl;
    if (typeof claim !== "string" || typeof sourceUrl !== "string") continue;

    findings.push({ subQuestion, claim, sourceUrl });
  }
  return findings;
}
