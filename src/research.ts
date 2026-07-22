// Research stage: for each sub-question, gather hits (all search adapters)
// then LLM-extract findings.

import { askMimo } from "./mimo.ts";
import { searchAll, type SearchAdapter, type SearchHit } from "./search.ts";
import { webSearch } from "./searchWeb.ts";
import { docSearch } from "./searchDocs.ts";

export type Finding = {
  subQuestion: string;
  claim: string;
  sourceUrl: string;
};

/** Default evidence sources for a research branch. */
const defaultAdapters: SearchAdapter[] = [webSearch, docSearch];

/**
 * Search + extract for every sub-question (sequential for now).
 * Pass adapters in tests to swap fakes without calling Tavily.
 */
export async function research(
  subQuestions: string[],
  adapters: SearchAdapter[] = defaultAdapters,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const subQuestion of subQuestions) {
    const hits = await searchAll(subQuestion, adapters);
    const extracted = await extractFindings(subQuestion, hits);
    findings.push(...extracted);
  }

  return findings;
}

async function extractFindings(
  subQuestion: string,
  hits: SearchHit[],
): Promise<Finding[]> {
  if (hits.length === 0) {
    return [];
  }

  const sources = hits
    .map(
      (r, i) =>
        `[${i + 1}] (${r.source}) ${r.title}\nURL: ${r.url}\n${r.content}`,
    )
    .join("\n\n");

  const prompt = `You extract research findings from search results.

Sub-question: ${subQuestion}

Search results:
${sources}

Return ONLY a JSON array of objects like:
[{"claim":"short fact","sourceUrl":"https://..."}]

Use only facts from the results. 1-3 findings.`;

  const text = await askMimo(prompt);

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  const json = text.slice(start, end + 1);

  try {
    const rows = JSON.parse(json) as { claim: string; sourceUrl: string }[];
    return rows
      .filter(
        (row) =>
          typeof row?.claim === "string" && typeof row?.sourceUrl === "string",
      )
      .map((row) => ({
        subQuestion,
        claim: row.claim,
        sourceUrl: row.sourceUrl,
      }));
  } catch {
    return [];
  }
}
