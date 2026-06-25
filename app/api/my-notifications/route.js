import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";
import { normalizeNotification } from "../../../lib/notifications-shared";

export async function GET(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول." },
        { status: 401 }
      );
    }

    const { email, supabase } = session;
    const { searchParams } = new URL(request.url);
    const includeRead = searchParams.get("include_read") === "1";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 50);

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!includeRead) {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const { count: unreadCount, error: countError } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("is_read", false);

    if (countError) {
      return NextResponse.json(
        { success: false, error: countError.message },
        { status: 500 }
      );
    }

    const notifications = (data || [])
      .map(normalizeNotification)
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      notifications,
      unreadCount: unreadCount || 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
