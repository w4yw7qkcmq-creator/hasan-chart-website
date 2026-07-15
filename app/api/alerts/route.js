import { CACHE_PRIVATE_USER } from "../../../lib/api-response";
import { getSupabaseAdmin, requireSessionUser } from "../../../lib/auth-session";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { alertLimiter, RATE_LIMIT_ERROR, userReadLimiter } from "../../../lib/rate-limit";
import {
  mapPriceAlertRow,
  normalizeSymbol,
  resolveAlertCondition,
  trimText,
} from "../../../lib/price-alert-shared";
import { logApiError, logApiRequest } from "../../../lib/structured-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return Response.json(
        { success: false, error: "يجب تسجيل الدخول أولاً." },
        { status: 401 }
      );
    }

    const rateLimited = await enforceRateLimit(userReadLimiter, session.email);

    if (rateLimited) {
      return rateLimited;
    }

    const userEmail = session.email;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("price_alerts")
      .select("id, coin, target_price, condition, status, created_at")
      .ilike("user_email", userEmail)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message || "تعذر تحميل التنبيهات.");
    }

    const alerts = (data || []).map(mapPriceAlertRow);

    return Response.json(
      { success: true, alerts },
      {
        headers: {
          "Cache-Control": CACHE_PRIVATE_USER,
          Vary: "Cookie",
        },
      }
    );
  } catch (err) {
    logApiError({
      route: "/api/alerts",
      method: "GET",
      event: "PRICE_ALERT_LIST_FAILED",
      error: err?.message || String(err),
    });

    return Response.json(
      {
        success: false,
        error: err?.message || "تعذر تحميل التنبيهات.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return Response.json(
        {
          success: false,
          error: "يجب تسجيل الدخول أولاً.",
        },
        { status: 401 }
      );
    }

    const rateLimitResult = await alertLimiter(session.id);

    if (!rateLimitResult.success) {
      return Response.json(
        {
          success: false,
          error: RATE_LIMIT_ERROR,
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);

    const coin = trimText(body?.coin, 30).toUpperCase();
    const price = trimText(body?.price, 30);

    if (!coin || coin.length < 2 || !price) {
      return Response.json(
        {
          success: false,
          error: "العملة والسعر مطلوبان.",
        },
        { status: 400 }
      );
    }

    const user_email = session.email;
    const username = session.username;

    const supabase = getSupabaseAdmin();

    logApiRequest({
      route: "/api/alerts",
      method: "POST",
      event: "PRICE_ALERT_CREATE_START",
      coin,
      price,
    });

    const resolvedCondition = await resolveAlertCondition({
      coin,
      targetPrice: Number(price),
    });

    const { data, error } = await supabase
      .from("price_alerts")
      .insert([
        {
          user_email,
          username,
          coin: normalizeSymbol(coin) || coin,
          target_price: price,
          condition: resolvedCondition,
          status: "active",
        },
      ])
      .select("id, coin, target_price, condition, status, created_at, user_email")
      .single();

    if (error || !data?.id) {
      logApiError({
        route: "/api/alerts",
        method: "POST",
        event: "PRICE_ALERT_CREATE_FAILED",
        error: error?.message || "MISSING_INSERTED_ALERT_ID",
      });

      return Response.json(
        {
          success: false,
          error: error?.message || "فشل حفظ التنبيه في قاعدة البيانات.",
        },
        { status: 500 }
      );
    }

    logApiRequest({
      route: "/api/alerts",
      method: "POST",
      event: "PRICE_ALERT_CREATE_SUCCESS",
      alertId: data?.id || null,
      coin: data?.coin || coin,
    });

    return Response.json({
      success: true,
      message: "تم إضافة التنبيه بنجاح ✅ وسيتم إرسال الإيميل فقط عند تحقق السعر.",
      alert: data,
    });
  } catch (err) {
    logApiError({
      route: "/api/alerts",
      method: "POST",
      event: "PRICE_ALERT_CREATE_FAILED",
      error: err?.message || String(err),
    });

    return Response.json(
      {
        success: false,
        error: err?.message || "حدث خطأ أثناء إضافة التنبيه.",
      },
      { status: 500 }
    );
  }
}