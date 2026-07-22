import { expect, test, describe } from "bun:test";
import { app } from "../src/index.ts";

describe("app", () => {
  test("app loads", () => {
    expect(typeof app.fetch).toBe("function");
  });

  test("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("POST /research rejects missing query", async () => {
    const res = await app.request("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("query");
  });

  test("POST /research rejects empty query", async () => {
    const res = await app.request("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "   " }),
    });
    expect(res.status).toBe(400);
  });
});

// No live LLM/Tavily calls — load checks + search seam unit tests.
describe("pipeline modules", () => {
  test("step helpers and runResearch are exported", async () => {
    const { plan } = await import("../src/plan.ts");
    const { research } = await import("../src/research.ts");
    const { normalizeClaims } = await import("../src/normalize.ts");
    const { verifyClaims } = await import("../src/verify.ts");
    const { synthesizeFinal } = await import("../src/final.ts");
    const { runResearch } = await import("../src/pipeline.ts");

    expect(typeof plan).toBe("function");
    expect(typeof research).toBe("function");
    expect(typeof normalizeClaims).toBe("function");
    expect(typeof verifyClaims).toBe("function");
    expect(typeof synthesizeFinal).toBe("function");
    expect(typeof runResearch).toBe("function");
  });
});

describe("search seam", () => {
  test("searchAll concatenates adapter hits in order", async () => {
    const { searchAll } = await import("../src/search.ts");
    const hits = await searchAll("anything", [
      {
        name: "a",
        search: async () => [
          {
            title: "A",
            url: "https://a.example",
            content: "from a",
            source: "web",
          },
        ],
      },
      {
        name: "b",
        search: async () => [
          {
            title: "B",
            url: "https://b.example",
            content: "from b",
            source: "document",
          },
        ],
      },
    ]);

    expect(hits.map((h) => h.title)).toEqual(["A", "B"]);
    expect(hits[0]?.source).toBe("web");
    expect(hits[1]?.source).toBe("document");
  });

  test("doc stub returns empty list", async () => {
    const { docSearch } = await import("../src/searchDocs.ts");
    const hits = await docSearch.search("internal policy");
    expect(hits).toEqual([]);
  });
});
