// Redis connection for rate limiting (and later shared state).
//
// Defaults to local Redis: redis://127.0.0.1:6379
// Optional override: REDIS_URL in the environment.
//
// Uses Bun's built-in RedisClient (no extra npm package).

import { RedisClient } from "bun";

/** Local Redis when REDIS_URL is not set. */
export const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";

let client: RedisClient | null = null;
/** After a failed talk to Redis, stay on memory for this process. */
let redisUnavailable = false;

/** URL we will try (env or local default). */
export function getRedisUrl(): string {
  const fromEnv = process.env.REDIS_URL;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  return DEFAULT_REDIS_URL;
}

/**
 * Shared Redis client, or null if Redis is known to be down.
 * Creates the client lazily on first use.
 */
export function getRedisClient(): RedisClient | null {
  if (redisUnavailable) return null;

  if (client) return client;

  try {
    client = new RedisClient(getRedisUrl());
    return client;
  } catch {
    redisUnavailable = true;
    client = null;
    return null;
  }
}

/** Call when a Redis command fails so we stop retrying every request. */
export function markRedisUnavailable(): void {
  redisUnavailable = true;
  if (client) {
    try {
      client.close();
    } catch {
      // ignore close errors
    }
  }
  client = null;
}

export function isRedisMarkedUnavailable(): boolean {
  return redisUnavailable;
}

/** Test helper: forget the client and clear the "down" flag. */
export function resetRedisForTests(): void {
  if (client) {
    try {
      client.close();
    } catch {
      // ignore
    }
  }
  client = null;
  redisUnavailable = false;
}
