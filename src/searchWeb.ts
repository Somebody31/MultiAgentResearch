// Web search adapter — Tavily. Needs TAVILY_API_KEY.

import type { SearchAdapter, SearchHit } from "./search.ts";

export const webSearch: SearchAdapter = {
  name: "web",

  async search(query: string): Promise<SearchHit[]> {
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

    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };

    return (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      source: "web" as const,
    }));
  },
};
