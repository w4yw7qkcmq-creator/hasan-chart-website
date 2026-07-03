import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../../lib/auth-session";
import { invalidateReadCache } from "../../../../lib/server-read-cache";
import { enrichHubNotification } from "../../../../lib/notification-hub-registry";
import { normalizeNotification } from "../../../../lib/notifications-shared";

export const dynamic = "force-dynamic";

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

export async function POST(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return jsonError("يجب تسجيل الدخول.", 401);
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const pinned = body?.pinned !== false;

    if (!id) {
      return jsonError("معرّف الإشعار مطلوب.", 400);
    }

    const { email, supabase } = session;

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_pinned: pinned })
      .eq("user_email", email)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    invalidateReadCache(`notifications:${email}`);

    return jsonOk({
      notification: enrichHubNotification(normalizeNotification(data)),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
