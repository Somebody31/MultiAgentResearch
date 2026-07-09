import { Hono } from "hono";

const app = new Hono();

// Echo for now — pipeline comes next.
app.post("/research", async (c) => {
  const body = await c.req.json();
  return c.json(body);
});

app.get("/health", (c) => c.json({ ok: true }));

export { app };

export default {
  port: 8787,
  fetch: app.fetch,
};
