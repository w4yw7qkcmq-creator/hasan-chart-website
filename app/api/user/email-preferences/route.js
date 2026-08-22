import { requireSessionUser } from "../../../../lib/auth-session";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import { nextJsonError, nextJsonOk } from "../../../../lib/next-json-response";
import { userMutationLimiter, userReadLimiter } from "../../../../lib/rate-limit";
import {
  getMarketingPreferencesByUserId,
  serializeMarketingPreferencesForUser,
  upsertMarketingPreferences,
} from "../../../../lib/email-marketing-preferences.js";
import { EMAIL_POLICY_SOURCES } from "../../../../lib/email-policy/constants.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSessionUser();
    if (session.error) {
      return nextJsonError("يجب تسجيل الدخول.", 401);
    }

    const rateLimited = await enforceRateLimit(userReadLimiter, session.email);
    if (rateLimited) return rateLimited;

    const row = await getMarketingPreferencesByUserId(session.supabase, session.id);
    const preferences = serializeMarketingPreferencesForUser(row);

    return nextJsonOk({
      preferences: {
        ...preferences,
        serviceEmailsEnabled: true,
        serviceEmailsDescription:
          "رسائل ضرورية مرتبطة بحسابك وخدماتك — لا يمكن إيقاف رسائل الأمان والتشغيل الضرورية.",
      },
    });
  } catch (error) {
    return nextJsonError(error?.message || "تعذر تحميل تفضيلات البريد.", 500);
  }
}

export async function PUT(request) {
  try {
    const session = await requireSessionUser();
    if (session.error) {
      return nextJsonError("يجب تسجيل الدخول.", 401);
    }

    const rateLimited = await enforceRateLimit(userMutationLimiter, session.email);
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => ({}));

    if (body.userId && String(body.userId) !== String(session.id)) {
      return nextJsonError("لا يمكن تعديل تفضيلات مستخدم آخر.", 403);
    }

    if (typeof body.marketingOptIn !== "boolean") {
      return nextJsonError("marketingOptIn مطلوب (true/false).", 400);
    }

    const row = await upsertMarketingPreferences(session.supabase, {
      userId: session.id,
      marketingOptIn: body.marketingOptIn,
      source: EMAIL_POLICY_SOURCES.ACCOUNT_PREFERENCES,
      normalizedEmail: session.email,
    });

    return nextJsonOk({
      preferences: serializeMarketingPreferencesForUser(row),
    });
  } catch (error) {
    return nextJsonError(error?.message || "تعذر حفظ تفضيلات البريد.", 500);
  }
}
