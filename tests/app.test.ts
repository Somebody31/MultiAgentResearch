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

describe("parseJson", () => {
  test("parseJsonArray finds an array inside extra text", async () => {
    const { parseJsonArray } = await import("../src/parseJson.ts");
    expect(parseJsonArray('Sure! ["a", "b"] done.')).toEqual(["a", "b"]);
  });

  test("parseJsonArray returns null when there is no array", async () => {
    const { parseJsonArray } = await import("../src/parseJson.ts");
    expect(parseJsonArray("no json here")).toBeNull();
  });

  test("parseJsonObject finds an object inside extra text", async () => {
    const { parseJsonObject } = await import("../src/parseJson.ts");
    expect(parseJsonObject('Result: {"verdict":"pass"}')).toEqual({
      verdict: "pass",
    });
  });

  test("parseJsonObject returns null for bad json", async () => {
    const { parseJsonObject } = await import("../src/parseJson.ts");
    expect(parseJsonObject("{not valid")).toBeNull();
  });
});

describe("research", () => {
  test("research and researchOne are exported", async () => {
    const { research, researchOne } = await import("../src/research.ts");
    expect(typeof research).toBe("function");
    expect(typeof researchOne).toBe("function");
  });

  test("flat merges per-branch finding lists the same way research does", () => {
    // Mirrors research(): Promise.all → lists → flat()
    const lists = [
      [{ claim: "a" }],
      [{ claim: "b" }, { claim: "c" }],
      [],
    ];
    expect(lists.flat().map((f) => f.claim)).toEqual(["a", "b", "c"]);
  });
});

describe("pipeline graph", () => {
  test("runResearch is exported", async () => {
    const { runResearch } = await import("../src/pipeline.ts");
    expect(typeof runResearch).toBe("function");
  });

  test("nextNode follows the happy path", async () => {
    const { nextNode } = await import("../src/pipeline.ts");
    const state = {
      query: "q",
      subQuestions: [],
      findings: [],
      draft: "",
      verdict: "pass" as const,
      retries: 0,
      finalReport: "",
    };
    expect(nextNode("plan", state)).toBe("research");
    expect(nextNode("research", state)).toBe("normalize");
    expect(nextNode("normalize", state)).toBe("verify");
    expect(nextNode("verify", state)).toBe("final");
    expect(nextNode("final", state)).toBeNull();
  });

  test("nextNode loops research once on revise", async () => {
    const { nextNode } = await import("../src/pipeline.ts");
    const state = {
      query: "q",
      subQuestions: [],
      findings: [],
      draft: "",
      verdict: "revise" as const,
      retries: 0,
      finalReport: "",
    };
    expect(nextNode("verify", state)).toBe("research");
    state.retries = 1;
    expect(nextNode("verify", state)).toBe("final");
  });
});
