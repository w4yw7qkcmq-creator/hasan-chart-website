import { ASSET_CONFIGS } from "../asset-hub/configs";
export const DAILY_ANALYSIS_FILTERS = [
  { key: "all", label: "الكل" },
  { key: "crypto", label: "العملات الرقمية" },
  { key: "forex", label: "الفوركس" },
  { key: "gold-commodities", label: "الذهب والسلع" },
  { key: "stocks", label: "الأسهم والمؤشرات" },
];
export const TRENDING_MARKET_LINKS = [
  { label: "البيتكوين", symbol: "BTC", href: "/btc" },
  { label: "الإيثريوم", symbol: "ETH", href: "/eth" },
  { label: "الذهب", symbol: "XAU", href: "/xau" },
  { label: "اليورو دولار", symbol: "EURUSD", href: "/eurusd" },
  { label: "ناسداك", symbol: "NASDAQ", href: "/nasdaq" },
  { label: "جميع الأصول", symbol: "ASSETS", href: "/assets" },
];
export const DAILY_ANALYSIS_HUB_LINKS = [
  { label: "التحليل الفني", href: "/technical-analysis" },
  { label: "الأسواق", href: "/markets" },
  { label: "الأصول", href: "/assets" },
  { label: "الاشتراكات", href: "/subscriptions" },
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
];
const MARKET_CATEGORY_LABELS = {
  crypto: "العملات الرقمية",
  forex: "الفوركس",
  metal: "الذهب والسلع",
  energy: "النفط والطاقة",
  indices: "الأسهم والمؤشرات",
  global: "الأسواق العالمية",
};
const SYMBOL_LOOKUP = buildSymbolLookup();
function buildSymbolLookup() {
  /** @type {Map<string, import("../asset-hub/configs/types").AssetHubConfig>} */ const lookup =
    new Map();
  const register = (token, config) => {
    const normalized = String(token || "")
      .trim()
      .toUpperCase();
    if (!normalized || lookup.has(normalized)) return;
    lookup.set(normalized, config);
  };
  for (const config of Object.values(ASSET_CONFIGS)) {
    register(config.symbol, config);
    register(config.slug, config);
    register(config.id, config);
    register(config.chartSymbol, config);
    register(config.tradingViewSymbol?.split(":")[1], config);
    register(`${config.symbol}USDT`, config);
    register(`${config.chartSymbol}`, config);
  }
  register("GOLD", ASSET_CONFIGS.gold);
  register("XAU", ASSET_CONFIGS.gold);
  register("XAUUSD", ASSET_CONFIGS.xauusd);
  register("USOIL", ASSET_CONFIGS.oil);
  register("OIL", ASSET_CONFIGS.oil);
  register("WTI", ASSET_CONFIGS.oil);
  register("NASDAQ100", ASSET_CONFIGS.nasdaq);
  register("NDX", ASSET_CONFIGS.nasdaq);
  register("SPX", ASSET_CONFIGS.sp500);
  register("DOW", ASSET_CONFIGS.dowjones);
  return lookup;
} /** * @param {string} symbol * @param {string} [title] */
export function resolveAnalysisAsset(symbol = "", title = "") {
  const normalizedSymbol = String(symbol || "")
    .trim()
    .toUpperCase();
  const compactSymbol = normalizedSymbol.replace(/[^A-Z0-9]/g, "");
  const text = `${symbol} ${title}`.toUpperCase();
  const candidates = [
    normalizedSymbol,
    compactSymbol,
    compactSymbol.replace(/USDT$/, ""),
    compactSymbol.replace(/USD$/, ""),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const config = SYMBOL_LOOKUP.get(candidate);
    if (config) return config;
  }
  for (const config of Object.values(ASSET_CONFIGS)) {
    if (
      text.includes(config.symbol) ||
      text.includes(config.slug.toUpperCase())
    ) {
      return config;
    }
  }
  return null;
} /** * @param {{ symbol?: string, title?: string, content?: string }} item */
export function getAnalysisMarketCategory(item = {}) {
  const asset = resolveAnalysisAsset(item.symbol, item.title);
  if (asset?.category) {
    if (asset.category === "energy") return "gold-commodities";
    if (asset.category === "metal") return "gold-commodities";
    if (asset.category === "indices") return "stocks";
    return asset.category;
  }
  const text =
    `${item.symbol || ""} ${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (/btc|eth|crypto|usdt|bnb|sol|xrp|كريبتو|بيتكوين/.test(text))
    return "crypto";
  if (/eurusd|gbpusd|usdjpy|forex|فوركس|eur\/usd/.test(text)) return "forex";
  if (/gold|xau|silver|xag|oil|usoil|نفط|ذهب|سلع/.test(text))
    return "gold-commodities";
  if (/nasdaq|sp500|dow|stocks|indices|أسهم|مؤشر/.test(text)) return "stocks";
  return "crypto";
} /** * @param {{ symbol?: string, title?: string, content?: string }} item */
export function getAnalysisMarketLabel(item = {}) {
  const asset = resolveAnalysisAsset(item.symbol, item.title);
  if (asset) {
    return (
      MARKET_CATEGORY_LABELS[asset.category] ||
      asset.categoryLabel ||
      "الأسواق المالية"
    );
  }
  const category = getAnalysisMarketCategory(item);
  if (category === "gold-commodities") return "الذهب والسلع";
  if (category === "stocks") return "الأسهم والمؤشرات";
  return MARKET_CATEGORY_LABELS[category] || "الأسواق المالية";
} /** * @param {{ symbol?: string, title?: string, content?: string }} item */
export function getAnalysisAssetName(item = {}) {
  const asset = resolveAnalysisAsset(item.symbol, item.title);
  if (asset) return asset.name;
  const symbol = String(item.symbol || "").trim();
  return symbol || "سوق مالي";
} /** * @param {{ symbol?: string, title?: string, content?: string }} item * @param {string} filterKey */
export function matchesDailyAnalysisFilter(item, filterKey) {
  if (filterKey === "all") return true;
  return getAnalysisMarketCategory(item) === filterKey;
} /** * @param {string | number} id */
export function getAnalysisAnchorId(id) {
  return `analysis-${id}`;
}
