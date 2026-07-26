import { requireSessionUser } from "../../../lib/auth-session";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import {
  applySettingsPatch,
  normalizeNotificationSoundSettings,
  pickNotificationSoundSettingsPayload,
  sanitizeNotificationSoundSettingsUpdate,
} from "../../../lib/notification-sound-settings-shared";
import { nextJsonError, nextJsonOk } from "../../../lib/next-json-response";
import { userMutationLimiter, userReadLimiter } from "../../../lib/rate-limit";
import { USER_NOTIFICATION_SETTINGS_COLUMNS } from "../../../lib/supabase-query-columns";

export const dynamic = "force-dynamic";

async function fetchSettingsForUser(supabase, userId) {
  const { data, error } = await supabase
    .from("user_notification_settings")
    .select(USER_NOTIFICATION_SETTINGS_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function createDefaultSettingsForUser(supabase, userId) {
  const payload = {
    user_id: userId,
    ...pickNotificationSoundSettingsPayload({}),
  };

  const { data, error } = await supabase
    .from("user_notification_settings")
    .insert(payload)
    .select(USER_NOTIFICATION_SETTINGS_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getOrCreateSettings(session) {
  const existing = await fetchSettingsForUser(session.supabase, session.id);

  if (existing) {
    return existing;
  }

  return createDefaultSettingsForUser(session.supabase, session.id);
}

function serializeSettings(row) {
  return normalizeNotificationSoundSettings(row || {});
}

export async function GET() {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return nextJsonError("يجب تسجيل الدخول.", 401);
    }

    const rateLimited = await enforceRateLimit(userReadLimiter, session.email);

    if (rateLimited) {
      return rateLimited;
    }

    const row = await getOrCreateSettings(session);

    return nextJsonOk({
      settings: serializeSettings(row),
      created: Boolean(row?.created_at),
    });
  } catch (error) {
    return nextJsonError(error, 500);
  }
}

export async function PUT(request) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return nextJsonError("يجب تسجيل الدخول.", 401);
    }

    const rateLimited = await enforceRateLimit(userMutationLimiter, session.email);

    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => ({}));
    const patch = sanitizeNotificationSoundSettingsUpdate(body);

    if (Object.keys(patch).length === 0) {
      return nextJsonError("لا توجد إعدادات صالحة للتحديث.", 400);
    }

    const existing = await getOrCreateSettings(session);
    const merged = applySettingsPatch(
      normalizeNotificationSoundSettings(existing),
      patch
    );
    const payload = pickNotificationSoundSettingsPayload(merged);

    const { data, error } = await session.supabase
      .from("user_notification_settings")
      .update(payload)
      .eq("user_id", session.id)
      .select(USER_NOTIFICATION_SETTINGS_COLUMNS)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return nextJsonOk({
      settings: serializeSettings(data),
    });
  } catch (error) {
    return nextJsonError(error, 500);
  }
}
