// Look things up. Research only calls searchAll() — not Tavily directly.
//
// Today there is one place we look:
//   searchWeb — internet (Tavily API), or frozen JSON when evals set EVAL_WEB_FIXTURES
//
// To add another place later: write a function like searchWeb, then
// call it inside searchAll and add its results to the list.

import { readFile } from "node:fs/promises";

export type SearchHit = {
  title: string;
  url: string;
  content: string;
  source: "web";
};

// Internet search via Tavily — unless evals freeze the web results.
//
// Evals set EVAL_WEB_FIXTURES to a JSON file path. That file lists canned
// web hits so runs do not call Tavily (stable, free, offline-friendly).
// Shape: { "fixtures": [ { "whenQueryMatches": "keyword|other", "hits": [...] } ] }
// First matching group wins; if none match, return [].
export async function searchWeb(query: string): Promise<SearchHit[]> {
  const fixturePath = process.env.EVAL_WEB_FIXTURES;
  if (fixturePath) {
    return searchWebFromFixtures(query, fixturePath);
  }

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

type WebFixtureFile = {
  fixtures?: {
    whenQueryMatches: string;
    hits: { title?: string; url?: string; content?: string }[];
  }[];
};

async function searchWebFromFixtures(
  query: string,
  fixturePath: string,
): Promise<SearchHit[]> {
  const raw = await readFile(fixturePath, "utf8");
  const data = JSON.parse(raw) as WebFixtureFile;
  const q = query.toLowerCase();

  for (const group of data.fixtures ?? []) {
    // Simple "word|other" match (case-insensitive). Not a full regex engine.
    const parts = group.whenQueryMatches
      .toLowerCase()
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    const hit = parts.some((p) => q.includes(p));
    if (!hit) continue;

    return (group.hits ?? []).slice(0, 3).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      source: "web" as const,
    }));
  }

  return [];
}

// Run every search place and put all hits in one list.
// Right now that is only web search.
export async function searchAll(query: string): Promise<SearchHit[]> {
  return searchWeb(query);
}
