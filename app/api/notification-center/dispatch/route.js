import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../../lib/auth-session";
import { createUserNotification } from "../../../../lib/create-user-notification";
import {
  resolveSiteTypeForNotificationKey,
} from "../../../../lib/notification-center-shared";
import { normalizeNotificationKey } from "../../../../lib/notification-sound-keys";
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
    const key = normalizeNotificationKey(body.key);
    const title = String(body.title || "").trim();
    const message = String(body.body || body.message || "").trim();
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const type = resolveSiteTypeForNotificationKey(key, {
      ...metadata,
      type: body.type,
    });

    if (!title) {
      return jsonError("عنوان الإشعار مطلوب.", 400);
    }

    const { data, error } = await createUserNotification(session.supabase, {
      userEmail: session.email,
      title,
      message,
      type,
      notificationKey: key,
      url: String(body.url || "").trim() || null,
      metadata,
    });

    if (error) {
      throw error;
    }

    return jsonOk({
      notification: normalizeNotification(data),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
