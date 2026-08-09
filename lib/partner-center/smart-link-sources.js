/** Canonical smart-link source definitions — shared by UI, API, and analytics. */
export const SMART_LINK_SOURCES = [
  { value: "telegram", label: "تيليغرام", icon: "✈️", aliases: ["Telegram"] },
  { value: "x", label: "X", icon: "𝕏", aliases: ["twitter", "Twitter"] },
  { value: "youtube", label: "يوتيوب", icon: "▶️", aliases: ["YouTube"] },
  { value: "whatsapp", label: "واتساب", icon: "💬", aliases: ["WhatsApp"] },
  { value: "other", label: "أخرى", icon: "🔗", aliases: ["Other"] },
];

export const ALLOWED_SMART_LINK_SOURCES = new Set(SMART_LINK_SOURCES.map((s) => s.value));

const SOURCE_ALIAS_MAP = (() => {
  const map = new Map();
  for (const source of SMART_LINK_SOURCES) {
    map.set(source.value, source.value);
    for (const alias of source.aliases || []) {
      map.set(String(alias).trim().toLowerCase(), source.value);
    }
  }
  return map;
})();

/** Normalize UI / legacy values to canonical lowercase source keys. */
export function normalizeSmartLinkSource(value) {
  if (value == null || value === "") return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (ALLOWED_SMART_LINK_SOURCES.has(lowered)) return lowered;

  return SOURCE_ALIAS_MAP.get(lowered) || SOURCE_ALIAS_MAP.get(trimmed.toLowerCase()) || null;
}

export function isAllowedSmartLinkSource(value) {
  return normalizeSmartLinkSource(value) != null;
}

export const SMART_LINK_SOURCE_OPTIONS = SMART_LINK_SOURCES.map(({ value, label, icon }) => ({
  value,
  label,
  icon,
}));

const SOURCE_LABEL_MAP = new Map(SMART_LINK_SOURCES.map((s) => [s.value, s.label]));

export function getSmartLinkSourceDisplayLabel(source) {
  const key = normalizeSmartLinkSource(source);
  if (!key) return "—";
  return SOURCE_LABEL_MAP.get(key) || key;
}

/** Conversion funnel step definitions — matches smart-link-analytics.js semantics. */
export const SMART_LINK_CONVERSION_STEPS = [
  { key: "clicks", label: "النقرات", source: "partner_attribution_sessions" },
  { key: "signups", label: "التسجيلات", source: "partner_referral_attributions" },
  { key: "qualified", label: "المؤهلون", source: "partner_referral_qualifications.state=qualified" },
  { key: "customers", label: "العملاء", source: "partner_referral_qualifications.state=customer" },
];
