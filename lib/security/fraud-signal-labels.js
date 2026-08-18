/**
 * Arabic labels for partner fraud / anti-abuse signal types.
 * Never expose raw IP, device tokens, or HMAC hashes in UI labels.
 */

export const FRAUD_SIGNAL_LABELS_AR = Object.freeze({
  SAME_DEVICE_MULTI_ACCOUNT: "عدة حسابات على نفس الجهاز",
  SAME_DEVICE_SAME_REFERRER: "نفس الجهاز ونفس المُحيل",
  SHARED_NETWORK_CLUSTER: "تجمّع شبكة مشتركة",
  SIGNUP_VELOCITY: "سرعة تسجيل مرتفعة",
  SELF_REFERRAL_DEVICE: "إحالة ذاتية عبر الجهاز",
  TEST_ACCOUNT_REWARD_ATTEMPT: "محاولة مكافأة من حساب اختبار",
  E2E_ACCOUNT_REWARD_ATTEMPT: "محاولة مكافأة من حساب E2E",
  INTERNAL_ACCOUNT_REWARD_ATTEMPT: "محاولة مكافأة من حساب داخلي",
  UNVERIFIED_REWARD_ATTEMPT: "محاولة مكافأة قبل اكتمال التحقق",
  TURNSTILE_RISK: "مخاطر Turnstile",
  DEVICE_TAMPER: "تلاعب بجهاز/ملف تعريف",
  DUPLICATE_IDENTITY: "هوية مكررة",
  CLASSIFICATION_TEST_BLOCKED: "حساب اختبار — لا مكافآت",
  CLASSIFICATION_E2E_BLOCKED: "حساب E2E — لا مكافآت",
  CLASSIFICATION_INTERNAL_BLOCKED: "حساب داخلي — لا مكافآت",
  HIGH_VELOCITY: "سرعة تسجيل عالية",
  PARTNER_DEVICE_MATCH: "جهاز الشريك يطابق المُحال",
});

export function fraudSignalLabelAr(signalType = "") {
  const key = String(signalType || "").trim().toUpperCase();
  return FRAUD_SIGNAL_LABELS_AR[key] || signalType || "—";
}

export function mapFraudSignalsToArabic(signals = []) {
  return (signals || []).map((signal) => {
    if (typeof signal === "string") {
      return { type: signal, labelAr: fraudSignalLabelAr(signal) };
    }
    const type = signal?.type || signal?.signal_type || signal?.code || "";
    return {
      ...signal,
      type,
      labelAr: fraudSignalLabelAr(type),
    };
  });
}
