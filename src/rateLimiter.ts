// Fixed window: 10 requests / 60s per IP.
// Upstash when env is set; otherwise a process-local Map (local/tests).

import { Redis } from "@upstash/redis";

const WINDOW = 60;
const MAX = 10;

const url = process.env.UPSTASH_REDIS_URL?.trim();
const token = process.env.UPSTASH_REDIS_TOKEN?.trim();
const redis = url && token ? new Redis({ url, token }) : null;

const memory = new Map<string, { count: number; resetAt: number }>();

/** Test helper: reset in-memory counters. */
export function clearMemoryRateLimits(): void {
  memory.clear();
}

/** True when this IP is over the limit. */
export async function isRateLimited(ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`;

  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, WINDOW);
    return n > MAX;
  }

  const now = Date.now();
  let e = memory.get(key);
  if (!e || now >= e.resetAt) {
    e = { count: 0, resetAt: now + WINDOW * 1000 };
    memory.set(key, e);
  }
  e.count++;
  return e.count > MAX;
}
