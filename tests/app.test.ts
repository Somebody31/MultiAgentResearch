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

describe("search", () => {
  test("searchDocs returns empty until we build it", async () => {
    const { searchDocs } = await import("../src/search.ts");
    expect(await searchDocs("anything")).toEqual([]);
  });

  test("searchAll is a function", async () => {
    const { searchAll } = await import("../src/search.ts");
    expect(typeof searchAll).toBe("function");
  });
});

describe("pipeline", () => {
  test("runResearch is exported", async () => {
    const { runResearch } = await import("../src/pipeline.ts");
    expect(typeof runResearch).toBe("function");
  });
});
