// Tavily search. Needs TAVILY_API_KEY.

export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export async function search(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: 3,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tavily API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { results?: SearchResult[] };
  return data.results ?? [];
}
