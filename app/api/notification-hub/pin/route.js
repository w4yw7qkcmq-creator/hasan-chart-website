import { requireSessionEmail } from "../../../../lib/auth-session";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import { requireValidUuid } from "../../../../lib/partner-security";
import { userMutationLimiter } from "../../../../lib/rate-limit";
import { invalidateReadCache } from "../../../../lib/server-read-cache";
import { enrichHubNotification } from "../../../../lib/notification-hub-registry";
import { normalizeNotification } from "../../../../lib/notifications-shared";
import { nextJsonError, nextJsonOk } from "../../../../lib/next-json-response";
import { NOTIFICATION_LIST_COLUMNS } from "../../../../lib/supabase-query-columns";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return nextJsonError("يجب تسجيل الدخول.", 401);
    }

    const rateLimited = await enforceRateLimit(userMutationLimiter, session.email);

    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => ({}));
    const pinned = body?.pinned !== false;

    let id;

    try {
      id = requireValidUuid(body?.id, "notification_id");
    } catch {
      return nextJsonError("معرّف الإشعار غير صالح.", 400);
    }

    const { email, supabase } = session;

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_pinned: pinned })
      .eq("user_email", email)
      .eq("id", id)
      .select(NOTIFICATION_LIST_COLUMNS)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    invalidateReadCache(`notifications:${email}`);

    return nextJsonOk({
      notification: enrichHubNotification(normalizeNotification(data)),
    });
  } catch (error) {
    return nextJsonError(error, 500);
  }
}
