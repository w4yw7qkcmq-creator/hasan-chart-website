import {
  applyCreatedAtIdCursor,
  buildPaginationResult,
  decodeCursor,
  encodeCursor,
  parseLimit,
} from "../pagination.js";
import { maskIp } from "./ui-utils.js";

export const IAM_LIST_LIMITS = {
  audit: { defaultLimit: 50, maxLimit: 100 },
  security: { defaultLimit: 50, maxLimit: 100 },
  sessions: { defaultLimit: 50, maxLimit: 100 },
};

export function parseIamListParams(searchParams, { defaultLimit, maxLimit }) {
  const limit = parseLimit(searchParams.get("limit"), { defaultLimit, maxLimit });
  const cursor = String(searchParams.get("cursor") || "").trim() || null;
  const includeTotal = searchParams.get("includeTotal") === "true";
  const id = String(searchParams.get("id") || "").trim() || null;
  const includeMetadata = searchParams.get("includeMetadata") === "true";

  if (cursor) {
    decodeCursor(cursor);
  }

  return { limit, cursor, includeTotal, id, includeMetadata };
}

export function buildIamListResponse({ items, pagination, legacyKey, legacyItems, tableMissing }) {
  return {
    success: true,
    items,
    pagination,
    [legacyKey]: legacyItems ?? items,
    ...(tableMissing ? { tableMissing: true } : {}),
  };
}

export function mapAuditListRow(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    actor_id: row.actor_id,
    actor_email: row.actor_email,
    actor_type: row.actor_type,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    created_at: row.created_at,
    ip_address: maskIp(row.ip_address),
    reason: metadata.reason || metadata.summary || null,
    severity: metadata.severity || null,
  };
}

export function mapSecurityListRow(row, profileMap = {}) {
  const profile = profileMap[row.user_id];
  return {
    id: row.id,
    event_type: row.event_type,
    severity: row.severity,
    user_id: row.user_id,
    actor_email: profile?.email || null,
    user_email: profile?.email || null,
    ip_address: maskIp(row.ip_address),
    created_at: row.created_at,
    message: summarizeSecurityDetails(row.details),
  };
}

function summarizeSecurityDetails(details) {
  if (!details || typeof details !== "object") return null;
  if (typeof details.message === "string") return details.message.slice(0, 240);
  if (typeof details.reason === "string") return details.reason.slice(0, 240);
  return null;
}

export function mapSessionListRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    session_ref: row.session_id_hash ? String(row.session_id_hash).slice(0, 8) : null,
    started_at: row.started_at,
    ended_at: row.ended_at,
    end_reason: row.end_reason,
    is_admin_session: row.is_admin_session,
    last_activity_at: row.last_activity_at,
    last_seen_at: row.last_activity_at,
    ip_address: maskIp(row.ip_address),
    user_agent: row.user_agent || null,
    status: row.ended_at ? "revoked" : "active",
  };
}

export function buildSessionPaginationResult(rows, limit) {
  const safeLimit = Math.max(Number(limit) || 1, 1);
  const hasMore = (rows?.length || 0) > safeLimit;
  const items = hasMore ? rows.slice(0, safeLimit) : rows || [];
  const last = items[items.length - 1];
  const ts = last?.last_activity_at || last?.started_at;
  const nextCursor =
    hasMore && ts && last?.id
      ? encodeCursor({ createdAt: ts, id: last.id })
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

export function applyTimestampIdCursor(query, cursor, timestampColumn = "created_at") {
  if (!cursor) return query;
  const { createdAt, id } = decodeCursor(cursor);
  return query.or(
    `${timestampColumn}.lt.${createdAt},and(${timestampColumn}.eq.${createdAt},id.lt.${id})`
  );
}

export { applyCreatedAtIdCursor, buildPaginationResult };
