// Research: search + extract short facts for one sub-question.
//
// The graph fans out with LangGraph Send() — one researchOne node per
// sub-question. This file only knows how to handle a single question.

import { askLlm } from "./llm.ts";
import { parseJsonArray } from "./parseJson.ts";
import { searchAll, type SearchHit } from "./search.ts";

export type Finding = {
  subQuestion: string;
  claim: string;
  sourceUrl: string;
};

/** Stable system prefix for DeepSeek input cache. */
export const RESEARCH_EXTRACT_SYSTEM = `Extract research findings from search results.

Return ONLY a JSON array like:
[{"claim":"short fact","sourceUrl":"https://..."}]

Rules:
- Use only facts from the search results
- 1-3 findings
- No commentary outside the JSON array`;

// One sub-question → its findings (used by the graph's researchOne node).
export async function researchOne(subQuestion: string): Promise<Finding[]> {
  const hits = await searchAll(subQuestion);
  return extractFindings(subQuestion, hits);
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

  // Dynamic tail only: sub-question then hits (hits are largest / most unique).
  const text = await askLlm({
    stage: "research",
    system: RESEARCH_EXTRACT_SYSTEM,
    user: `Sub-question:\n${subQuestion}\n\nSearch results:\n${sources}`,
  });
  const rows = parseJsonArray(text);
  if (!rows) return [];

  const findings: Finding[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const claim = (row as { claim?: unknown }).claim;
    const sourceUrl = (row as { sourceUrl?: unknown }).sourceUrl;
    if (typeof claim !== "string" || typeof sourceUrl !== "string") continue;

    findings.push({ subQuestion, claim, sourceUrl });
  }
  return findings;
}
