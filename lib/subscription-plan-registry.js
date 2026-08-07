/**
 * Server-side subscription plan registry — source of truth for checkout/init/finalize.
 * Client-sent price/category/plan_name are never trusted without registry match.
 */

import { PAYMENT_NETWORK_VALUES } from "./payment-networks.js";

export const SUBSCRIPTION_PLAN_IDS = Object.freeze({
  SPOT_MONTH: "spot_month",
  SPOT_3_MONTHS: "spot_3_months",
  SPOT_YEAR: "spot_year",
  FUTURES_MONTH: "futures_month",
  FUTURES_3_MONTHS: "futures_3_months",
  FUTURES_YEAR: "futures_year",
  FOREX_MONTH: "forex_month",
  FOREX_3_MONTHS: "forex_3_months",
  FOREX_YEAR: "forex_year",
});

/** @type {ReadonlyArray<{ id: string, planName: string, category: string, price: string, durationDays: number, serviceType: 'spot'|'futures'|'forex' }>} */
export const SUBSCRIPTION_PLAN_REGISTRY = Object.freeze([
  {
    id: SUBSCRIPTION_PLAN_IDS.SPOT_MONTH,
    planName: "سبوت - شهر",
    category: "باقات السبوت",
    price: "$50",
    durationDays: 30,
    serviceType: "spot",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.SPOT_3_MONTHS,
    planName: "سبوت - 3 أشهر",
    category: "باقات السبوت",
    price: "$125",
    durationDays: 90,
    serviceType: "spot",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.SPOT_YEAR,
    planName: "سبوت - سنة",
    category: "باقات السبوت",
    price: "$500",
    durationDays: 365,
    serviceType: "spot",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.FUTURES_MONTH,
    planName: "فيوتشر - شهر",
    category: "باقات الفيوتشر",
    price: "$99",
    durationDays: 30,
    serviceType: "futures",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.FUTURES_3_MONTHS,
    planName: "فيوتشر - 3 أشهر",
    category: "باقات الفيوتشر",
    price: "$250",
    durationDays: 90,
    serviceType: "futures",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.FUTURES_YEAR,
    planName: "فيوتشر - سنة",
    category: "باقات الفيوتشر",
    price: "$800",
    durationDays: 365,
    serviceType: "futures",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.FOREX_MONTH,
    planName: "فوركس - شهر",
    category: "باقات الفوركس",
    price: "$99",
    durationDays: 30,
    serviceType: "forex",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.FOREX_3_MONTHS,
    planName: "فوركس - 3 أشهر",
    category: "باقات الفوركس",
    price: "$250",
    durationDays: 90,
    serviceType: "forex",
  },
  {
    id: SUBSCRIPTION_PLAN_IDS.FOREX_YEAR,
    planName: "فوركس - سنة",
    category: "باقات الفوركس",
    price: "$800",
    durationDays: 365,
    serviceType: "forex",
  },
]);

const REGISTRY_BY_ID = new Map(SUBSCRIPTION_PLAN_REGISTRY.map((plan) => [plan.id, plan]));

const REGISTRY_BY_NAME = new Map(
  SUBSCRIPTION_PLAN_REGISTRY.map((plan) => [`${plan.planName}\0${plan.category}`, plan])
);

const REGISTRY_BY_NAME_ONLY = new Map(
  SUBSCRIPTION_PLAN_REGISTRY.map((plan) => [plan.planName, plan])
);

export function getSubscriptionPlanById(planId) {
  const id = String(planId || "").trim();
  return REGISTRY_BY_ID.get(id) || null;
}

export function resolveSubscriptionPlan(input = {}) {
  const planId = String(input.planId || input.plan_id || "").trim();
  const planName = String(input.planName || input.plan_name || "").trim();
  const category = String(input.category || "").trim();
  const clientPrice = input.price != null ? String(input.price).trim() : "";

  if (planId) {
    const byId = getSubscriptionPlanById(planId);
    if (!byId) {
      return { ok: false, code: "UNKNOWN_PLAN", error: "خطة الاشتراك غير معروفة" };
    }
    if (category && category !== byId.category) {
      return { ok: false, code: "CATEGORY_MISMATCH", error: "فئة الخطة لا تطابق الخطة المختارة" };
    }
    if (planName && planName !== byId.planName) {
      return { ok: false, code: "PLAN_NAME_MISMATCH", error: "اسم الخطة لا يطابق المعرف المرسل" };
    }
    return { ok: true, plan: byId, ignoredClientPrice: clientPrice && clientPrice !== byId.price };
  }

  if (!planName) {
    return { ok: false, code: "MISSING_PLAN", error: "خطة الاشتراك مطلوبة" };
  }

  if (category) {
    const exact = REGISTRY_BY_NAME.get(`${planName}\0${category}`);
    if (!exact) {
      const nameOnly = REGISTRY_BY_NAME_ONLY.get(planName);
      if (nameOnly && nameOnly.category !== category) {
        return { ok: false, code: "CATEGORY_MISMATCH", error: "فئة الخطة لا تطابق الخطة المختارة" };
      }
      return { ok: false, code: "UNKNOWN_PLAN", error: "خطة الاشتراك غير معروفة" };
    }
    return { ok: true, plan: exact, ignoredClientPrice: clientPrice && clientPrice !== exact.price };
  }

  const byName = REGISTRY_BY_NAME_ONLY.get(planName);
  if (!byName) {
    return { ok: false, code: "UNKNOWN_PLAN", error: "خطة الاشتراك غير معروفة" };
  }

  return { ok: true, plan: byName, ignoredClientPrice: clientPrice && clientPrice !== byName.price };
}

export function assertUploadSessionPlanIntegrity(session) {
  const resolved = resolveSubscriptionPlan({
    plan_name: session?.plan_name,
    category: session?.category,
    price: session?.price,
  });

  if (!resolved.ok) {
    return resolved;
  }

  const { plan } = resolved;
  if (session.plan_name !== plan.planName || session.category !== plan.category || session.price !== plan.price) {
    return {
      ok: false,
      code: "SESSION_PLAN_TAMPERED",
      error: "بيانات خطة الاشتراك في الجلسة غير صالحة",
    };
  }

  return { ok: true, plan };
}

export function listAllowedPaymentNetworks() {
  return [...PAYMENT_NETWORK_VALUES];
}
