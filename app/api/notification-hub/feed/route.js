import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../../lib/auth-session";
import { enrichHubNotification } from "../../../../lib/notification-hub-registry";
import { resolveSiteTypeForNotificationKey } from "../../../../lib/notification-center-shared";
import { normalizeNotificationKey } from "../../../../lib/notification-sound-keys";
import { normalizeNotification } from "../../../../lib/notifications-shared";
import { withInFlightDedup } from "../../../../lib/server-read-cache";
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
        "Cache-Control": "no-store, max-age=0",
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
    query = query.lt("created_at", cursor);
  }

  return query;
}

async function fetchNotificationHubFeed({
  supabase,
  email,
  limit,
  cursor,
  search,
  key,
  read,
}) {
  const listQuery = buildListQuery(supabase, {
    email,
    limit,
    cursor,
    search,
    key,
    read,
  });

  const [{ data: rows, error }, { count: unreadCount, error: countError }] =
    await Promise.all([
      listQuery,
      supabase
        .from("notifications")
        .select(NOTIFICATION_COUNT_COLUMN, { count: "exact", head: true })
        .eq("user_email", email)
        .eq("is_read", false),
    ]);

  if (error) {
    throw new Error(error.message);
  }

  if (countError) {
    throw new Error(countError.message);
  }

  const hasMore = (rows || []).length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows || [];
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at : null;

  const items = pageRows
    .map((row) => enrichHubNotification(normalizeNotification(row)))
    .filter(Boolean);

  return {
    items,
    nextCursor,
    hasMore,
    unreadCount: unreadCount || 0,
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
    const cursor = String(searchParams.get("cursor") || "").trim();
    const search = String(searchParams.get("search") || "").trim();
    const key = String(searchParams.get("key") || "all").trim();
    const read = String(searchParams.get("read") || "all").trim();
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || DEFAULT_LIMIT), 1),
      MAX_LIMIT
    );

    const dedupKey = [
      "hub-feed",
      hashUserKey(email),
      limit,
      read,
      key,
      search,
      cursor,
    ].join(":");

    const payload = await withInFlightDedup(dedupKey, () =>
      fetchNotificationHubFeed({
        supabase,
        email,
        limit,
        cursor,
        search,
        key,
        read,
      })
    );

    return jsonOk(payload);
  } catch (error) {
    return jsonError(error, 500);
  }
}
