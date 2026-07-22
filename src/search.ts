// Look things up. Research only calls searchAll() — not Tavily directly.
//
// Two places we look:
//   searchWeb  — internet (Tavily API)
//   searchDocs — local files in ./corpus
//
// To add another place later: write a function like searchWeb, then
// call it inside searchAll and add its results to the list.

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

export type SearchHit = {
  title: string;
  url: string;
  content: string;
  source: "web" | "document";
};

const CORPUS_DIR = join(import.meta.dir, "..", "corpus");

// Internet search via Tavily.
export async function searchWeb(query: string): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ query, max_results: 3 }),
  });

  if (!res.ok) {
    throw new Error(`Tavily API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  return (data.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
    source: "web" as const,
  }));
}

// Local document search: read markdown files under ./corpus and rank by keyword hits.
export async function searchDocs(query: string): Promise<SearchHit[]> {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);

  let names: string[];
  try {
    names = await readdir(CORPUS_DIR);
  } catch {
    return [];
  }

  const hits: (SearchHit & { score: number })[] = [];

  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const path = join(CORPUS_DIR, name);
    const text = await readFile(path, "utf8");
    const lower = text.toLowerCase();

    // Score = how many query words appear in the file.
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += 1;
    }
    if (score === 0 && terms.length > 0) continue;

    // Snippet: first ~400 chars (good enough for the LLM to extract facts).
    const content = text.replace(/\s+/g, " ").trim().slice(0, 400);

    hits.push({
      title: basename(name, ".md"),
      url: `file://corpus/${name}`,
      content,
      source: "document",
      score: terms.length === 0 ? 1 : score,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 3).map(({ score: _s, ...hit }) => hit);
}

// Run every search and put all hits in one list.
export async function searchAll(query: string): Promise<SearchHit[]> {
  const webHits = await searchWeb(query);
  const docHits = await searchDocs(query);
  return [...webHits, ...docHits];
}
