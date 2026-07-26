import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../lib/auth-session";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { filterValidUuids } from "../../../lib/partner-security";
import { userMutationLimiter } from "../../../lib/rate-limit";
import { invalidateReadCache } from "../../../lib/server-read-cache";
import { NOTIFICATION_COUNT_COLUMN } from "../../../lib/supabase-query-columns";

export async function POST(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول." },
        { status: 401 }
      );
    }

    const rateLimited = await enforceRateLimit(userMutationLimiter, session.email);

    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => ({}));
    const { email, supabase } = session;
    const deleteAll = body?.all === true;
    const ids = filterValidUuids(body?.ids);

    if (!deleteAll && ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "معرّفات الإشعارات غير صالحة",
        },
        { status: 400 }
      );
    }

    let query = supabase.from("notifications").delete().eq("user_email", email);

    if (!deleteAll) {
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
      .select(NOTIFICATION_COUNT_COLUMN, { count: "exact", head: true })
      .eq("user_email", email)
      .eq("is_read", false);

    invalidateReadCache(`notifications:${email}`);

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
