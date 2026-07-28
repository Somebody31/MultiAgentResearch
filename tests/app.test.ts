import { expect, test, describe } from "bun:test";
import { app } from "../src/index.ts";
import {
  clearMemoryRateLimits,
  isRateLimited,
} from "../src/rateLimiter.ts";

describe("app", () => {
  test("app loads", () => {
    expect(typeof app.fetch).toBe("function");
  });

  test("GET /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET / serves the research console", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Research console");
    expect(html).toContain("/app.js");
  });

  test("GET /styles.css is served", async () => {
    const res = await app.request("/styles.css");
    expect(res.status).toBe(200);
    const css = await res.text();
    expect(css).toContain("--bg");
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
    expect(body.orchestration).toBe("fixed");

    const poll = await app.request(`/jobs/${body.id}`);
    expect(poll.status).toBe(200);
    const job = await poll.json();
    expect(job.id).toBe(body.id);
  });

  test("POST /research accepts orchestration dynamic", async () => {
    const res = await app.request("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is LangGraph?",
        orchestration: "dynamic",
      }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.orchestration).toBe("dynamic");
  });

  test("POST /research rejects bad orchestration", async () => {
    const res = await app.request("/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "q", orchestration: "swarm" }),
    });
    expect(res.status).toBe(400);
  });

  test("GET /jobs/:id 404 for unknown id", async () => {
    const res = await app.request("/jobs/does-not-exist");
    expect(res.status).toBe(404);
  });

  test("POST /research returns 429 when rate limit is exceeded", async () => {
    clearMemoryRateLimits();
    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.50",
    };
    const body = JSON.stringify({ query: "rate limit probe" });

    let lastStatus = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.request("/research", {
        method: "POST",
        headers,
        body,
      });
      lastStatus = res.status;
      if (res.status === 429) {
        const json = await res.json();
        expect(json.error).toBe("Too many requests, slow down.");
        return;
      }
    }
    expect(lastStatus).toBe(429);
  });
});

