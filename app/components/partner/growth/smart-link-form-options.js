export {
  SMART_LINK_SOURCE_OPTIONS,
  SMART_LINK_SOURCES,
  ALLOWED_SMART_LINK_SOURCES,
  normalizeSmartLinkSource,
  isAllowedSmartLinkSource,
} from "../../../../lib/partner-center/smart-link-sources.js";

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
