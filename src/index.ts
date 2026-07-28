// HTTP server.
//
// Async jobs:
//   POST /research     → start job, return { id, status: "pending" } right away
//   GET  /jobs/:id     → poll until status is "done" or "error"
//
// Body: { "query": "...", "orchestration": "fixed" | "dynamic" }  (orchestration optional)
// Research logic lives in pipeline.ts.

import { Hono } from "hono";
import { getJob, jobToJson, startResearchJob } from "./jobs.ts";
import type { OrchestrationMode } from "./pipeline.ts";

const app = new Hono();

function parseOrchestration(value: unknown): OrchestrationMode | null {
  if (value === undefined || value === null || value === "") return "fixed";
  if (value === "fixed" || value === "dynamic") return value;
  return null;
}

app.post("/research", async (c) => {
  const body = await c.req.json();
  const query = body?.query;

  if (typeof query !== "string" || query.trim() === "") {
    return c.json({ error: 'Body must be { "query": "..." }' }, 400);
  }

  const orchestration = parseOrchestration(body?.orchestration);
  if (orchestration === null) {
    return c.json(
      { error: 'orchestration must be "fixed" or "dynamic" when set' },
      400,
    );
  }

  const job = startResearchJob(query.trim(), { orchestration });
  return c.json(jobToJson(job), 202);
});

app.get("/jobs/:id", (c) => {
  const job = getJob(c.req.param("id"));
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  return c.json(jobToJson(job));
});

app.get("/health", (c) => c.json({ ok: true }));

export { app };

export default {
  port: 8787,
  fetch: app.fetch,
};
