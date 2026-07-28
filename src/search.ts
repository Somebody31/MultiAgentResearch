// Web search. Research always calls searchAll() — not Tavily by name.
//
// Today searchAll only uses the web.
// To add another source later: write a function and call it inside searchAll.

import { readFile } from "node:fs/promises";

export type SearchHit = {
  title: string;
  url: string;
  content: string;
  source: "web";
};

/**
 * Search the internet (Tavily).
 * When EVAL_WEB_FIXTURES is set, return frozen hits from that JSON file instead
 * (used by evals so runs stay stable and free).
 */
export async function searchWeb(query: string): Promise<SearchHit[]> {
  const fixturePath = process.env.EVAL_WEB_FIXTURES;
  if (fixturePath) {
    return searchFromFixtures(query, fixturePath);
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

  const results = data.results ?? [];
  const hits: SearchHit[] = [];
  for (const r of results) {
    hits.push({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      source: "web",
    });
  }
  return hits;
}

/** All search places, merged. Right now: web only. */
export async function searchAll(query: string): Promise<SearchHit[]> {
  return searchWeb(query);
}

// --- eval fixtures ---------------------------------------------------------

type FixtureHit = {
  title?: string;
  url?: string;
  content?: string;
};

type FixtureGroup = {
  whenQueryMatches: string;
  hits: FixtureHit[];
};

type FixtureFile = {
  fixtures?: FixtureGroup[];
};

async function searchFromFixtures(
  query: string,
  fixturePath: string,
): Promise<SearchHit[]> {
  const raw = await readFile(fixturePath, "utf8");
  const data = JSON.parse(raw) as FixtureFile;
  const q = query.toLowerCase();

  for (const group of data.fixtures ?? []) {
    // "word|other" means match if the query contains any of those pieces.
    const parts = group.whenQueryMatches
      .toLowerCase()
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);

    let matches = false;
    for (const p of parts) {
      if (q.includes(p)) {
        matches = true;
        break;
      }
    }
    if (!matches) continue;

    const hits: SearchHit[] = [];
    const limited = (group.hits ?? []).slice(0, 3);
    for (const r of limited) {
      hits.push({
        title: r.title ?? "",
        url: r.url ?? "",
        content: r.content ?? "",
        source: "web",
      });
    }
    return hits;
  }

  return [];
}
