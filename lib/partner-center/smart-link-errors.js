const SMART_LINK_ERROR_MESSAGES_AR = {
  invalid_campaign: "الحملة المحددة غير صالحة أو غير متاحة حاليًا.",
  campaign_inactive: "هذه الحملة غير مفعلة حاليًا.",
  campaign_expired: "انتهت هذه الحملة.",
  campaign_not_eligible: "هذه الحملة غير متاحة لحسابك.",
  source_not_allowed: "المصدر المحدد غير مسموح لهذه الحملة.",
  medium_not_allowed: "وسيط التتبع غير مسموح لهذه الحملة.",
  invalid_destination: "مسار الوجهة غير مسموح.",
  invalid_source: "المصدر المحدد غير صالح.",
  inactive_partner: "حساب الشريك غير نشط.",
  referral_code_mismatch: "تعذر التحقق من ملكية الرابط.",
  invalid_token: "رمز الرابط غير صالح.",
  link_not_found: "الرابط غير موجود أو غير نشط.",
  ownership_blocked: "لا يمكنك إدارة هذا الرابط.",
  invalid_link_id: "معرّف الرابط غير صالح.",
};

export function mapSmartLinkErrorToMessage(errorKey, code) {
  const key = String(errorKey || "").trim();
  if (key && SMART_LINK_ERROR_MESSAGES_AR[key]) {
    return SMART_LINK_ERROR_MESSAGES_AR[key];
  }

  const codeKey = String(code || "")
    .trim()
    .toLowerCase()
    .replace(/^campaign_/, "");

  if (codeKey === "not_found" || codeKey === "inactive") {
    return SMART_LINK_ERROR_MESSAGES_AR.invalid_campaign;
  }

  return "تعذر إنشاء الرابط الآن. حاول مرة أخرى.";
}

export function isSmartLinkCampaignError(errorKey) {
  return [
    "invalid_campaign",
    "campaign_inactive",
    "campaign_expired",
    "campaign_not_eligible",
    "source_not_allowed",
    "medium_not_allowed",
  ].includes(String(errorKey || ""));
}

export { SMART_LINK_ERROR_MESSAGES_AR };
