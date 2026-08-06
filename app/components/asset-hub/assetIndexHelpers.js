import { ASSET_CONFIGS } from "./configs";
/** @type {Array<{ id: string, label: string, icon: string }>} */
export const ASSET_INDEX_GROUPS = [
  { id: "crypto", label: "العملات الرقمية", icon: "₿" },
  { id: "forex", label: "الفوركس", icon: "💱" },
  { id: "metal", label: "المعادن", icon: "🥇" },
  { id: "energy", label: "الطاقة", icon: "🛢️" },
  { id: "indices", label: "المؤشرات", icon: "📈" },
]; /** * @param {import("./configs/types").AssetHubConfig} config * @returns {string} */
export function resolveAssetIndexGroupId(config) {
  if (config.category === "global") {
    return config.id === "xauusd" ? "metal" : "forex";
  }
  return config.category;
} /** * @returns {Array<{ * id: string, * name: string, * nameEn: string, * symbol: string, * path: string, * categoryId: string, * categoryLabel: string, * summary: string, * }>} */
export function getAssetsIndexItems() {
  const groupLabelById = Object.fromEntries(
    ASSET_INDEX_GROUPS.map((g) => [g.id, g.label]),
  );
  return Object.values(ASSET_CONFIGS)
    .map((config) => {
      const categoryId = resolveAssetIndexGroupId(config);
      return {
        id: config.id,
        name: config.name,
        nameEn: config.nameEn,
        symbol: config.symbol,
        path: config.path,
        categoryId,
        categoryLabel: groupLabelById[categoryId] || config.categoryLabel,
        summary: config.description.marketSummary,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
} /** * @returns {Array<{ * id: string, * label: string, * icon: string, * count: number, * items: ReturnType<typeof getAssetsIndexItems>, * }>} */
export function getAssetsIndexGroups() {
  const items = getAssetsIndexItems();
  return ASSET_INDEX_GROUPS.map((group) => {
    const groupItems = items.filter((item) => item.categoryId === group.id);
    return { ...group, count: groupItems.length, items: groupItems };
  }).filter((group) => group.count > 0);
} /** * @returns {Array<{ name: string, url: string }>} */
export function getAssetsIndexJsonLdItems() {
  return getAssetsIndexItems().map((item) => ({
    name: `${item.name} (${item.symbol})`,
    url: item.path,
  }));
}
