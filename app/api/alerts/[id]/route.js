import { getSupabaseAdmin, requireSessionUser } from "../../../../lib/auth-session";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import {
  alertLimiter,
  RATE_LIMIT_ERROR,
} from "../../../../lib/rate-limit";
import {
  mapPriceAlertRow,
  normalizeSymbol,
  PRICE_ALERT_LIST_COLUMNS,
  PRICE_ALERT_STATUS,
  resolveAlertCondition,
  trimText,
} from "../../../../lib/price-alert-shared";
import { logApiError, logApiRequest } from "../../../../lib/structured-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

async function getOwnedAlert({ supabase, alertId, userEmail }) {
  const { data, error } = await supabase
    .from("price_alerts")
    .select(PRICE_ALERT_LIST_COLUMNS)
    .eq("id", alertId)
    .ilike("user_email", userEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "تعذر التحقق من التنبيه.");
  }

  return data || null;
}

export async function PATCH(req, { params }) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return Response.json(
        { success: false, error: "يجب تسجيل الدخول أولاً." },
        { status: 401 }
      );
    }

    const rateLimitResult = await alertLimiter(session.id);

    if (!rateLimitResult.success) {
      return Response.json(
        { success: false, error: RATE_LIMIT_ERROR },
        { status: 429 }
      );
    }

    const alertId = String(params?.id || "").trim();

    if (!alertId) {
      return Response.json(
        { success: false, error: "معرّف التنبيه غير صالح." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const coin = trimText(body?.coin, 30).toUpperCase();
    const price = trimText(body?.price, 30);

    if (!coin || coin.length < 2 || !price) {
      return Response.json(
        { success: false, error: "العملة والسعر مطلوبان." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const existing = await getOwnedAlert({
      supabase,
      alertId,
      userEmail: session.email,
    });

    if (!existing) {
      return Response.json(
        { success: false, error: "التنبيه غير موجود أو لا تملك صلاحية تعديله." },
        { status: 404 }
      );
    }

    if (existing.status !== "active") {
      return Response.json(
        { success: false, error: "لا يمكن تعديل تنبيه مُفعّل أو مغلق." },
        { status: 409 }
      );
    }

    logApiRequest({
      route: "/api/alerts/[id]",
      method: "PATCH",
      event: "PRICE_ALERT_UPDATE_START",
      alertId,
      coin,
    });

    const resolvedCondition = await resolveAlertCondition({
      coin,
      targetPrice: Number(price),
    });

    const { data, error } = await supabase
      .from("price_alerts")
      .update({
        coin: normalizeSymbol(coin) || coin,
        target_price: price,
        condition: resolvedCondition,
      })
      .eq("id", alertId)
      .ilike("user_email", session.email)
      .eq("status", "active")
      .select(PRICE_ALERT_LIST_COLUMNS)
      .maybeSingle();

    if (error || !data?.id) {
      logApiError({
        route: "/api/alerts/[id]",
        method: "PATCH",
        event: "PRICE_ALERT_UPDATE_FAILED",
        alertId,
        error: error?.message || "MISSING_UPDATED_ALERT",
      });

      return Response.json(
        { success: false, error: error?.message || "فشل تحديث التنبيه." },
        { status: 500 }
      );
    }

    logApiRequest({
      route: "/api/alerts/[id]",
      method: "PATCH",
      event: "PRICE_ALERT_UPDATE_SUCCESS",
      alertId: data.id,
      coin: data.coin,
    });

    return Response.json({
      success: true,
      message: "تم تحديث التنبيه بنجاح.",
      alert: mapPriceAlertRow(data),
    });
  } catch (err) {
    logApiError({
      route: "/api/alerts/[id]",
      method: "PATCH",
      event: "PRICE_ALERT_UPDATE_FAILED",
      error: err?.message || String(err),
    });

    return Response.json(
      { success: false, error: err?.message || "حدث خطأ أثناء تحديث التنبيه." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req, { params }) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return Response.json(
        { success: false, error: "يجب تسجيل الدخول أولاً." },
        { status: 401 }
      );
    }

    const rateLimitResult = await alertLimiter(session.id);

    if (!rateLimitResult.success) {
      return Response.json(
        { success: false, error: RATE_LIMIT_ERROR },
        { status: 429 }
      );
    }

    const alertId = String(params?.id || "").trim();

    if (!alertId) {
      return Response.json(
        { success: false, error: "معرّف التنبيه غير صالح." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const existing = await getOwnedAlert({
      supabase,
      alertId,
      userEmail: session.email,
    });

    if (!existing) {
      return Response.json(
        { success: false, error: "التنبيه غير موجود أو لا تملك صلاحية حذفه." },
        { status: 404 }
      );
    }

    logApiRequest({
      route: "/api/alerts/[id]",
      method: "DELETE",
      event: existing.status === PRICE_ALERT_STATUS.ACTIVE
        ? "PRICE_ALERT_CANCEL_START"
        : "PRICE_ALERT_DELETE_START",
      alertId,
    });

    if (existing.status === PRICE_ALERT_STATUS.ACTIVE) {
      const { data, error } = await supabase
        .from("price_alerts")
        .update({ status: PRICE_ALERT_STATUS.CANCELLED })
        .eq("id", alertId)
        .ilike("user_email", session.email)
        .eq("status", PRICE_ALERT_STATUS.ACTIVE)
        .select(PRICE_ALERT_LIST_COLUMNS)
        .maybeSingle();

      if (error || !data?.id) {
        logApiError({
          route: "/api/alerts/[id]",
          method: "DELETE",
          event: "PRICE_ALERT_CANCEL_FAILED",
          alertId,
          error: error?.message || "MISSING_CANCELLED_ALERT",
        });

        return Response.json(
          { success: false, error: error?.message || "فشل إلغاء التنبيه." },
          { status: 500 }
        );
      }

      logApiRequest({
        route: "/api/alerts/[id]",
        method: "DELETE",
        event: "PRICE_ALERT_CANCEL_SUCCESS",
        alertId,
      });

      return Response.json({
        success: true,
        message: "تم إلغاء التنبيه بنجاح.",
        alert: mapPriceAlertRow(data),
      });
    }

    const { error } = await supabase
      .from("price_alerts")
      .delete()
      .eq("id", alertId)
      .ilike("user_email", session.email);

    if (error) {
      logApiError({
        route: "/api/alerts/[id]",
        method: "DELETE",
        event: "PRICE_ALERT_DELETE_FAILED",
        alertId,
        error: error.message,
      });

      return Response.json(
        { success: false, error: error.message || "فشل حذف التنبيه." },
        { status: 500 }
      );
    }

    logApiRequest({
      route: "/api/alerts/[id]",
      method: "DELETE",
      event: "PRICE_ALERT_DELETE_SUCCESS",
      alertId,
    });

    return Response.json({
      success: true,
      message: "تم حذف التنبيه بنجاح.",
    });
  } catch (err) {
    logApiError({
      route: "/api/alerts/[id]",
      method: "DELETE",
      event: "PRICE_ALERT_DELETE_FAILED",
      error: err?.message || String(err),
    });

    return Response.json(
      { success: false, error: err?.message || "حدث خطأ أثناء حذف التنبيه." },
      { status: 500 }
    );
  }
}
