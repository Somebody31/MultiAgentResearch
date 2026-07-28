// Rate limit for expensive routes (POST /research).
//
// Fixed window:
//   - count requests in a time window (default 60s)
//   - if count > max (default 10), reject with 429
//
// Storage:
//   1) Redis (default) — shared across processes
//   2) in-memory Map — if Redis is down, or tests force memory
//
// Redis commands: INCR key, EXPIRE on first hit, TTL for Retry-After.

import {
  getRedisClient,
  isRedisMarkedUnavailable,
  markRedisUnavailable,
} from "./redis.ts";

/** How many research starts one client may make per window. */
export const DEFAULT_RATE_LIMIT_MAX = 10;

/** Window length in seconds. */
export const DEFAULT_RATE_LIMIT_WINDOW_SEC = 60;

/** How long we wait on a Redis command before treating Redis as down. */
const REDIS_CMD_TIMEOUT_MS = 400;

export type RateLimitConfig = {
  maxRequests: number;
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (useful for Retry-After). */
  retryAfterSec: number;
  backend: "redis" | "memory";
};

export type ConsumeRateLimitOptions = {
  /** Override max (tests). */
  maxRequests?: number;
  /** Override window (tests). */
  windowSec?: number;
  /** Force memory store (tests, or when Redis is not wanted). */
  forceBackend?: "redis" | "memory";
};

// --- memory backend (one process only) ------------------------------------

type MemoryBucket = {
  count: number;
  /** Unix ms when this window ends. */
  resetAtMs: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();

/** When true, never talk to Redis (set by tests). */
let forceMemoryForTests = false;

/** Clear memory counters (tests). */
export function clearMemoryRateLimits(): void {
  memoryBuckets.clear();
}

/**
 * Tests: use the in-memory counter only (no Redis, no connect timeout).
 * Call once at the start of the test file.
 */
export function useMemoryRateLimitForTests(): void {
  forceMemoryForTests = true;
  clearMemoryRateLimits();
}

// --- config ---------------------------------------------------------------

/** Read limits from defaults (optional env overrides later if you want). */
export function getRateLimitConfig(): RateLimitConfig {
  return {
    maxRequests: DEFAULT_RATE_LIMIT_MAX,
    windowSec: DEFAULT_RATE_LIMIT_WINDOW_SEC,
  };
}

/**
 * Who is making the request?
 * Prefer proxy headers, else "local" for same-machine calls.
 */
export function clientIdFromHeaders(headers: {
  get(name: string): string | undefined | null;
}): string {
  const forwarded = headers.get("x-forwarded-for");
  if (typeof forwarded === "string" && forwarded.trim() !== "") {
    // "client, proxy1, proxy2" → use the first (original client)
    const first = forwarded.split(",")[0];
    if (first && first.trim() !== "") return first.trim();
  }

  const realIp = headers.get("x-real-ip");
  if (typeof realIp === "string" && realIp.trim() !== "") {
    return realIp.trim();
  }

  return "local";
}

/** Redis / memory key for one client on the research route. */
export function researchRateKey(clientId: string): string {
  return `rate:research:${clientId}`;
}

// --- public API -----------------------------------------------------------

/**
 * Count one request for this client.
 * Returns whether they are still under the limit.
 */
export async function consumeRateLimit(
  clientId: string,
  options?: ConsumeRateLimitOptions,
): Promise<RateLimitResult> {
  const defaults = getRateLimitConfig();
  const maxRequests = options?.maxRequests ?? defaults.maxRequests;
  const windowSec = options?.windowSec ?? defaults.windowSec;
  const key = researchRateKey(clientId);

  const forceMemory =
    forceMemoryForTests ||
    options?.forceBackend === "memory" ||
    process.env.RATE_LIMIT_MEMORY === "1" ||
    isRedisMarkedUnavailable();

  if (!forceMemory) {
    const fromRedis = await tryRedisIncr(key, windowSec);
    if (fromRedis) {
      return buildResult(
        fromRedis.count,
        fromRedis.ttlSec,
        maxRequests,
        "redis",
      );
    }
  }

  // Memory path (tests, or Redis down / timed out)
  const fromMemory = memoryIncr(key, windowSec);
  return buildResult(
    fromMemory.count,
    fromMemory.ttlSec,
    maxRequests,
    "memory",
  );
}

// --- helpers --------------------------------------------------------------

function buildResult(
  count: number,
  ttlSec: number,
  maxRequests: number,
  backend: "redis" | "memory",
): RateLimitResult {
  const allowed = count <= maxRequests;
  const remaining = allowed ? Math.max(0, maxRequests - count) : 0;
  const retryAfterSec = Math.max(1, Math.ceil(ttlSec));
  return { allowed, limit: maxRequests, remaining, retryAfterSec, backend };
}

function memoryIncr(
  key: string,
  windowSec: number,
): { count: number; ttlSec: number } {
  const now = Date.now();
  let bucket = memoryBuckets.get(key);

  // New window if missing or expired
  if (!bucket || now >= bucket.resetAtMs) {
    bucket = {
      count: 0,
      resetAtMs: now + windowSec * 1000,
    };
    memoryBuckets.set(key, bucket);
  }

  bucket.count += 1;
  const ttlSec = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));
  return { count: bucket.count, ttlSec };
}

/**
 * INCR + EXPIRE on Redis.
 * Returns null if Redis is missing, times out, or errors.
 */
async function tryRedisIncr(
  key: string,
  windowSec: number,
): Promise<{ count: number; ttlSec: number } | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const countRaw = await withTimeout(redis.incr(key), REDIS_CMD_TIMEOUT_MS);
    const count = Number(countRaw);

    // First hit in this window: start the TTL clock
    if (count === 1) {
      await withTimeout(redis.expire(key, windowSec), REDIS_CMD_TIMEOUT_MS);
    }

    let ttlSec = Number(
      await withTimeout(redis.ttl(key), REDIS_CMD_TIMEOUT_MS),
    );
    // -1 = no expire, -2 = missing — treat as full window
    if (!Number.isFinite(ttlSec) || ttlSec < 0) {
      ttlSec = windowSec;
    }

    return { count, ttlSec };
  } catch {
    markRedisUnavailable();
    return null;
  }
}

/** Reject a slow promise so a dead Redis does not hang the HTTP handler. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("redis command timed out"));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
