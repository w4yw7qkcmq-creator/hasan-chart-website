import { getSupabaseAdmin, getOptionalSessionUser } from "../../../../lib/auth-session";

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

function logPushSubscribe(event, payload = {}) {
  console.log(
    event,
    JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

function logPushSubscribeError(event, payload = {}) {
  console.error(
    event,
    JSON.stringify({
      ts: new Date().toISOString(),
      ...payload,
    })
  );
}

function logPushSubscriptionEvent(event, payload = {}) {
  console.log(
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
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";

    logPushSubscribe("push:subscribe:api_called", {
      route: "/api/push/subscribe",
      method: "POST",
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });

    if (!supabaseUrl || !serviceRoleKey) {
      logPushSubscribeError("push:subscribe:error", {
        phase: "env",
        reason: "MISSING_SUPABASE_ENV",
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });

      return Response.json(
        {
          success: false,
          error: "إعدادات Supabase ناقصة على السيرفر (service role)",
        },
        { status: 500 }
      );
    }

    if (anonKey && serviceRoleKey === anonKey) {
      logPushSubscribeError("push:subscribe:error", {
        phase: "env",
        reason: "SERVICE_ROLE_KEY_MATCHES_ANON_KEY",
        hint: "Set SUPABASE_SERVICE_ROLE_KEY to the service role secret, not the anon/publishable key",
      });

      return Response.json(
        {
          success: false,
          error: "إعدادات Supabase غير صحيحة على السيرفر (service role)",
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);

    logPushSubscribe("push:subscribe:api_called", {
      phase: "payload",
      hasBody: Boolean(body),
      body: sanitizeRequestBody(body),
    });

    const subscription = normalizeSubscription(body);

    if (subscription.error) {
      logPushSubscribeError("push:subscribe:error", {
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

    const session = await getOptionalSessionUser();
    const anonymousId = String(body?.anonymousId || "").trim() || null;
    const bodyUserEmail = String(body?.userEmail || body?.user_email || "")
      .trim()
      .toLowerCase();
    const bodyUserId = String(body?.userId || body?.user_id || "").trim() || null;
    const userId = session?.id || bodyUserId || null;
    const email = session?.email
      ? String(session.email).trim().toLowerCase()
      : bodyUserEmail || null;

    if (!userId && !email && !anonymousId) {
      logPushSubscribeError("push:subscribe:error", {
        phase: "validation",
        reason: "MISSING_SUBSCRIPTION_OWNER",
        hint: "Provide anonymousId or login session",
      });

      return Response.json(
        {
          success: false,
          error: "يجب توفير anonymousId أو تسجيل الدخول لربط الاشتراك",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    let resolvedUserId = userId;

    if (email) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (profileRow?.id) {
        resolvedUserId = profileRow.id;
      }
    }

    const row = {
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      updated_at: now,
    };

    if (resolvedUserId) row.user_id = resolvedUserId;
    if (email) row.email = email;
    if (anonymousId) row.anonymous_id = anonymousId;

    let existingRow = null;
    let existingLookup = "none";

    const { data: existingByEndpoint, error: existingError } = await supabase
      .from("push_subscriptions")
      .select("id, email, user_id, anonymous_id, endpoint")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (existingError) {
      logPushSubscribeError("push:subscribe:error", {
        phase: "lookup",
        message: existingError.message || null,
        details: existingError.details || null,
        hint: existingError.hint || null,
        code: existingError.code || null,
      });

      return Response.json(
        {
          success: false,
          error: existingError.message || "تعذر البحث عن الاشتراك",
          supabase: {
            phase: "lookup",
            message: existingError.message || null,
            details: existingError.details || null,
            hint: existingError.hint || null,
          },
        },
        { status: 500 }
      );
    }

    if (existingByEndpoint?.id) {
      existingRow = existingByEndpoint;
      existingLookup = "endpoint";
    } else if (anonymousId && (email || resolvedUserId)) {
      const { data: existingByAnonymous, error: anonymousLookupError } =
        await supabase
          .from("push_subscriptions")
          .select("id, email, user_id, anonymous_id, endpoint")
          .eq("anonymous_id", anonymousId)
          .or("email.is.null,user_id.is.null")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (anonymousLookupError) {
        logPushSubscribeError("push:subscribe:error", {
          phase: "anonymous_lookup",
          message: anonymousLookupError.message || null,
          details: anonymousLookupError.details || null,
          hint: anonymousLookupError.hint || null,
          code: anonymousLookupError.code || null,
        });

        return Response.json(
          {
            success: false,
            error: anonymousLookupError.message || "تعذر البحث عن الاشتراك المجهول",
          },
          { status: 500 }
        );
      }

      if (existingByAnonymous?.id) {
        existingRow = existingByAnonymous;
        existingLookup = "anonymous_id";
      }
    }

    const savePhase = existingRow?.id ? "update" : "insert";

    console.log(
      `PUSH_SUBSCRIBE_BEFORE_SAVE ${JSON.stringify({
        ts: new Date().toISOString(),
        phase: savePhase,
        authMode: "service_role",
        supabaseHost: supabaseUrl.replace(/^https?:\/\//, "").split(".")[0] || "unknown",
        existingId: existingRow?.id || null,
        existingLookup,
        row: {
          endpoint: maskValue(row.endpoint),
          user_id: row.user_id,
          email: row.email,
          anonymous_id: row.anonymous_id,
          hasP256dh: Boolean(row.p256dh),
          hasAuth: Boolean(row.auth),
          updated_at: row.updated_at,
          created_at: savePhase === "insert" ? now : undefined,
        },
      })}`
    );

    let savedRow = null;
    let saveError = null;

    if (existingRow?.id) {
      const updateResult = await supabase
        .from("push_subscriptions")
        .update(row)
        .eq("id", existingRow.id)
        .select("id, endpoint, email, user_id, anonymous_id, created_at, updated_at")
        .single();

      savedRow = updateResult.data;
      saveError = updateResult.error;
    } else {
      const insertResult = await supabase
        .from("push_subscriptions")
        .insert({
          ...row,
          created_at: now,
        })
        .select("id, endpoint, email, user_id, anonymous_id, created_at, updated_at")
        .single();

      savedRow = insertResult.data;
      saveError = insertResult.error;
    }

    if (saveError || !savedRow?.id) {
      logPushSubscribeError("push:subscribe:error", {
        phase: savePhase,
        message: saveError?.message || "NO_ROW_RETURNED_FROM_SUPABASE",
        details: saveError?.details ?? null,
        hint: saveError?.hint ?? null,
        code: saveError?.code ?? null,
        row: {
          endpoint: maskValue(row.endpoint),
          user_id: row.user_id,
          email: row.email,
          anonymous_id: row.anonymous_id,
        },
      });

      return Response.json(
        {
          success: false,
          error: saveError?.message || "NO_ROW_RETURNED_FROM_SUPABASE",
          supabase: {
            phase: savePhase,
            message: saveError?.message ?? null,
            details: saveError?.details ?? null,
            hint: saveError?.hint ?? null,
          },
        },
        { status: 500 }
      );
    }

    logPushSubscribe("push:subscribe:saved", {
      phase: savePhase,
      authMode: "service_role",
      subscriptionId: savedRow.id,
      endpoint: maskValue(savedRow.endpoint),
      email: savedRow.email || null,
      userId: savedRow.user_id || null,
      anonymousId: savedRow.anonymous_id || null,
      sessionAttached: Boolean(session?.email),
      bodyUserEmail: bodyUserEmail || null,
      bodyUserId: bodyUserId || null,
    });

    if (savePhase === "update") {
      logPushSubscriptionEvent("push:subscription:updated", {
        subscriptionId: savedRow.id,
        existingLookup,
        email: savedRow.email || null,
        userId: savedRow.user_id || null,
        anonymousId: savedRow.anonymous_id || null,
        endpoint: maskValue(savedRow.endpoint),
        sessionAttached: Boolean(session?.email),
        bodyUserEmail: bodyUserEmail || null,
        bodyUserId: bodyUserId || null,
      });
    }

    if (anonymousId && email && resolvedUserId) {
      const { data: linkedRows, error: backfillError } = await supabase
        .from("push_subscriptions")
        .update({
          email,
          user_id: resolvedUserId,
          updated_at: now,
        })
        .eq("anonymous_id", anonymousId)
        .or("email.is.null,user_id.is.null")
        .select("id, endpoint, email, user_id, anonymous_id");

      if (backfillError) {
        console.warn(
          `PUSH_SUBSCRIBE_ANONYMOUS_BACKFILL_FAILED ${JSON.stringify({
            ts: new Date().toISOString(),
            message: backfillError.message,
            email,
            anonymousId,
          })}`
        );
      } else if ((linkedRows || []).length > 0) {
        logPushSubscriptionEvent("push:subscription:linked", {
          count: linkedRows.length,
          email,
          userId: resolvedUserId,
          anonymousId,
          subscriptionIds: linkedRows.map((item) => item.id),
          endpoints: linkedRows.map((item) => maskValue(item.endpoint)),
        });
      }
    }

    return Response.json({
      success: true,
      subscription: savedRow,
    });
  } catch (error) {
    logPushSubscribeError("push:subscribe:error", {
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
