// For each sub-question: Tavily search, then LLM extract → findings.

import { askMimo } from "./mimo.ts";
import { search, type SearchResult } from "./search.ts";

export type Finding = {
  subQuestion: string;
  claim: string;
  sourceUrl: string;
};

export async function research(subQuestions: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const subQuestion of subQuestions) {
    const results = await search(subQuestion);
    const extracted = await extractFindings(subQuestion, results);
    findings.push(...extracted);
  }

  return findings;
}

async function extractFindings(
  subQuestion: string,
  results: SearchResult[],
): Promise<Finding[]> {
  if (results.length === 0) {
    return [];
  }

  const sources = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
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
