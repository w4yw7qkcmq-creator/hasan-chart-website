/** In-memory permission cache with TTL and explicit invalidation. */

const DEFAULT_TTL_MS = 60_000;

const cache = new Map();

function cacheKey(userId, organizationId) {
  return `${String(userId || "")}:${String(organizationId || "default")}`;
}

export function getCachedPermissions(userId, organizationId) {
  const key = cacheKey(userId, organizationId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedPermissions(userId, organizationId, value, ttlMs = DEFAULT_TTL_MS) {
  const key = cacheKey(userId, organizationId);
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

export function invalidateUserPermissions(userId, organizationId = null) {
  if (organizationId) {
    cache.delete(cacheKey(userId, organizationId));
    return;
  }
  const prefix = `${String(userId || "")}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function clearPermissionCache() {
  cache.clear();
}

/** @internal test helper */
export function __getPermissionCacheSizeForTests() {
  return cache.size;
}
