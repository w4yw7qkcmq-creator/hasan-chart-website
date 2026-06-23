import { getSupabaseAdmin, getOptionalSessionUser } from "../../../../lib/auth-session";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function logPushEvent(tag, payload = {}) {
  const line = `${tag} ${JSON.stringify({ ...payload, ts: new Date().toISOString() })}`;
  console.log(line);
}

function logPushError(tag, payload = {}) {
  const line = `${tag} ${JSON.stringify({ ...payload, ts: new Date().toISOString() })}`;
  console.error(line);
}

function maskValue(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 12) return `${text.slice(0, 4)}...`;
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
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
  console.log(
    `PUSH_SUBSCRIBE_ROUTE_HIT ${JSON.stringify({ ts: new Date().toISOString(), route: "/api/push/subscribe" })}`
  );

  try {
    logPushEvent("PUSH_SUBSCRIBE_REQUEST_RECEIVED");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

    if (!supabaseUrl || !serviceRoleKey) {
      logPushError("PUSH_SUBSCRIBE_SUPABASE_INSERT_FAILED", {
        reason: "MISSING_SUPABASE_ENV",
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
        authMode: "none",
      });

      return Response.json(
        {
          success: false,
          error: "إعدادات Supabase ناقصة على السيرفر (service role)",
        },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);

    logPushEvent("PUSH_SUBSCRIBE_PAYLOAD", {
      hasBody: Boolean(body),
      hasSubscription: Boolean(body?.subscription),
      hasAnonymousId: Boolean(body?.anonymousId),
      endpoint: maskValue(body?.subscription?.endpoint || body?.endpoint),
      hasKeys: Boolean(body?.subscription?.keys || body?.keys),
      hasP256dh: Boolean(body?.subscription?.keys?.p256dh || body?.keys?.p256dh),
      hasAuth: Boolean(body?.subscription?.keys?.auth || body?.keys?.auth),
    });

    const subscription = normalizeSubscription(body);

    if (subscription.error) {
      logPushError("PUSH_SUBSCRIBE_SUPABASE_INSERT_FAILED", {
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
    const userId = session?.id || null;
    const email = session?.email || null;

    if (!userId && !email && !anonymousId) {
      logPushError("PUSH_SUBSCRIBE_SUPABASE_INSERT_FAILED", {
        reason: "MISSING_SUBSCRIPTION_OWNER",
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

    const row = {
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      user_id: userId,
      email,
      anonymous_id: anonymousId,
      updated_at: now,
    };

    logPushEvent("PUSH_SUBSCRIBE_SUPABASE_INSERT_START", {
      authMode: "service_role",
      supabaseHost: supabaseUrl.replace(/^https?:\/\//, "").split(".")[0] || "unknown",
      endpoint: maskValue(subscription.endpoint),
      userId: userId || null,
      email: email || null,
      anonymousId: anonymousId || null,
    });

    const { data: existingRow, error: existingError } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (existingError) {
      logPushError("PUSH_SUBSCRIBE_SUPABASE_INSERT_FAILED", {
        phase: "lookup",
        code: existingError.code || null,
        message: existingError.message,
        details: existingError.details || null,
        hint: existingError.hint || null,
      });

      return Response.json(
        {
          success: false,
          error: `تعذر البحث عن الاشتراك: ${existingError.message}`,
        },
        { status: 500 }
      );
    }

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
      const failurePhase = existingRow?.id ? "update" : "insert";
      const supabaseErrorMessage =
        saveError?.message || "NO_ROW_RETURNED_FROM_SUPABASE";

      console.error("PUSH_SUBSCRIBE_SUPABASE_INSERT_FAILED_FULL", {
        phase: failurePhase,
        supabaseMessage: supabaseErrorMessage,
        supabaseCode: saveError?.code || null,
        supabaseDetails: saveError?.details || null,
        supabaseHint: saveError?.hint || null,
        supabaseError: saveError || null,
        savedRow: savedRow || null,
        row: {
          endpoint: maskValue(row.endpoint),
          userId: row.user_id,
          email: row.email,
          anonymousId: row.anonymous_id,
        },
      });

      logPushError("PUSH_SUBSCRIBE_SUPABASE_INSERT_FAILED", {
        phase: failurePhase,
        code: saveError?.code || null,
        message: supabaseErrorMessage,
        details: saveError?.details || null,
        hint: saveError?.hint || null,
      });

      return Response.json(
        {
          success: false,
          error: supabaseErrorMessage,
          supabase: {
            phase: failurePhase,
            code: saveError?.code || null,
            message: supabaseErrorMessage,
            details: saveError?.details || null,
            hint: saveError?.hint || null,
          },
        },
        { status: 500 }
      );
    }

    logPushEvent("PUSH_SUBSCRIBE_SUPABASE_INSERT_SUCCESS", {
      subscriptionId: savedRow.id,
      endpoint: maskValue(savedRow.endpoint),
      email: savedRow.email || null,
      userId: savedRow.user_id || null,
      anonymousId: savedRow.anonymous_id || null,
    });

    return Response.json({
      success: true,
      subscription: savedRow,
    });
  } catch (error) {
    logPushError("PUSH_SUBSCRIBE_SUPABASE_INSERT_FAILED", {
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
