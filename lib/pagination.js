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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Quote validated scalars for PostgREST filters (timestamps with +, UUIDs, etc.).
 * @param {string} value
 */
export function formatPostgrestFilterValue(value) {
  const safe = String(value ?? "").trim();
  if (!safe) {
    throw new Error("Invalid filter value");
  }

  return `"${safe.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * @param {string} value
 */
export function parseAfterCreatedAt(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    const error = new Error("Invalid afterCreatedAt");
    error.statusCode = 400;
    throw error;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error("Invalid afterCreatedAt");
    error.statusCode = 400;
    throw error;
  }

  return raw;
}

/**
 * @param {string} value
 */
export function parseAfterId(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!UUID_RE.test(raw)) {
    const error = new Error("Invalid afterId");
    error.statusCode = 400;
    throw error;
  }

  return raw;
}

/**
 * Parse optional delta refresh params — both or neither.
 * @param {URLSearchParams} searchParams
 */
export function parseDeltaRefreshParams(searchParams) {
  const afterCreatedAtRaw = String(searchParams.get("afterCreatedAt") || "").trim();
  const afterIdRaw = String(searchParams.get("afterId") || "").trim();

  if (!afterCreatedAtRaw && !afterIdRaw) {
    return null;
  }

  if (!afterCreatedAtRaw || !afterIdRaw) {
    const error = new Error("afterCreatedAt and afterId must both be provided");
    error.statusCode = 400;
    throw error;
  }

  return {
    afterCreatedAt: parseAfterCreatedAt(afterCreatedAtRaw),
    afterId: parseAfterId(afterIdRaw),
  };
}

/**
 * Compare UUID strings for DESC order (matches PostgreSQL uuid text ordering).
 * @param {string} a
 * @param {string} b
 */
export function compareUuidDesc(a, b) {
  const aNorm = String(a ?? "").trim().toLowerCase();
  const bNorm = String(b ?? "").trim().toLowerCase();

  if (aNorm === bNorm) {
    return 0;
  }

  return aNorm < bNorm ? 1 : -1;
}

/**
 * Apply composite cursor on (created_at, id) descending order — older-than only.
 */
export function applyCreatedAtIdCursor(query, cursor) {
  if (!cursor) {
    return query;
  }

  const { createdAt, id } = decodeCursor(cursor);
  return query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
}

/**
 * Apply newer-than composite key for delta refresh (created_at DESC, id DESC lists).
 * @param {import("@supabase/postgrest-js").PostgrestFilterBuilder<any, any, any>} query
 * @param {{ afterCreatedAt: string, afterId: string }} delta
 */
export function applyNewerThanCreatedAtIdCursor(query, { afterCreatedAt, afterId }) {
  const ts = formatPostgrestFilterValue(afterCreatedAt);
  const id = formatPostgrestFilterValue(afterId);

  return query.or(`created_at.gt.${ts},and(created_at.eq.${ts},id.gt.${id})`);
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
