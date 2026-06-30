import { getSupabaseAdmin, requireSessionUser } from "../../../../lib/auth-session";
import {
  backfillAnonymousPushSubscriptions,
  savePushSubscriptionRow,
} from "../../../../lib/push-subscriptions-server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function maskValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 12) return `${text.slice(0, 4)}...`;
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function sanitizeRequestBody(body) {
  const subscription = body?.subscription || body || {};

  return {
    anonymousId: body?.anonymousId || null,
    subscription: {
      endpoint: maskValue(subscription?.endpoint),
      expirationTime: subscription?.expirationTime || null,
      keys: {
        p256dh: maskValue(subscription?.keys?.p256dh),
        auth: maskValue(subscription?.keys?.auth),
      },
    },
  };
}

function logPushEvent(event, payload = {}) {
  console.log(
    event,
    JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

function logPushError(event, payload = {}) {
  console.error(
    event,
    JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

function normalizeSubscription(body) {
  const subscription = body?.subscription || body;

  const endpoint = String(subscription?.endpoint || "").trim();
  const p256dh = String(subscription?.keys?.p256dh || "").trim();
  const authKey = String(subscription?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !authKey) {
    return {
      error: "INVALID_SUBSCRIPTION",
      details: {
        hasEndpoint: Boolean(endpoint),
        hasP256dh: Boolean(p256dh),
        hasAuth: Boolean(authKey),
      },
    };
  }

  return {
    endpoint,
    p256dh,
    auth: authKey,
  };
}

export async function POST(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

    logPushEvent("push:api:start", {
      route: "/api/push/subscribe",
      method: "POST",
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      authMode: "service_role",
    });

    if (!supabaseUrl || !serviceRoleKey) {
      logPushError("push:api:error", {
        phase: "env",
        reason: "MISSING_SUPABASE_ENV",
      });

      return Response.json(
        {
          success: false,
          error: "إعدادات Supabase ناقصة على السيرفر (service role)",
        },
        { status: 500 }
      );
    }

    const session = await requireSessionUser();

    if (session.error) {
      logPushError("push:api:error", {
        phase: "auth",
        reason: session.error,
      });

      return Response.json(
        {
          success: false,
          error: "يجب تسجيل الدخول قبل حفظ اشتراك الإشعارات",
        },
        { status: 401 }
      );
    }

    const userId = String(session.id || "").trim();
    const email = String(session.email || "").trim().toLowerCase();

    if (!userId || !email) {
      logPushError("push:api:error", {
        phase: "auth",
        reason: "MISSING_AUTH_USER",
        userId: userId || null,
        email: email || null,
      });

      return Response.json(
        {
          success: false,
          error: "تعذر تحديد المستخدم من Supabase Auth",
        },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);

    logPushEvent("push:api:start", {
      phase: "payload",
      hasBody: Boolean(body),
      body: sanitizeRequestBody(body),
      userId,
      email,
    });

    const subscription = normalizeSubscription(body);

    if (subscription.error) {
      logPushError("push:api:error", {
        phase: "validation",
        reason: subscription.error,
        details: subscription.details,
      });

      return Response.json(
        {
          success: false,
          error: "بيانات الاشتراك غير صالحة (endpoint أو keys ناقصة)",
        },
        { status: 400 }
      );
    }

    const anonymousId = String(body?.anonymousId || "").trim() || null;

    try {
      getSupabaseAdmin();
    } catch (adminError) {
      logPushError("push:api:error", {
        phase: "admin_client",
        message: adminError?.message || String(adminError),
      });

      return Response.json(
        {
          success: false,
          error: "إعدادات Supabase غير صحيحة على السيرفر (service role)",
        },
        { status: 500 }
      );
    }

    logPushEvent("push:api:save", {
      userId,
      email,
      endpoint: maskValue(subscription.endpoint),
      anonymousId,
      authMode: "service_role",
    });

    const saveResult = await savePushSubscriptionRow({
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      userId,
      email,
      anonymousId,
    });

    if (saveResult.error || !saveResult.data?.id) {
      logPushError("push:api:error", {
        phase: saveResult.phase || "save",
        message: saveResult.error?.message || "NO_ROW_RETURNED_FROM_SUPABASE",
        details: saveResult.error?.details ?? null,
        hint: saveResult.error?.hint ?? null,
        code: saveResult.error?.code ?? null,
        userId,
        email,
      });

      return Response.json(
        {
          success: false,
          error: saveResult.error?.message || "NO_ROW_RETURNED_FROM_SUPABASE",
        },
        { status: 500 }
      );
    }

    const savedRow = saveResult.data;

    if (anonymousId) {
      const backfillError = await backfillAnonymousPushSubscriptions({
        anonymousId,
        userId,
        email,
      });

      if (backfillError) {
        logPushError("push:api:error", {
          phase: "anonymous_backfill",
          message: backfillError.message,
          email,
          anonymousId,
        });
      }
    }

    logPushEvent("push:api:success", {
      phase: saveResult.phase,
      subscriptionId: savedRow.id,
      endpoint: maskValue(savedRow.endpoint),
      email: savedRow.email,
      userId: savedRow.user_id,
      anonymousId: savedRow.anonymous_id || null,
    });

    return Response.json({
      success: true,
      subscription: savedRow,
    });
  } catch (error) {
    logPushError("push:api:error", {
      phase: "exception",
      message: error?.message || String(error),
    });

    return Response.json(
      {
        success: false,
        error: error?.message || "خطأ في الخادم",
      },
      { status: 500 }
    );
  }
}
