import { NextResponse } from "next/server";
import { requireSessionEmail } from "../../../../lib/auth-session";
import {
  resolveSiteTypeForNotificationKey,
} from "../../../../lib/notification-center-shared";
import { normalizeNotificationKey } from "../../../../lib/notification-sound-keys";
import { normalizeNotification } from "../../../../lib/notifications-shared";
import { dispatchSiteNotification } from "../../../../lib/site-notification-dispatch.js";

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

    const result = await dispatchSiteNotification(session.supabase, {
      userEmail: session.email,
      notificationKey: key,
      title,
      message,
      type,
      url: String(body.url || "").trim() || null,
      metadata,
    });

    if (result.skipped) {
      return jsonOk({
        skipped: true,
        reason: result.reason || "delivery-blocked",
        notification: null,
      });
    }

    if (result.error) {
      throw result.error;
    }

    return jsonOk({
      notification: normalizeNotification(result.data),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
