import { expect, test } from "bun:test";
import { app } from "../src/index.ts";

test("app loads", () => {
  expect(typeof app.fetch).toBe("function");
});

test("GET /health", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
