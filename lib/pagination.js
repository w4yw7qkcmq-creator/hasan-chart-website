/**
 * Shared cursor pagination helpers (created_at DESC, id DESC).
 */

export const DEFAULT_NEWS_LIST_LIMIT = 20;
export const MAX_NEWS_LIST_LIMIT = 50;

export function parseLimit(value, { defaultLimit = DEFAULT_NEWS_LIST_LIMIT, maxLimit = MAX_NEWS_LIST_LIMIT } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return defaultLimit;
  }
  return Math.min(Math.max(parsed, 1), maxLimit);
}

export function encodeCursor({ createdAt, id }) {
  if (!createdAt || !id) {
    throw new Error("Invalid cursor payload");
  }
  const payload = JSON.stringify({ createdAt, id });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== "string") {
    const error = new Error("Invalid cursor");
    error.code = "INVALID_CURSOR";
    throw error;
  }

  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    const createdAt = String(parsed?.createdAt || "").trim();
    const id = String(parsed?.id || "").trim();

    if (!createdAt || !id) {
      const error = new Error("Invalid cursor");
      error.code = "INVALID_CURSOR";
      throw error;
    }

    return { createdAt, id };
  } catch (error) {
    const wrapped = new Error("Invalid cursor");
    wrapped.code = "INVALID_CURSOR";
    throw wrapped;
  }
}

/**
 * Apply composite cursor on (created_at, id) descending order.
 */
export function applyCreatedAtIdCursor(query, cursor) {
  if (!cursor) {
    return query;
  }

  const { createdAt, id } = decodeCursor(cursor);
  return query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
}

export function buildPaginationResult(rows, limit) {
  const safeLimit = Math.max(Number(limit) || 1, 1);
  const hasMore = (rows?.length || 0) > safeLimit;
  const items = hasMore ? rows.slice(0, safeLimit) : rows || [];
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last?.created_at && last?.id
      ? encodeCursor({ createdAt: last.created_at, id: last.id })
      : null;

  return {
    items,
    pagination: {
      limit: safeLimit,
      nextCursor,
      hasMore,
    },
  };
}

export function parseOffset(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export function parseIncludeTotal(searchParams) {
  return searchParams?.get?.("includeTotal") === "true";
}

export function buildStandardListResponse(items, limit, rows, legacyKey) {
  const result = buildPaginationResult(rows, limit);
  return {
    items: result.items,
    pagination: result.pagination,
    legacyKey,
    legacyItems: result.items,
  };
}
