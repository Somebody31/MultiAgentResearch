// HTTP server.
//
// Async jobs:
//   POST /research     → start job, return { id, status: "pending" } right away
//   GET  /jobs/:id     → poll until status is "done" or "error"
//
// Research logic lives in pipeline.ts.

import { Hono } from "hono";
import { getJob, jobToJson, startResearchJob } from "./jobs.ts";

const app = new Hono();

app.post("/research", async (c) => {
  const body = await c.req.json();
  const query = body?.query;

  if (typeof query !== "string" || query.trim() === "") {
    return c.json({ error: 'Body must be { "query": "..." }' }, 400);
  }

  const job = startResearchJob(query.trim());
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
