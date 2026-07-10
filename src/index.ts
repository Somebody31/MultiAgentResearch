import { Hono } from "hono";
import { plan } from "./plan.ts";

const app = new Hono();

app.post("/research", async (c) => {
  const body = await c.req.json();
  const query = body?.query;

  if (typeof query !== "string" || query.trim() === "") {
    return c.json({ error: 'Body must be { "query": "..." }' }, 400);
  }

  const subQuestions = await plan(query.trim());
  return c.json({ query: query.trim(), subQuestions });
});

app.get("/health", (c) => c.json({ ok: true }));

export { app };

export default {
  port: 8787,
  fetch: app.fetch,
};
