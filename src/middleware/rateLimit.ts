// Hono middleware: block POST /research when an IP is over the limit.

import type { Context, Next } from "hono";
import { isRateLimited } from "../rateLimiter.ts";

export async function rateLimitMiddleware(c: Context, next: Next) {
  // First hop in x-forwarded-for is the client when behind a proxy.
  const forwarded = c.req.header("x-forwarded-for");
  let ip = "unknown";
  if (forwarded && forwarded.trim() !== "") {
    const first = forwarded.split(",")[0];
    ip = first ? first.trim() : "unknown";
  }

  const limited = await isRateLimited(ip);
  if (limited) {
    return c.json({ error: "Too many requests, slow down." }, 429);
  }

  await next();
}
