import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/auth-session";
import {
  applySettingsPatch,
  normalizeNotificationSoundSettings,
  pickNotificationSoundSettingsPayload,
  sanitizeNotificationSoundSettingsUpdate,
} from "../../../lib/notification-sound-settings-shared";

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

async function fetchSettingsForUser(supabase, userId) {
  const { data, error } = await supabase
    .from("user_notification_settings")
    .select("*")
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
    .select("*")
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
      return jsonError("يجب تسجيل الدخول.", 401);
    }

    const row = await getOrCreateSettings(session);

    return jsonOk({
      settings: serializeSettings(row),
      created: Boolean(row?.created_at),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function PUT(request) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return jsonError("يجب تسجيل الدخول.", 401);
    }

    const body = await request.json().catch(() => ({}));
    const patch = sanitizeNotificationSoundSettingsUpdate(body);

    if (Object.keys(patch).length === 0) {
      return jsonError("لا توجد إعدادات صالحة للتحديث.", 400);
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
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return jsonOk({
      settings: serializeSettings(data),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
