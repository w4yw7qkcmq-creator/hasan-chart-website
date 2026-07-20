import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { CACHE_PRIVATE_USER } from "../../../lib/api-response";
import { withInFlightDedup } from "../../../lib/server-read-cache";
import {
  VIP_SIGNALS_DEFAULT_LIMIT,
  VIP_SIGNALS_LIST_COLUMNS,
  VIP_SIGNALS_MAX_LIMIT,
} from "../../../lib/supabase-query-columns";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const normalizeSignalType = (value) => {
  const text = String(value || "spot").trim().toLowerCase();

  if (text.includes("future") || text.includes("futures") || text.includes("فيوتشر")) {
    return "futures";
  }

  return "spot";
};

const matchesSignalSubscription = (planText, signalType) => {
  const text = String(planText || "").toLowerCase();

  if (signalType === "futures") {
    return (
      text.includes("future") ||
      text.includes("futures") ||
      text.includes("فيوتشر") ||
      text.includes("vip futures")
    );
  }

  return (
    text.includes("spot") ||
    text.includes("سبوت") ||
    text.includes("vip spot")
  );
};

const getAuthenticatedUser = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.email) {
    return null;
  }

  return {
    id: user.id,
    email: String(user.email).trim().toLowerCase(),
  };
};

const isSubscriptionExpired = (subscription) => {
  if (!subscription) {
    return true;
  }

  if (subscription.status === "منتهي") {
    return true;
  }

  if (
    subscription.expires_at &&
    new Date(subscription.expires_at).getTime() <= Date.now()
  ) {
    return true;
  }

  return false;
};

function hashUserKey(email) {
  return createHash("sha256").update(String(email || "")).digest("hex").slice(0, 16);
}

function parsePagination(searchParams) {
  const requestedLimit = Number.parseInt(
    String(searchParams.get("limit") || VIP_SIGNALS_DEFAULT_LIMIT),
    10
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), VIP_SIGNALS_MAX_LIMIT)
    : VIP_SIGNALS_DEFAULT_LIMIT;

  const requestedOffset = Number.parseInt(String(searchParams.get("offset") || "0"), 10);
  let offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  const requestedPage = Number.parseInt(String(searchParams.get("page") || "0"), 10);
  if (Number.isFinite(requestedPage) && requestedPage > 0) {
    offset = (requestedPage - 1) * limit;
  }

  return { limit, offset };
}

function mapSignalRows(rows) {
  return (rows || []).map((item) => ({
    ...item,
    createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
  }));
}

async function loadVipSignalsForUser({ email, signalType, limit, offset }) {
  const rangeEnd = offset + limit;

  const [subscriptionResult, signalsResult] = await Promise.all([
    supabase
      .from("subscription_requests")
      .select("id,status,expires_at,expired_notice_sent,plan_name,category")
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("vip_signals")
      .select(VIP_SIGNALS_LIST_COLUMNS)
      .eq("signal_type", signalType)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, rangeEnd),
  ]);

  if (subscriptionResult.error) {
    return {
      status: 500,
      body: {
        success: false,
        error: subscriptionResult.error.message,
      },
    };
  }

  const rows = Array.isArray(subscriptionResult.data) ? subscriptionResult.data : [];

  const activeSubscriptions = rows.filter(
    (subscription) => subscription.status === "مفعل" && !isSubscriptionExpired(subscription)
  );

  const hasMatchingPlan = activeSubscriptions.some((subscription) =>
    matchesSignalSubscription(
      `${subscription.plan_name || ""} ${subscription.category || ""}`,
      signalType
    )
  );

  if (!hasMatchingPlan) {
    const hadAnySubscription = rows.length > 0;
    const subscriptionExpired =
      hadAnySubscription &&
      !activeSubscriptions.some((subscription) =>
        matchesSignalSubscription(
          `${subscription.plan_name || ""} ${subscription.category || ""}`,
          signalType
        )
      ) &&
      rows.some(
        (subscription) =>
          matchesSignalSubscription(
            `${subscription.plan_name || ""} ${subscription.category || ""}`,
            signalType
          ) && isSubscriptionExpired(subscription)
      );

    return {
      status: 403,
      body: {
        success: false,
        subscriptionExpired:
          subscriptionExpired || (hadAnySubscription && activeSubscriptions.length === 0),
        error: "لا يوجد اشتراك VIP فعال للوصول إلى هذه التوصيات.",
        signals: [],
      },
    };
  }

  if (signalsResult.error) {
    return {
      status: 500,
      body: {
        success: false,
        error: signalsResult.error.message,
      },
    };
  }

  const fetchedRows = Array.isArray(signalsResult.data) ? signalsResult.data : [];
  const hasMore = fetchedRows.length > limit;
  const pageRows = hasMore ? fetchedRows.slice(0, limit) : fetchedRows;

  return {
    status: 200,
    body: {
      success: true,
      signals: mapSignalRows(pageRows),
      pagination: {
        limit,
        offset,
        hasMore,
      },
    },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const signalType = normalizeSignalType(url.searchParams.get("type"));
    const { limit, offset } = parsePagination(url.searchParams);

    const authUser = await getAuthenticatedUser();

    if (!authUser?.email) {
      return NextResponse.json(
        {
          success: false,
          error: "يجب تسجيل الدخول للوصول إلى توصيات VIP.",
        },
        { status: 401 }
      );
    }

    const { guardActiveAccountForApi } = await import("../../../lib/guard-active-account-api.js");
    const blocked = await guardActiveAccountForApi(supabase, authUser.id);
    if (blocked) return blocked;

    const email = authUser.email;

    const dedupKey = `vip-signals:${hashUserKey(email)}:${signalType}:${limit}:${offset}`;
    const result = await withInFlightDedup(dedupKey, () =>
      loadVipSignalsForUser({ email, signalType, limit, offset })
    );

    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        "Cache-Control": CACHE_PRIVATE_USER,
        Vary: "Cookie, Accept-Encoding",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err?.message || "Server Error",
      },
      { status: 500 }
    );
  }
}
