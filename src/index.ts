import { Hono } from "hono";
import { plan } from "./plan.ts";
import { research } from "./research.ts";
import { normalizeClaims } from "./normalize.ts";
import { verifyClaims } from "./verify.ts";

const app = new Hono();

app.post("/research", async (c) => {
  const body = await c.req.json();
  const query = body?.query;

  if (typeof query !== "string" || query.trim() === "") {
    return c.json({ error: 'Body must be { "query": "..." }' }, 400);
  }

  const q = query.trim();
  const subQuestions = await plan(q);
  const findings = await research(subQuestions);
  const draft = await normalizeClaims(q, findings);
  const verdict = await verifyClaims(draft, findings);
  return c.json({ query: q, subQuestions, findings, draft, verdict });
});

app.get("/health", (c) => c.json({ ok: true }));

export { app };

export default {
  port: 8787,
  fetch: app.fetch,
};
