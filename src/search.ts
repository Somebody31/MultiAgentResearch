// Look things up. Research only calls searchAll() — not Tavily directly.
//
// Two places we look:
//   searchWeb  — internet (Tavily API)
//   searchDocs — local documents (empty for now)
//
// To add another place later: write a function like searchWeb, then
// call it inside searchAll and add its results to the list.

export type SearchHit = {
  title: string;
  url: string;
  content: string;
  // which place this hit came from
  source: "web" | "document";
};

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

// Document search — not built yet. Always returns [] ("found nothing").
// Later: search your own files here and return the same SearchHit shape.
export async function searchDocs(_query: string): Promise<SearchHit[]> {
  return [];
}

// Run every search and put all hits in one list.
export async function searchAll(query: string): Promise<SearchHit[]> {
  const webHits = await searchWeb(query);
  const docHits = await searchDocs(query);
  return [...webHits, ...docHits];
}
