import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/auth-session";
import {
  applyNotificationSettingsPatch,
  pickNotificationSettingsPayload,
  sanitizeNotificationSettingsUpdate,
} from "../../../lib/notification-settings-shared.js";
import {
  getOrCreateUserNotificationSettingsRow,
  serializeUserNotificationSettings,
} from "../../../lib/user-notification-settings-server.js";
import { pickNotificationSoundSettingsPayload } from "../../../lib/notification-sound-settings-shared.js";

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

export async function GET() {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return jsonError("يجب تسجيل الدخول.", 401);
    }

    const row = await getOrCreateUserNotificationSettingsRow(session.supabase, session.id);

    return jsonOk({
      settings: serializeUserNotificationSettings(row),
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
    const patch = sanitizeNotificationSettingsUpdate(body);

    if (Object.keys(patch).length === 0) {
      return jsonError("لا توجد إعدادات صالحة للتحديث.", 400);
    }

    const existing = await getOrCreateUserNotificationSettingsRow(session.supabase, session.id);
    const merged = applyNotificationSettingsPatch(
      serializeUserNotificationSettings(existing),
      patch
    );
    const payload = pickNotificationSettingsPayload(merged);

    let { data, error } = await session.supabase
      .from("user_notification_settings")
      .update(payload)
      .eq("user_id", session.id)
      .select("*")
      .single();

    if (
      error &&
      error.code === "PGRST204" &&
      /email_copy_enabled|dnd_|channel_preferences|notifications_enabled/i.test(String(error.message || ""))
    ) {
      const soundOnlyPayload = pickNotificationSoundSettingsPayload(merged);

      ({ data, error } = await session.supabase
        .from("user_notification_settings")
        .update(soundOnlyPayload)
        .eq("user_id", session.id)
        .select("*")
        .single());
    }

    if (error) {
      throw new Error(error.message);
    }

    return jsonOk({
      settings: serializeUserNotificationSettings(data),
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
