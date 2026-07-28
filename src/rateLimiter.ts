// Count requests per IP. Used by rateLimit middleware.
//
// When UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN are set → Upstash Redis.
// When they are not (local / tests) → a small Map so the app still runs.

import { Redis } from "@upstash/redis";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 10; // 10 requests per minute per IP

const url = process.env.UPSTASH_REDIS_URL;
const token = process.env.UPSTASH_REDIS_TOKEN;

const redis =
  typeof url === "string" &&
  url.trim() !== "" &&
  typeof token === "string" &&
  token.trim() !== ""
    ? new Redis({ url: url.trim(), token: token.trim() })
    : null;

// Local fallback only (one process). Cleared by clearMemoryRateLimits in tests.
const memoryCounts = new Map<string, { count: number; resetAtMs: number }>();

/** Test helper: reset the in-memory counters. */
export function clearMemoryRateLimits(): void {
  memoryCounts.clear();
}

/**
 * True when this IP has already used its allowance for the window.
 * False means "let the request through".
 */
export async function isRateLimited(ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`;

  if (redis) {
    const current = await redis.incr(key);

    // Start the window clock on the first request only.
    if (current === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }

    return current > MAX_REQUESTS;
  }

  // No Upstash config → memory path
  return memoryIsLimited(key);
}

function memoryIsLimited(key: string): boolean {
  const now = Date.now();
  let entry = memoryCounts.get(key);

  if (!entry || now >= entry.resetAtMs) {
    entry = { count: 0, resetAtMs: now + WINDOW_SECONDS * 1000 };
    memoryCounts.set(key, entry);
  }

  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}
