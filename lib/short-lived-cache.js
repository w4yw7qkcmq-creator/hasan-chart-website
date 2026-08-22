const store = new Map();

export async function withShortLivedCache(key, ttlMs, loader) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < ttlMs) {
    return hit.value;
  }

  const value = await loader();
  store.set(key, { value, at: now });
  return value;
}

export function invalidateShortLivedCache(keyPrefix) {
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}
