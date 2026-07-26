import { requireSessionEmail } from "../../../../lib/auth-session";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import {
  resolveSiteTypeForNotificationKey,
} from "../../../../lib/notification-center-shared";
import { normalizeNotificationKey } from "../../../../lib/notification-sound-keys";
import { normalizeNotification } from "../../../../lib/notifications-shared";
import { nextJsonError, nextJsonOk } from "../../../../lib/next-json-response";
import { notificationDispatchLimiter } from "../../../../lib/rate-limit";
import { dispatchSiteNotification } from "../../../../lib/site-notification-dispatch.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return nextJsonError("يجب تسجيل الدخول.", 401);
    }

    const rateLimited = await enforceRateLimit(
      notificationDispatchLimiter,
      session.email
    );

    if (rateLimited) {
      return rateLimited;
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
      return nextJsonError("عنوان الإشعار مطلوب.", 400);
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
      return nextJsonOk({
        skipped: true,
        reason: result.reason || "delivery-blocked",
        notification: null,
      });
    }

    if (result.error) {
      throw result.error;
    }

    return nextJsonOk({
      notification: normalizeNotification(result.data),
    });
  } catch (error) {
    return nextJsonError(error, 500);
  }
}
