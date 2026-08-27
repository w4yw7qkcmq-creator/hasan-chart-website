/**
 * Hub list merge helpers — pure functions for SSR + background fill.
 */

/**
 * Sort key aligned with API order: created_at DESC, then id DESC.
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 */
export function compareNewsByRecency(a, b) {
  const aTime = new Date(a?.created_at || 0).getTime();
  const bTime = new Date(b?.created_at || 0).getTime();

  if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
    return String(b?.id ?? "").localeCompare(String(a?.id ?? ""), undefined, { numeric: true });
  }
  if (Number.isNaN(aTime)) return 1;
  if (Number.isNaN(bTime)) return -1;
  if (bTime !== aTime) return bTime - aTime;

  return String(b?.id ?? "").localeCompare(String(a?.id ?? ""), undefined, { numeric: true });
}

/**
 * Merge news lists with id dedupe, recency sort, and hard cap.
 * @param {Array<Record<string, unknown>>} existingItems
 * @param {Array<Record<string, unknown>>} incomingItems
 * @param {number} maxSize
 */
export function mergeNewsLists(existingItems = [], incomingItems = [], maxSize) {
  const safeMax = Math.max(Number(maxSize) || 0, 0);
  if (safeMax === 0) {
    return [];
  }

  const seenIds = new Set();
  const merged = [];

  for (const item of [...existingItems, ...incomingItems]) {
    const id = item?.id;
    if (!id || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    merged.push(item);
  }

  merged.sort(compareNewsByRecency);
  return merged.slice(0, safeMax);
}
