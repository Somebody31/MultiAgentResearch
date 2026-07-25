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
  test("searchAll is a function", async () => {
    const { searchAll } = await import("../src/search.ts");
    expect(typeof searchAll).toBe("function");
  });

  test("searchWeb uses frozen fixtures when EVAL_WEB_FIXTURES is set", async () => {
    const prev = process.env.EVAL_WEB_FIXTURES;
    process.env.EVAL_WEB_FIXTURES = `${import.meta.dir}/../evals/fixtures/web-research.json`;
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

  test("afterVerify: revise once → reviseBump (rewrite, no re-research), then final", async () => {
    const { afterVerify } = await import("../src/pipeline.ts");
    expect(afterVerify({ verdict: "revise", retries: 0 })).toBe("reviseBump");
    expect(afterVerify({ verdict: "revise", retries: 1 })).toBe("final");
  });

  test("afterVerify: missing retries still allows one revise rewrite", async () => {
    const { afterVerify } = await import("../src/pipeline.ts");
    // undefined < 1 is false in JS — must coerce so the revise path runs
    expect(afterVerify({ verdict: "revise", retries: undefined })).toBe(
      "reviseBump",
    );
    expect(afterVerify({ verdict: "revise" })).toBe("reviseBump");
  });

  test("unfaithfulFallbackReport lists findings only (no draft plant)", async () => {
    const { unfaithfulFallbackReport } = await import("../src/pipeline.ts");
    const report = unfaithfulFallbackReport("q?", [
      {
        subQuestion: "s",
        claim: "real finding",
        sourceUrl: "https://example.com/a",
      },
    ]);
    expect(report).toContain("could not be verified");
    expect(report).toContain("real finding");
    expect(report).not.toContain("Orbit-Wallet-7");
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
      priorReviseReason: null,
      plantUnsupportedClaim: null,
      plantMode: "every_normalize",
      plantInjected: false,
    });
    expect(Array.isArray(sends)).toBe(true);
    expect((sends as unknown[]).length).toBe(2);
  });
});

describe("eval plant match helper", () => {
  test("textContainsPlant matches distinctive planted text", async () => {
    const { textContainsPlant } = await import("../scripts/run-eval.ts");
    const plant =
      "LangGraph Send automatically bills each parallel branch to a separate cloud wallet named Orbit-Wallet-7";
    expect(textContainsPlant(`Intro. ${plant} Outro.`, plant)).toBe(true);
    expect(textContainsPlant("normal report about Send and parallel work", plant)).toBe(
      false,
    );
  });

  test("expandEvalJobs builds gate + self_correct for plants", async () => {
    const { expandEvalJobs } = await import("../scripts/run-eval.ts");
    const jobs = expandEvalJobs([
      {
        id: "p1",
        query: "q",
        planted_unsupported_claim: "Bad claim Orbit-Wallet-7 only",
      },
      { id: "c1", query: "q2", planted_unsupported_claim: null },
    ]);
    expect(jobs.map((j) => j.id)).toEqual([
      "p1__gate",
      "p1__self_correct",
      "c1",
    ]);
    expect(jobs[0]?.plant_mode).toBe("every_normalize");
    expect(jobs[1]?.plant_mode).toBe("once");
    expect(jobs[2]?.suite).toBe("baseline");
  });

  test("mapPool runs with concurrency and preserves order", async () => {
    const { mapPool } = await import("../scripts/run-eval.ts");
    const seen: number[] = [];
    const out = await mapPool([10, 20, 30, 40, 50], 2, async (n, i) => {
      seen.push(i);
      await Bun.sleep(5);
      return n * 2;
    });
    expect(out).toEqual([20, 40, 60, 80, 100]);
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});
