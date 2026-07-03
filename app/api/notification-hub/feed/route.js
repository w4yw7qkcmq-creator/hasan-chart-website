import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../../lib/auth-session";
import { enrichHubNotification } from "../../../../lib/notification-hub-registry";
import { resolveSiteTypeForNotificationKey } from "../../../../lib/notification-center-shared";
import { normalizeNotificationKey } from "../../../../lib/notification-sound-keys";
import { normalizeNotification } from "../../../../lib/notifications-shared";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function jsonOk(payload, status = 200) {
  return NextResponse.json({ success: true, ...payload }, { status });
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

    let query = supabase
      .from("notifications")
      .select("*")
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

    const { data: rows, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const hasMore = (rows || []).length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows || [];
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at : null;

    const { count: unreadCount, error: countError } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("is_read", false);

    if (countError) {
      throw new Error(countError.message);
    }

    const items = pageRows
      .map((row) => enrichHubNotification(normalizeNotification(row)))
      .filter(Boolean);

    return jsonOk({
      items,
      nextCursor,
      hasMore,
      unreadCount: unreadCount || 0,
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
