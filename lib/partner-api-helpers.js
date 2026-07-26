import { NextResponse } from "next/server";
import { capturePartnerSentryEvent } from "./partner-monitoring";
import { partnerLogger } from "./partner-logger";
import { MIN_PARTNER_WITHDRAWAL_USDT } from "./partner-shared";
import { RATE_LIMIT_ERROR } from "./rate-limit";

export function partnerJsonSuccess(data, { status = 200 } = {}) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function partnerJsonError(error, { status = 500, code = null, logEvent = null } = {}) {
  const message = typeof error === "string" ? error : error?.message || "Unexpected partner error";

  if (logEvent) {
    partnerLogger.error(logEvent, { message, code });
  }

  return NextResponse.json(
    {
      success: false,
      error: message,
      code: code || undefined,
    },
    { status }
  );
}

export async function handlePartnerApiError(error, { event, fallbackMessage }) {
  await capturePartnerSentryEvent(error, { event });

  if (error?.code === "INVALID_UUID") {
    return partnerJsonError("المعرّف غير صالح", { status: 400, code: "INVALID_UUID", logEvent: event });
  }

  if (error?.code === "FORBIDDEN") {
    return partnerJsonError("غير مصرح", { status: 403, code: "FORBIDDEN", logEvent: event });
  }

  if (error?.message && error.message.startsWith("INVALID_")) {
    return partnerJsonError(error.message, { status: 400, code: error.message, logEvent: event });
  }

  return partnerJsonError(fallbackMessage || "تعذر تنفيذ العملية", { status: 500, logEvent: event });
}

export const PARTNER_API_ERROR_MESSAGES = {
  UNAUTHORIZED: "يجب تسجيل الدخول أولاً",
  FORBIDDEN: "غير مصرح",
  INVALID_UUID: "المعرّف غير صالح",
  INVALID_AMOUNT: "يرجى إدخال مبلغ صحيح",
  INVALID_NETWORK: "يرجى اختيار شبكة صحيحة",
  INVALID_WALLET: "يرجى إدخال عنوان محفظة صحيح",
  INSUFFICIENT_BALANCE: "المبلغ أكبر من الرصيد القابل للسحب",
  PENDING_WITHDRAWAL_EXISTS: "لديك طلب سحب قيد المراجعة بالفعل",
  BELOW_MINIMUM: `الحد الأدنى للسحب هو ${MIN_PARTNER_WITHDRAWAL_USDT} USDT`,
  NOT_FOUND: "العنصر غير موجود",
  INVALID_STATUS: "الحالة الحالية لا تسمح بهذه العملية",
  ALREADY_PAID: "تم تنفيذ العملية مسبقاً",
  NOTE_REQUIRED: "يرجى إدخال سبب الرفض",
  INVALID_PAYMENT_PROOF: "صيغة إثبات التحويل غير صالحة",
  RATE_LIMITED: RATE_LIMIT_ERROR,
};
