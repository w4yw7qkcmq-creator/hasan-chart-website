import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../lib/auth-session";
import {
  applyNotificationSettingsPatch,
  normalizeNotificationSettings,
  sanitizeNotificationSettingsUpdate,
} from "../../../lib/notification-settings-shared.js";
import {
  getOrCreateUserNotificationSettingsRow,
  isNotificationSettingsSchemaMismatchError,
  isNotificationSettingsTableMissingError,
  logNotificationSettingsEvent,
  serializeUserNotificationSettings,
  upsertUserNotificationSettingsRow,
} from "../../../lib/user-notification-settings-server.js";

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

function mapSettingsRouteError(error) {
  if (
    isNotificationSettingsTableMissingError(error) ||
    isNotificationSettingsSchemaMismatchError(error)
  ) {
    return jsonError(error, 503);
  }

  return jsonError(error, 500);
}

export async function GET() {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return jsonError("يجب تسجيل الدخول.", 401);
    }

    logNotificationSettingsEvent("NOTIFICATION_SETTINGS_LOAD_START", {
      userId: session.id,
    });

    const row = await getOrCreateUserNotificationSettingsRow(session.supabase, session.id);
    const settings = serializeUserNotificationSettings(row);

    logNotificationSettingsEvent("NOTIFICATION_SETTINGS_LOAD_SUCCESS", {
      userId: session.id,
      rowId: row?.id || null,
      notifications_enabled: settings.notifications_enabled,
      email_copy_enabled: settings.email_copy_enabled,
      channel_preferences: settings.channel_preferences,
    });

    return jsonOk({ settings });
  } catch (error) {
    logNotificationSettingsEvent("NOTIFICATION_SETTINGS_SAVE_ERROR", {
      phase: "load",
      message: error?.message || String(error),
    });
    return mapSettingsRouteError(error);
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

    logNotificationSettingsEvent("NOTIFICATION_SETTINGS_SAVE_START", {
      userId: session.id,
      patchKeys: Object.keys(patch),
    });

    const existing = await getOrCreateUserNotificationSettingsRow(session.supabase, session.id);
    const existingSettings = serializeUserNotificationSettings(existing);

    let merged = applyNotificationSettingsPatch(existingSettings, patch);

    if (body.channel_preferences && typeof body.channel_preferences === "object") {
      merged = normalizeNotificationSettings({
        ...merged,
        channel_preferences: body.channel_preferences,
      });
    }

    const row = await upsertUserNotificationSettingsRow(session.supabase, session.id, merged);
    const settings = serializeUserNotificationSettings(row);

    return jsonOk({ settings });
  } catch (error) {
    logNotificationSettingsEvent("NOTIFICATION_SETTINGS_SAVE_ERROR", {
      phase: "save",
      message: error?.message || String(error),
    });
    return mapSettingsRouteError(error);
  }
}
