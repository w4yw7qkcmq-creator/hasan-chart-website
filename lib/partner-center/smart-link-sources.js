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
