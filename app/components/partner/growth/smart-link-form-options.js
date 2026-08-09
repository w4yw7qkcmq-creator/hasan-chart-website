export const SMART_LINK_SOURCE_OPTIONS = [
  { value: "telegram", label: "تيليغرام", icon: "✈️" },
  { value: "x", label: "X", icon: "𝕏" },
  { value: "youtube", label: "يوتيوب", icon: "▶️" },
  { value: "whatsapp", label: "واتساب", icon: "💬" },
  { value: "other", label: "أخرى", icon: "🔗" },
];

export function buildEligibleCampaignOptions(campaigns = []) {
  const eligible = (campaigns || []).filter((c) => c.eligible);
  return [
    { value: "", label: "بدون حملة" },
    ...eligible.map((c) => ({
      value: c.code,
      label: c.name,
    })),
  ];
}
