// Answer one sub-question:
//   search → web search, then extract short facts
//   llm    → model knowledge only (no web)

import { askLlm } from "./llm.ts";
import { parseJsonArray } from "./parseJson.ts";
import type { SubQuestionRoute } from "./plan.ts";
import { searchAll, type SearchHit } from "./search.ts";

export type Finding = {
  subQuestion: string;
  claim: string;
  sourceUrl: string;
};

/** Marker URL for findings that came from the model, not the web. */
export const LLM_SOURCE_URL = "llm://knowledge";

export const RESEARCH_EXTRACT_SYSTEM = `Extract research findings from search results.

Return ONLY a JSON array like:
[{"claim":"short fact","sourceUrl":"https://..."}]

Rules:
- Use only facts from the search results
- 1-3 findings
- No commentary outside the JSON array`;

export const LLM_ANSWER_SYSTEM = `Answer the sub-question from general knowledge only (no web).

Return ONLY a JSON array like:
[{"claim":"short factual answer","sourceUrl":"llm://knowledge"}]

Rules:
- 1-3 short claims that directly answer the sub-question
- Always use sourceUrl exactly: llm://knowledge
- No fake https URLs
- If unsure, say so briefly in the claim
- No commentary outside the JSON array`;

/**
 * One sub-question → findings.
 * route "search" (default) uses the web; "llm" uses the model only.
 */
export async function researchOne(
  subQuestion: string,
  route: SubQuestionRoute = "search",
): Promise<Finding[]> {
  if (route === "llm") {
    return answerWithLlm(subQuestion);
  }
  return answerWithSearch(subQuestion);
}

/** Web path: search, then extract claims. */
async function answerWithSearch(subQuestion: string): Promise<Finding[]> {
  const hits = await searchAll(subQuestion);
  return extractFindingsFromHits(subQuestion, hits);
}

/** LLM path: no search. */
async function answerWithLlm(subQuestion: string): Promise<Finding[]> {
  const text = await askLlm({
    stage: "research_llm",
    system: LLM_ANSWER_SYSTEM,
    user: `Sub-question:\n${subQuestion}`,
  });

  return findingsFromClaimArray(subQuestion, text, LLM_SOURCE_URL);
}

async function extractFindingsFromHits(
  subQuestion: string,
  hits: SearchHit[],
): Promise<Finding[]> {
  if (hits.length === 0) return [];

  const sourceParts: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    const r = hits[i]!;
    sourceParts.push(
      `[${i + 1}] (${r.source}) ${r.title}\nURL: ${r.url}\n${r.content}`,
    );
  }
  const sources = sourceParts.join("\n\n");

  const text = await askLlm({
    stage: "research",
    system: RESEARCH_EXTRACT_SYSTEM,
    user: `Sub-question:\n${subQuestion}\n\nSearch results:\n${sources}`,
  });

  return findingsFromClaimArray(subQuestion, text, null);
}

/**
 * Parse [{"claim","sourceUrl"}, ...] from model text.
 * If defaultSource is set, force that sourceUrl (llm path).
 */
function findingsFromClaimArray(
  subQuestion: string,
  text: string,
  defaultSource: string | null,
): Finding[] {
  const rows = parseJsonArray(text);
  if (!rows) {
    // If the model returned plain text, keep one finding (llm path only).
    if (defaultSource) {
      const claim = text.trim();
      if (claim === "") return [];
      return [
        {
          subQuestion,
          claim: claim.slice(0, 2000),
          sourceUrl: defaultSource,
        },
      ];
    }
    return [];
  }

  const findings: Finding[] = [];
  for (const row of rows) {
    if (typeof row === "string") {
      const claim = row.trim();
      if (claim === "" || !defaultSource) continue;
      findings.push({
        subQuestion,
        claim: claim.slice(0, 2000),
        sourceUrl: defaultSource,
      });
      continue;
    }

    if (typeof row !== "object" || row === null) continue;

    const claim = (row as { claim?: unknown }).claim;
    const sourceUrl = (row as { sourceUrl?: unknown }).sourceUrl;
    if (typeof claim !== "string" || claim.trim() === "") continue;

    let url = defaultSource;
    if (!url) {
      if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") continue;
      url = sourceUrl;
    }

    findings.push({
      subQuestion,
      claim: claim.trim().slice(0, 2000),
      sourceUrl: url,
    });
  }
  return findings;
}
