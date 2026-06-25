import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";

export async function POST(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { email, supabase } = session;
    const markAll = body?.all === true;
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];

    if (!markAll && ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing notification ids",
        },
        { status: 400 }
      );
    }

    let query = supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_email", email)
      .eq("is_read", false);

    if (!markAll) {
      query = query.in("id", ids);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_email", email)
      .eq("is_read", false);

    return NextResponse.json({
      success: true,
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
