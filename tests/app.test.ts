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

  test("POST /research returns a job id (async)", async () => {
    const res = await app.request("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "What is LangGraph?" }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(typeof body.id).toBe("string");
    expect(body.status === "pending" || body.status === "running").toBe(true);

    const poll = await app.request(`/jobs/${body.id}`);
    expect(poll.status).toBe(200);
    const job = await poll.json();
    expect(job.id).toBe(body.id);
  });

  test("GET /jobs/:id 404 for unknown id", async () => {
    const res = await app.request("/jobs/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("search", () => {
  test("searchDocs finds corpus files by keyword", async () => {
    const { searchDocs } = await import("../src/search.ts");
    const hits = await searchDocs("LangGraph Send parallel");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === "document")).toBe(true);
    expect(hits[0].url.startsWith("file://corpus/")).toBe(true);
  });

  test("searchAll is a function", async () => {
    const { searchAll } = await import("../src/search.ts");
    expect(typeof searchAll).toBe("function");
  });

  test("searchWeb uses frozen fixtures when EVAL_WEB_FIXTURES is set", async () => {
    const prev = process.env.EVAL_WEB_FIXTURES;
    process.env.EVAL_WEB_FIXTURES = `${import.meta.dir}/../evals/fixtures/web-mixed.json`;
    try {
      const { searchWeb } = await import("../src/search.ts");
      const hits = await searchWeb("typical production map-reduce fan-out");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((h) => h.source === "web")).toBe(true);
      expect(hits.some((h) => h.url.includes("example.com"))).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.EVAL_WEB_FIXTURES;
      else process.env.EVAL_WEB_FIXTURES = prev;
    }
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
  test("researchOne is exported", async () => {
    const { researchOne } = await import("../src/research.ts");
    expect(typeof researchOne).toBe("function");
  });
});

describe("pipeline graph", () => {
  test("runResearch is exported", async () => {
    const { runResearch } = await import("../src/pipeline.ts");
    expect(typeof runResearch).toBe("function");
  });

  test("afterVerify: pass → final", async () => {
    const { afterVerify } = await import("../src/pipeline.ts");
    expect(afterVerify({ verdict: "pass", retries: 0 })).toBe("final");
  });

  test("afterVerify: revise once → retryKickoff, then final", async () => {
    const { afterVerify } = await import("../src/pipeline.ts");
    expect(afterVerify({ verdict: "revise", retries: 0 })).toBe("retryKickoff");
    expect(afterVerify({ verdict: "revise", retries: 1 })).toBe("final");
  });

  test("fanOutResearch returns one Send per sub-question", async () => {
    const { fanOutResearch } = await import("../src/pipeline.ts");
    const sends = fanOutResearch({
      query: "q",
      subQuestions: ["a", "b"],
      findings: [],
      activeSubQuestion: "",
      draft: "",
      verdict: "pass",
      retries: 0,
      finalReport: "",
    });
    expect(Array.isArray(sends)).toBe(true);
    expect((sends as unknown[]).length).toBe(2);
  });
});
