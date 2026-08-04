import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../../lib/auth-session";
import { enrichHubNotification } from "../../../../lib/notification-hub-registry";
import { resolveSiteTypeForNotificationKey } from "../../../../lib/notification-center-shared";
import { normalizeNotificationKey } from "../../../../lib/notification-sound-keys";
import { normalizeNotification } from "../../../../lib/notifications-shared";
import { withInFlightDedup } from "../../../../lib/server-read-cache";
import {
  applyCreatedAtIdCursor,
  buildPaginationResult,
  decodeCursor,
  parseLimit,
} from "../../../../lib/pagination.js";
import {
  NOTIFICATION_COUNT_COLUMN,
  NOTIFICATION_HUB_FEED_COLUMNS,
} from "../../../../lib/supabase-query-columns";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function jsonOk(payload, status = 200) {
  return NextResponse.json(
    { success: true, ...payload },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    }
  );
}

function jsonError(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: typeof error === "string" ? error : error?.message || "Server Error",
    },
    { status }
  );
}

function hashUserKey(email) {
  return createHash("sha256").update(String(email || "")).digest("hex").slice(0, 16);
}

function buildListQuery(supabase, { email, limit, cursor, search, key, read }) {
  let query = supabase
    .from("notifications")
    .select(NOTIFICATION_HUB_FEED_COLUMNS)
    .eq("user_email", email)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (read === "unread") {
    query = query.eq("is_read", false);
  } else if (read === "read") {
    query = query.eq("is_read", true);
  }

  if (key !== "all") {
    const normalizedKey = normalizeNotificationKey(key);
    const siteType = resolveSiteTypeForNotificationKey(normalizedKey);
    query = query.or(`notification_key.eq.${normalizedKey},type.eq.${siteType}`);
  }

  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(`title.ilike.%${escaped}%,message.ilike.%${escaped}%`);
  }

  if (cursor) {
    query = applyCreatedAtIdCursor(query, cursor);
  }

  return query;
}

async function fetchUnreadCount(supabase, email) {
  const { count, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COUNT_COLUMN, { count: "exact", head: true })
    .eq("user_email", email)
    .eq("is_read", false);

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

async function fetchNotificationHubFeed({
  supabase,
  email,
  limit,
  cursor,
  search,
  key,
  read,
  includeUnreadCount,
}) {
  const listQuery = buildListQuery(supabase, {
    email,
    limit,
    cursor,
    search,
    key,
    read,
  });

  const rowsPromise = listQuery;
  const unreadPromise = includeUnreadCount ? fetchUnreadCount(supabase, email) : Promise.resolve(null);

  const [{ data: rows, error }, unreadCount] = await Promise.all([rowsPromise, unreadPromise]);

  if (error) {
    throw new Error(error.message);
  }

  const { items: pageRows, pagination } = buildPaginationResult(rows || [], limit);

  const items = pageRows
    .map((row) => enrichHubNotification(normalizeNotification(row)))
    .filter(Boolean);

  return {
    items,
    pagination,
    nextCursor: pagination.nextCursor,
    hasMore: pagination.hasMore,
    unreadCount: includeUnreadCount ? unreadCount || 0 : undefined,
  };
}

export async function GET(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return jsonError("يجب تسجيل الدخول.", 401);
    }

    const { email, supabase } = session;
    const { searchParams } = new URL(request.url);
    const cursorRaw = String(searchParams.get("cursor") || "").trim();
    const search = String(searchParams.get("search") || "").trim();
    const key = String(searchParams.get("key") || "all").trim();
    const read = String(searchParams.get("read") || "all").trim();
    const limit = parseLimit(searchParams.get("limit"), {
      defaultLimit: DEFAULT_LIMIT,
      maxLimit: MAX_LIMIT,
    });
    const includeUnreadCount = searchParams.get("includeUnreadCount") !== "false";

    if (cursorRaw) {
      try {
        decodeCursor(cursorRaw);
      } catch {
        return jsonError("Invalid cursor", 400);
      }
    }

    const dedupKey = [
      "hub-feed",
      hashUserKey(email),
      limit,
      read,
      key,
      search,
      cursorRaw,
      includeUnreadCount ? "u1" : "u0",
    ].join(":");

    const payload = await withInFlightDedup(dedupKey, () =>
      fetchNotificationHubFeed({
        supabase,
        email,
        limit,
        cursor: cursorRaw || null,
        search,
        key,
        read,
        includeUnreadCount,
      })
    );

    return jsonOk(payload);
  } catch (error) {
    return jsonError(error, 500);
  }
}
