// HTTP API (Hono) + static research console.
//
//   GET  /          → public/index.html (console UI)
//   POST /research  → start a job, return id right away (202)
//   GET  /jobs/:id  → poll until done or error
//   GET  /health    → { ok: true }
//
// Body for POST: { "query": "...", "orchestration": "fixed" | "dynamic" }
// "orchestration" is optional (default "fixed").

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getJob, jobToJson, startResearchJob } from "./jobs.ts";
import { rateLimitMiddleware } from "./middleware/rateLimit.ts";
import type { OrchestrationMode } from "./pipeline.ts";

const app = new Hono();

/**
 * Read orchestration from the request body.
 * Returns "fixed", "dynamic", or "bad" if the value is not allowed.
 */
function readOrchestration(value: unknown): OrchestrationMode | "bad" {
  if (value === undefined || value === null || value === "") return "fixed";
  if (value === "fixed" || value === "dynamic") return value;
  return "bad";
}

// --- API (register before static so these win) ----------------------------

// Rate limit only the expensive route.
app.post("/research", rateLimitMiddleware, async (c) => {
  const body = await c.req.json();
  const query = body?.query;

  if (typeof query !== "string" || query.trim() === "") {
    return c.json({ error: 'Body must be { "query": "..." }' }, 400);
  }

  const orchestration = readOrchestration(body?.orchestration);
  if (orchestration === "bad") {
    return c.json(
      { error: 'orchestration must be "fixed" or "dynamic" when set' },
      400,
    );
  }

  const job = startResearchJob(query.trim(), orchestration);
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

// --- Static UI (public/) --------------------------------------------------

app.use("/*", serveStatic({ root: "./public" }));

export { app };

export default {
  port: 8787,
  fetch: app.fetch,
};