describe("rateLimiter", () => {
  test("isRateLimited blocks after 10 hits for one IP", async () => {
    clearMemoryRateLimits();
    const ip = "198.51.100.9";

    for (let i = 0; i < 10; i++) {
      const limited = await isRateLimited(ip);
      expect(limited).toBe(false);
    }

    const blocked = await isRateLimited(ip);
    expect(blocked).toBe(true);
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

  test("reasoning resolveBudget merges defaults", async () => {
    const { resolveBudget } = await import("../src/reasoning/orchestrator.ts");
    expect(resolveBudget({ maxSteps: 3 }).maxSteps).toBe(3);
    expect(resolveBudget({ maxSteps: 3 }).maxParallelAgents).toBe(3);
  });

  test("parseReasonerAction accepts finish and call_agents", async () => {
    const { parseReasonerAction } = await import(
      "../src/reasoning/parseAction.ts"
    );
    expect(
      parseReasonerAction('{"type":"finish","rationale":"enough"}'),
    ).toEqual({ type: "finish", rationale: "enough" });
    expect(
      parseReasonerAction(
        'Sure: {"type":"call_agents","calls":[{"agent":"web_research","input":"What is Send?"}],"note":"start"}',
      ),
    ).toEqual({
      type: "call_agents",
      calls: [{ agent: "web_research", input: "What is Send?" }],
      note: "start",
    });
    expect(parseReasonerAction("not json")).toBeNull();
    expect(
      parseReasonerAction(
        '{"type":"call_agents","calls":[{"agent":"nope","input":"x"}]}',
      ),
    ).toBeNull();
  });

  test("runAgentCalls runs handlers under maxParallel", async () => {
    const { runAgentCalls } = await import("../src/reasoning/orchestrator.ts");
    const seen: string[] = [];
    const out = await runAgentCalls(
      [
        { agent: "web_research", input: "a" },
        { agent: "reason", input: "b" },
        { agent: "critique", input: "c" },
      ],
      {
        query: "q",
        findingsSoFar: [],
        scratchpad: "",
        maxParallel: 2,
        handlers: {
          web_research: async (input) => {
            seen.push(input);
            return [{ subQuestion: input, claim: `w:${input}`, sourceUrl: "t://w" }];
          },
          reason: async (input) => {
            seen.push(input);
            return [{ subQuestion: input, claim: `r:${input}`, sourceUrl: "t://r" }];
          },
          critique: async (input) => {
            seen.push(input);
            return [{ subQuestion: input, claim: `c:${input}`, sourceUrl: "t://c" }];
          },
        },
      },
    );
    expect(out).toHaveLength(2);
    expect(seen.sort()).toEqual(["a", "b"]);
    expect(out.map((r) => r.findings[0]?.claim).sort()).toEqual([
      "r:b",
      "w:a",
    ]);
  });

  test("gatherWithDynamicAgents stops on finish and max_steps", async () => {
    const { gatherWithDynamicAgents } = await import(
      "../src/reasoning/orchestrator.ts"
    );

    const finished = await gatherWithDynamicAgents("q", {
      budget: { maxSteps: 5, maxParallelAgents: 2, maxFindings: 10 },
      decide: async ({ step }) => {
        if (step === 0) {
          return {
            type: "call_agents",
            calls: [{ agent: "web_research", input: "sub" }],
          };
        }
        return { type: "finish", rationale: "done gathering" };
      },
      handlers: {
        web_research: async () => [
          { claim: "fact one", sourceUrl: "https://example.com/1" },
        ],
      },
    });
    expect(finished.stopReason).toBe("finish");
    expect(finished.findings).toHaveLength(1);
    expect(finished.traces).toHaveLength(2);

    let steps = 0;
    const capped = await gatherWithDynamicAgents("q", {
      budget: { maxSteps: 2, maxParallelAgents: 1, maxFindings: 50 },
      decide: async () => {
        steps += 1;
        return {
          type: "call_agents",
          calls: [{ agent: "web_research", input: `s${steps}` }],
        };
      },
      handlers: {
        web_research: async (input) => [
          { claim: input, sourceUrl: "https://example.com/x" },
        ],
      },
    });
    expect(capped.stopReason).toBe("max_steps");
    expect(capped.findings).toHaveLength(2);
    expect(steps).toBe(2);
  });

  test("gatherWithDynamicAgents stops on max_findings", async () => {
    const { gatherWithDynamicAgents } = await import(
      "../src/reasoning/orchestrator.ts"
    );
    const result = await gatherWithDynamicAgents("q", {
      budget: { maxSteps: 8, maxParallelAgents: 3, maxFindings: 2 },
      decide: async () => ({
        type: "call_agents",
        calls: [
          { agent: "web_research", input: "a" },
          { agent: "web_research", input: "b" },
          { agent: "web_research", input: "c" },
        ],
      }),
      handlers: {
        web_research: async (input) => [
          { claim: `hit-${input}`, sourceUrl: "https://example.com" },
        ],
      },
    });
    expect(result.stopReason).toBe("max_findings");
    expect(result.findings.length).toBeLessThanOrEqual(2);
  });

  test("runResearch dynamic gather + post-pipeline with stubbed LLM", async () => {
    const { spyOn } = await import("bun:test");
    const llm = await import("../src/llm.ts");
    const spy = spyOn(llm, "askLlm").mockImplementation(
      async (input: { stage?: string; system?: string; user?: string }) => {
        const stage = input.stage ?? "";
        if (stage === "verify") {
          return JSON.stringify({ verdict: "pass", reason: "ok" });
        }
        if (stage === "normalize") {
          return "Draft: X is a test concept used in unit tests.";
        }
        if (stage === "final") {
          return "Final report: X is a test concept.";
        }
        return "ok";
      },
    );

    try {
      const { runResearch } = await import("../src/pipeline.ts");
      let step = 0;
      const result = await runResearch("What is X?", {
        orchestration: "dynamic",
        dynamic: {
          budget: { maxSteps: 3, maxParallelAgents: 1, maxFindings: 5 },
          decide: async () => {
            step += 1;
            if (step === 1) {
              return {
                type: "call_agents",
                calls: [{ agent: "web_research", input: "X basics" }],
                note: "first look",
              };
            }
            return { type: "finish", rationale: "enough" };
          },
          handlers: {
            web_research: async () => [
              {
                subQuestion: "X basics",
                claim: "X is a test concept used in unit tests.",
                sourceUrl: "https://example.com/x",
              },
            ],
          },
        },
      });

      expect(result.orchestration).toBe("dynamic");
      expect(result.findings).toHaveLength(1);
      expect(result.stopReason).toBe("finish");
      expect(result.scratchpad).toContain("first look");
      expect(result.verdict).toBe("pass");
      expect(result.finalReport).toContain("X is a test concept");
    } finally {
      spy.mockRestore();
    }
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

  test("fanOutResearch returns one Send per planned sub-question", async () => {
    const { fanOutResearch } = await import("../src/pipeline.ts");
    const sends = fanOutResearch({
      query: "q",
      planned: [
        { question: "a", route: "search" },
        { question: "b", route: "llm" },
      ],
      findings: [],
      activeSubQuestion: "",
      activeRoute: "search",
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

describe("plan routes", () => {
  test("parsePlannedSubQuestions accepts objects and plain strings", async () => {
    const { parsePlannedSubQuestions } = await import("../src/plan.ts");
    expect(
      parsePlannedSubQuestions([
        { question: "What is X?", route: "llm" },
        { question: "Latest X release notes?", route: "search" },
        "legacy string question",
        { q: "alias field", mode: "llm" },
        { question: "  ", route: "search" },
      ]),
    ).toEqual([
      { question: "What is X?", route: "llm" },
      { question: "Latest X release notes?", route: "search" },
      { question: "legacy string question", route: "search" },
      { question: "alias field", route: "llm" },
    ]);
  });
});

describe("research routes", () => {
  test("researchOne llm route does not call search", async () => {
    const { spyOn } = await import("bun:test");
    const llm = await import("../src/llm.ts");
    const search = await import("../src/search.ts");

    const searchSpy = spyOn(search, "searchAll").mockResolvedValue([
      {
        title: "should not be used",
        url: "https://example.com",
        content: "nope",
        source: "web",
      },
    ]);
    const llmSpy = spyOn(llm, "askLlm").mockResolvedValue(
      JSON.stringify([
        { claim: "X is a concept.", sourceUrl: "llm://knowledge" },
      ]),
    );

    try {
      const { researchOne, LLM_SOURCE_URL } = await import(
        "../src/research.ts"
      );
      const findings = await researchOne("What is X in principle?", "llm");
      expect(searchSpy).not.toHaveBeenCalled();
      expect(llmSpy).toHaveBeenCalled();
      expect(findings.length).toBe(1);
      expect(findings[0]?.claim).toContain("X is a concept");
      expect(findings[0]?.sourceUrl).toBe(LLM_SOURCE_URL);
    } finally {
      searchSpy.mockRestore();
      llmSpy.mockRestore();
    }
  });
});

describe("eval plant match helper", () => {
  test("textContainsPlant matches fingerprints not generic topic words", async () => {
    const { textContainsPlant } = await import("../src/fingerprints.ts");
    const plant =
      "LangGraph Send automatically bills each parallel branch to a separate cloud wallet named Orbit-Wallet-7";
    expect(textContainsPlant(`Intro. ${plant} Outro.`, plant)).toBe(true);
    expect(textContainsPlant("normal report about Send and parallel work", plant)).toBe(
      false,
    );
    // Fallback report mentioning topic words must NOT count as a leak.
    const fallback = `Research could not be verified. Query: How does LangGraph use Send for parallel work? Findings only.`;
    expect(textContainsPlant(fallback, plant)).toBe(false);
    expect(
      textContainsPlant(
        "Must use ModelLock-7 and deepseek-v0-forbidden for verify.",
        "Compliance rule ModelLock-7 requires verify to run only on the discontinued model deepseek-v0-forbidden.",
      ),
    ).toBe(true);
  });

  test("priorReasonStillInDraft forces leftovers not in findings", async () => {
    const { priorReasonStillInDraft } = await import("../src/fingerprints.ts");
    const prior = "unsupported Orbit-Wallet-7 billing claim";
    const draft = "Send is used for fan-out. Orbit-Wallet-7 bills each branch.";
    const findings = "Send is used for fan-out. Parallel map-reduce.";
    expect(priorReasonStillInDraft(draft, findings, prior)).toContain(
      "orbit-wallet-7",
    );
    expect(
      priorReasonStillInDraft(
        "Send is used for fan-out only.",
        findings,
        prior,
      ),
    ).toEqual([]);
  });

  test("unsupportedFingerprintsInDraft finds brands not in findings", async () => {
    const { unsupportedFingerprintsInDraft } = await import(
      "../src/fingerprints.ts"
    );
    const draft =
      "Send enables fan-out. PrismCache Crystal Units Prism-CU-88 are required.";
    const findings = "Send enables fan-out. Bound concurrency in production.";
    const hits = unsupportedFingerprintsInDraft(draft, findings);
    expect(hits.some((h) => h.includes("prism"))).toBe(true);
    expect(
      unsupportedFingerprintsInDraft(
        "Send enables fan-out with a reducer.",
        findings,
      ),
    ).toEqual([]);
  });

  test("unsupportedFingerprintsInDraft ignores clean paraphrase without brands", async () => {
    const { unsupportedFingerprintsInDraft } = await import(
      "../src/fingerprints.ts"
    );
    const findings =
      "Clients should poll with backoff. POST creates a job id. Long jobs need an overall timeout.";
    const draft =
      "A robust client posts to create a job, then polls with exponential backoff and sets an overall job timeout for long-running research.";
    expect(unsupportedFingerprintsInDraft(draft, findings)).toEqual([]);
  });

  test("extractStrictFingerprints skips soft topic hyphens", async () => {
    const { extractStrictFingerprints } = await import(
      "../src/fingerprints.ts"
    );
    const soft = extractStrictFingerprints(
      "Use multi-step pipelines and in-memory maps for small systems.",
    );
    expect(soft).not.toContain("multi-step");
    expect(soft).not.toContain("in-memory");
    const hard = extractStrictFingerprints(
      "Require Orbit-Wallet-7 and ModelLock-7 before deploy.",
    );
    expect(hard.some((h) => h.includes("orbit") || h.includes("wallet"))).toBe(
      true,
    );
    expect(hard.some((h) => h.includes("modellock"))).toBe(true);
  });

  test("expandEvalJobs builds gate + self_correct for plants", async () => {
    const { expandEvalJobs } = await import("../evals/run.ts");
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
    const { mapPool } = await import("../evals/run.ts");
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
