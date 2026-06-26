import { Redis } from "@upstash/redis";

let redisClient = null;

export function isUpstashEnvConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function getUpstashRedis() {
  if (!isUpstashEnvConfigured()) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL.trim(),
      token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
    });
  }

  return redisClient;
}

export async function pingUpstashRedis() {
  const redis = getUpstashRedis();

  if (!redis) {
    return false;
  }

  try {
    const response = await redis.ping();
    return response === "PONG";
  } catch {
    return false;
  }
}

export async function verifyUpstashRedis() {
  const envConfigured = isUpstashEnvConfigured();

  if (!envConfigured) {
    return {
      envConfigured: false,
      mode: "memory",
      redisConnected: false,
      usesFallback: true,
    };
  }

  try {
    const redisConnected = await pingUpstashRedis();

    return {
      envConfigured: true,
      mode: redisConnected ? "redis" : "memory",
      redisConnected,
      usesFallback: !redisConnected,
    };
  } catch (error) {
    return {
      envConfigured: true,
      mode: "memory",
      redisConnected: false,
      usesFallback: true,
      error: error?.message || String(error),
    };
  }
}
