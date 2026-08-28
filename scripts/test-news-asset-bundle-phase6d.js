#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectNewsCategory } from "../lib/news-images.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const REQUIRED_MATCHING_FIELDS = ["id", "slug", "symbol", "name", "nameEn", "path", "category"];

/**
 * Load canonical ASSET_CONFIGS modules referenced by configs/index.js.
 * Node cannot import the extensionless barrel directly; this resolves the same exports.
 */
async function loadCanonicalAssetConfigs() {
  const indexSource = read("app/components/asset-hub/configs/index.js");
  assert.match(indexSource, /export const ASSET_CONFIGS/);

  /** @type {Map<string, string>} exportName -> file stem */
  const importByExport = new Map();
  for (const match of indexSource.matchAll(/import\s+\{\s*(\w+)\s*\}\s+from\s+"\.\/([^"]+)"/g)) {
    importByExport.set(match[1], match[2]);
  }

  const configsBlock = indexSource.match(/export const ASSET_CONFIGS = \{([\s\S]*?)\};/);
  assert.ok(configsBlock, "ASSET_CONFIGS block missing in configs/index.js");

  /** @type {Record<string, any>} */
  const assetConfigs = {};
  for (const match of configsBlock[1].matchAll(/^\s*(\w+):\s*(\w+),/gm)) {
    const key = match[1];
    const exportName = match[2];
    const fileStem = importByExport.get(exportName);
    assert.ok(fileStem, `configs/index.js missing import for ${exportName}`);
    const mod = await import(
      pathToFileURL(path.join(rootDir, `app/components/asset-hub/configs/${fileStem}.js`)).href
    );
    const config = mod[exportName];
    assert.ok(config, `${exportName} not exported from configs/${fileStem}.js`);
    assetConfigs[key] = config;
  }

  return assetConfigs;
}

const MARKET_PAGES = {
  crypto: { id: "market-crypto", symbol: "CRYPTO", name: "العملات الرقمية", path: "/crypto", kind: "market" },
  forex: { id: "market-forex", symbol: "FOREX", name: "الفوركس", path: "/forex", kind: "market" },
  metal: { id: "market-gold", symbol: "GOLD", name: "الذهب", path: "/xauusd", kind: "market" },
  energy: { id: "market-oil", symbol: "OIL", name: "النفط", path: "/oil", kind: "market" },
  indices: { id: "market-stocks", symbol: "STOCKS", name: "الأسهم العالمية", path: "/stocks", kind: "market" },
  commodities: { id: "market-commodities", symbol: "COMMODITIES", name: "السلع", path: "/commodities", kind: "market" },
};

const COMPANION_ASSETS = {
  btc: ["eth"],
  eth: ["btc"],
  gold: ["xauusd", "silver"],
  xauusd: ["gold"],
  silver: ["gold"],
};

const CATEGORY_TO_MARKET = {
  crypto: "crypto",
  forex: "forex",
  metal: "metal",
  energy: "energy",
  indices: "indices",
};

const NEWS_CATEGORY_TO_MARKET = {
  crypto: "crypto",
  commodities: "commodities",
  stocks: "indices",
  economy: "forex",
  geopolitics: "commodities",
};

const EXPLICIT_TOPIC_PATTERNS = [
  { pattern: /bitcoin|btc|بيتكوين/i, assets: ["btc", "eth"], market: "crypto" },
  { pattern: /ethereum|eth|إيثريوم|إيثيريوم/i, assets: ["eth", "btc"], market: "crypto" },
  { pattern: /solana|\bsol\b|سولانا/i, assets: ["sol"], market: "crypto" },
  { pattern: /ripple|\bxrp\b|ريبل/i, assets: ["xrp"], market: "crypto" },
  { pattern: /gold|xau|ذهب/i, assets: ["gold", "xauusd"], market: "metal" },
  { pattern: /oil|brent|crude|opec|نفط|أوبك/i, assets: ["oil"], market: "energy" },
  { pattern: /eurusd|eur\/usd|اليورو.*دولار/i, assets: ["eurusd"], market: "forex" },
  { pattern: /nasdaq|ناسداك/i, assets: ["nasdaq"], market: "indices" },
  { pattern: /forex|فوركس/i, assets: ["eurusd", "gbpusd"], market: "forex" },
];

function buildNewsSearchText(newsItem = {}) {
  const tags = Array.isArray(newsItem.tags)
    ? newsItem.tags.join(" ")
    : typeof newsItem.tags === "string"
      ? newsItem.tags
      : "";
  const category = newsItem.category || detectNewsCategory(newsItem);
  return `${newsItem.title || ""} ${newsItem.content || ""} ${newsItem.slug || ""} ${newsItem.topic_cluster || ""} ${tags} ${category}`.toLowerCase();
}

function scoreLegacyAssetMatch(text, config) {
  const keywords = config?.news?.keywords || [];
  let score = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = String(keyword).toLowerCase();
    if (normalizedKeyword && text.includes(normalizedKeyword)) {
      score += normalizedKeyword.length >= 4 ? 3 : 2;
    }
  }
  const symbol = String(config.symbol || "").toLowerCase();
  const slug = String(config.slug || "").toLowerCase();
  const nameEn = String(config.nameEn || "").toLowerCase();
  if (symbol && text.includes(symbol)) score += 2;
  if (slug && text.includes(slug)) score += 1;
  if (nameEn && text.includes(nameEn)) score += 2;
  return score;
}

function getRelatedAssetsFromLegacyConfigs(newsItem = {}, assetConfigs = {}, options = {}) {
  const maxItems = options.maxItems ?? 8;
  const text = buildNewsSearchText(newsItem);
  const detectedCategory = detectNewsCategory(newsItem);
  const results = new Map();
  const addItem = (item, score) => {
    const existing = results.get(item.id);
    if (!existing || existing.score < score) results.set(item.id, { ...item, score });
  };

  for (const config of Object.values(assetConfigs)) {
    const score = scoreLegacyAssetMatch(text, config);
    if (score > 0) {
      addItem(
        {
          id: config.id,
          symbol: config.symbol,
          name: config.name,
          path: config.path,
          kind: "asset",
          category: config.category,
        },
        score
      );
    }
  }

  for (const [id, item] of [...results.entries()]) {
    if (item.kind !== "asset") continue;
    for (const companionId of COMPANION_ASSETS[id] || []) {
      const companion = assetConfigs[companionId];
      if (!companion) continue;
      addItem(
        {
          id: companion.id,
          symbol: companion.symbol,
          name: companion.name,
          path: companion.path,
          kind: "asset",
          category: companion.category,
        },
        Math.max(item.score - 1, 1)
      );
    }
  }

  for (const { pattern, assets, market } of EXPLICIT_TOPIC_PATTERNS) {
    if (!pattern.test(text)) continue;
    for (const assetId of assets) {
      const config = assetConfigs[assetId];
      if (!config) continue;
      addItem(
        {
          id: config.id,
          symbol: config.symbol,
          name: config.name,
          path: config.path,
          kind: "asset",
          category: config.category,
        },
        5
      );
    }
    if (market && MARKET_PAGES[market]) addItem({ ...MARKET_PAGES[market] }, 4);
  }

  for (const category of new Set(
    [...results.values()]
      .filter((item) => item.kind === "asset" && item.category)
      .map((item) => item.category)
  )) {
    const marketKey = CATEGORY_TO_MARKET[category];
    if (marketKey && MARKET_PAGES[marketKey]) addItem({ ...MARKET_PAGES[marketKey] }, 2);
  }

  const marketFromCategory = NEWS_CATEGORY_TO_MARKET[detectedCategory];
  if (marketFromCategory && MARKET_PAGES[marketFromCategory]) {
    addItem({ ...MARKET_PAGES[marketFromCategory] }, 1);
  }

  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, maxItems);
}

function normalizeResults(items) {
  return items.map((item) => ({
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    path: item.path,
    kind: item.kind,
    score: item.score,
    category: item.category,
  }));
}

async function loadNewMatcher() {
  const indexMod = await import(
    pathToFileURL(path.join(rootDir, "lib/news-asset-matching-index.js")).href
  );
  const index = indexMod.NEWS_ASSET_MATCHING_INDEX;

  return function getRelatedAssetsFromNews(newsItem = {}, options = {}) {
    const maxItems = options.maxItems ?? 8;
    const text = buildNewsSearchText(newsItem);
    const detectedCategory = detectNewsCategory(newsItem);
    const results = new Map();
    const addItem = (item, score) => {
      const existing = results.get(item.id);
      if (!existing || existing.score < score) results.set(item.id, { ...item, score });
    };

    for (const config of Object.values(index)) {
      let score = 0;
      for (const keyword of config.keywords || []) {
        const normalizedKeyword = String(keyword).toLowerCase();
        if (normalizedKeyword && text.includes(normalizedKeyword)) {
          score += normalizedKeyword.length >= 4 ? 3 : 2;
        }
      }
      const symbol = String(config.symbol || "").toLowerCase();
      const slug = String(config.slug || "").toLowerCase();
      const nameEn = String(config.nameEn || "").toLowerCase();
      if (symbol && text.includes(symbol)) score += 2;
      if (slug && text.includes(slug)) score += 1;
      if (nameEn && text.includes(nameEn)) score += 2;
      if (score > 0) {
        addItem(
          {
            id: config.id,
            symbol: config.symbol,
            name: config.name,
            path: config.path,
            kind: "asset",
            category: config.category,
          },
          score
        );
      }
    }

    for (const [id, item] of [...results.entries()]) {
      if (item.kind !== "asset") continue;
      for (const companionId of COMPANION_ASSETS[id] || []) {
        const companion = index[companionId];
        if (!companion) continue;
        addItem(
          {
            id: companion.id,
            symbol: companion.symbol,
            name: companion.name,
            path: companion.path,
            kind: "asset",
            category: companion.category,
          },
          Math.max(item.score - 1, 1)
        );
      }
    }

    for (const { pattern, assets, market } of EXPLICIT_TOPIC_PATTERNS) {
      if (!pattern.test(text)) continue;
      for (const assetId of assets) {
        const config = index[assetId];
        if (!config) continue;
        addItem(
          {
            id: config.id,
            symbol: config.symbol,
            name: config.name,
            path: config.path,
            kind: "asset",
            category: config.category,
          },
          5
        );
      }
      if (market && MARKET_PAGES[market]) addItem({ ...MARKET_PAGES[market] }, 4);
    }

    for (const category of new Set(
      [...results.values()]
        .filter((item) => item.kind === "asset" && item.category)
        .map((item) => item.category)
    )) {
      const marketKey = CATEGORY_TO_MARKET[category];
      if (marketKey && MARKET_PAGES[marketKey]) addItem({ ...MARKET_PAGES[marketKey] }, 2);
    }

    const marketFromCategory = NEWS_CATEGORY_TO_MARKET[detectedCategory];
    if (marketFromCategory && MARKET_PAGES[marketFromCategory]) {
      addItem({ ...MARKET_PAGES[marketFromCategory] }, 1);
    }

    return [...results.values()].sort((a, b) => b.score - a.score).slice(0, maxItems);
  };
}

function testNewsMatcherDoesNotImportConfigsBarrel() {
  const source = read("app/components/asset-hub/getRelatedAssetsFromNews.js");
  assert.doesNotMatch(source, /from\s+["']\.\/configs["']/);
  assert.doesNotMatch(source, /ASSET_CONFIGS/);
  assert.match(source, /NEWS_ASSET_MATCHING_INDEX/);
  assert.doesNotMatch(read("app/components/news/newsListHelpers.js"), /configs\/index/);
}

async function testLightweightIndexShape() {
  const source = read("lib/news-asset-matching-index.js");
  assert.match(source, /export const NEWS_ASSET_MATCHING_INDEX/);
  assert.doesNotMatch(source, /tradingViewSymbol/);
  assert.doesNotMatch(source, /chartSymbol/);
  assert.doesNotMatch(source, /faq/);

  const mod = await import(pathToFileURL(path.join(rootDir, "lib/news-asset-matching-index.js")).href);
  const entries = Object.values(mod.NEWS_ASSET_MATCHING_INDEX);
  assert.equal(entries.length, 46, "lightweight index must contain exactly 46 assets");
  for (const entry of entries) {
    assert.ok(entry.id);
    assert.ok(entry.symbol);
    assert.ok(entry.name);
    assert.ok(entry.path);
    assert.ok(entry.category);
    assert.ok(Array.isArray(entry.keywords));
  }
  const hrefs = entries.map((e) => e.path);
  assert.equal(new Set(hrefs).size, hrefs.length, "duplicate canonical hrefs in lightweight index");
}

async function testCanonicalConfigParity() {
  const canonical = await loadCanonicalAssetConfigs();
  const mod = await import(pathToFileURL(path.join(rootDir, "lib/news-asset-matching-index.js")).href);
  const lightweight = mod.NEWS_ASSET_MATCHING_INDEX;

  const canonicalIds = Object.keys(canonical).sort();
  const lightweightIds = Object.keys(lightweight).sort();

  assert.equal(canonicalIds.length, 46, "canonical asset config count must be 46");
  assert.equal(lightweightIds.length, 46, "lightweight index count must be 46");
  assert.equal(canonicalIds.length, lightweightIds.length, "canonical vs lightweight cardinality mismatch");
  assert.deepEqual(lightweightIds, canonicalIds, "lightweight index keys must match canonical ASSET_CONFIGS keys");

  const ids = lightweightIds.map((id) => lightweight[id].id);
  const slugs = lightweightIds.map((id) => lightweight[id].slug);
  const paths = lightweightIds.map((id) => lightweight[id].path);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in lightweight index");
  assert.equal(new Set(slugs).size, slugs.length, "duplicate slug in lightweight index");
  assert.equal(new Set(paths).size, paths.length, "duplicate canonical path in lightweight index");

  let fieldChecks = 0;
  for (const id of canonicalIds) {
    const canonicalConfig = canonical[id];
    const lightweightEntry = lightweight[id];
    assert.ok(lightweightEntry, `lightweight index missing canonical asset: ${id}`);

    for (const field of REQUIRED_MATCHING_FIELDS) {
      assert.equal(
        lightweightEntry[field],
        canonicalConfig[field],
        `${id}.${field} mismatch: lightweight=${JSON.stringify(lightweightEntry[field])} canonical=${JSON.stringify(canonicalConfig[field])}`
      );
      fieldChecks += 1;
    }

    const canonicalKeywords = canonicalConfig.news?.keywords ?? [];
    assert.deepEqual(
      lightweightEntry.keywords,
      canonicalKeywords,
      `${id}.keywords mismatch (order-sensitive)`
    );
    fieldChecks += 1;
  }

  assert.equal(fieldChecks, canonicalIds.length * (REQUIRED_MATCHING_FIELDS.length + 1));
}

function testAssetHubBarrelUnchanged() {
  const indexSource = read("app/components/asset-hub/configs/index.js");
  assert.match(indexSource, /export const ASSET_CONFIGS/);
  assert.match(indexSource, /btcAssetConfig/);
}

function testNewsRefreshArchitectureUnchanged() {
  const client = read("app/(public)/news/NewsListClient.js");
  assert.match(client, /NEWS_BACKGROUND_FILL_SIZE/);
  assert.match(client, /NEWS_SSR_INITIAL_SIZE/);
  assert.match(client, /afterCreatedAt/);
  assert.match(client, /afterId/);
  assert.doesNotMatch(client, /configs\/index/);
}

function testNoProviderChanges() {
  for (const file of [
    "app/components/AuthProvider.js",
    "app/components/ClientProviders.js",
    "app/components/RootLayoutShell.js",
  ]) {
    assert.ok(fs.existsSync(path.join(rootDir, file)));
  }
}

async function testMatchingParityFixtures() {
  const getNew = await loadNewMatcher();
  const legacyConfigs = await loadCanonicalAssetConfigs();

  const fixtures = [
    { title: "Bitcoin surges above $70k as ETF inflows accelerate", content: "BTC rally continues" },
    { title: "Ethereum upgrade boosts network throughput", content: "ETH developers ship patch" },
    { title: "سولانا ترتفع بعد تحديث الشبكة", content: "SOL gains on ecosystem growth" },
    { title: "Ripple XRP wins partial court clarity", content: "XRP legal case update" },
    { title: "BNB holds support on Binance ecosystem news", content: "binance coin steady" },
    { title: "Dogecoin meme rally fades", content: "DOGE retraces after spike" },
    { title: "Gold prices climb as XAU/USD breaks resistance", content: "ذهب يرتفع مع الدولار" },
    { title: "Silver and gold metals outlook", content: "xag xau precious metals" },
    { title: "Oil slips after OPEC guidance", content: "brent crude wti نفط" },
    { title: "EURUSD rebounds after ECB comments", content: "eur/usd forex فوركس" },
    { title: "GBPUSD cable moves on BOE rhetoric", content: "pound sterling" },
    { title: "USDJPY jumps as BOJ stays dovish", content: "yen ين" },
    { title: "DXY dollar index hits multi-week high", content: "مؤشر الدولار fed" },
    { title: "S&P 500 earnings season kicks off", content: "sp500 stocks أرباح" },
    { title: "Nasdaq tech rally extends", content: "ndx qqq technology" },
    { title: "Dow Jones industrial average closes higher", content: "dji dow stocks" },
    { title: "Bitcoin and Ethereum lead crypto market", content: "btc eth بيتكوين إيثريوم" },
    { title: "Solana and Cardano ecosystem updates", content: "sol ada solana" },
    { title: "Random market wrap without asset keywords", content: "general macro commentary only" },
    { title: "Polkadot parachain auction results", content: "dot polkadot" },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const oldResult = normalizeResults(
      getRelatedAssetsFromLegacyConfigs(fixture, legacyConfigs, { maxItems: 8 })
    );
    const newResult = normalizeResults(getNew(fixture, { maxItems: 8 }));
    assert.deepEqual(newResult, oldResult, `parity mismatch fixture #${index + 1}: ${fixture.title}`);
  }
}

async function testFalsePositiveControls() {
  const getRelated = await loadNewMatcher();

  const adaOnly = getRelated({ title: "United Kingdom trade policy update", content: "" }, { maxItems: 5 }).filter(
    (item) => item.id === "ada"
  );
  assert.equal(adaOnly.length, 0);

  // Pre-existing substring behavior: short symbols can match inside longer words (e.g. "sol" in "isolated").
  const legacyConfigs = await loadCanonicalAssetConfigs();
  const legacy = getRelatedAssetsFromLegacyConfigs(
    { title: "isolated word solstice astronomy", content: "" },
    legacyConfigs,
    { maxItems: 5 }
  )
    .filter((item) => item.kind === "asset")
    .map((item) => item.id);
  const current = getRelated({ title: "isolated word solstice astronomy", content: "" }, { maxItems: 5 })
    .filter((item) => item.kind === "asset")
    .map((item) => item.id);
  assert.deepEqual(current, legacy);
}

function testCanonicalImportIsTestOnly() {
  const testSource = read("scripts/test-news-asset-bundle-phase6d.js");
  assert.match(testSource, /loadCanonicalAssetConfigs/);
  assert.match(testSource, /configs\/index\.js/);
  assert.doesNotMatch(read("app/components/asset-hub/getRelatedAssetsFromNews.js"), /configs\/index/);
  assert.doesNotMatch(read("lib/news-asset-matching-index.js"), /configs\/index/);
}

const tests = [
  ["news matcher does not import configs barrel", testNewsMatcherDoesNotImportConfigsBarrel],
  ["lightweight index contains required fields only", testLightweightIndexShape],
  ["canonical config parity (46 assets, fields + keywords)", testCanonicalConfigParity],
  ["canonical barrel import remains test-only", testCanonicalImportIsTestOnly],
  ["asset hub config barrel remains unchanged", testAssetHubBarrelUnchanged],
  ["news refresh architecture unchanged", testNewsRefreshArchitectureUnchanged],
  ["no provider/auth changes in scope", testNoProviderChanges],
  ["matching parity fixtures", testMatchingParityFixtures],
  ["false-positive controls", testFalsePositiveControls],
];

let passed = 0;
for (const [label, fn] of tests) {
  await fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 6D news asset bundle: ${passed}/${tests.length} test groups passed`);
console.log(`Canonical parity field checks: ${46 * (REQUIRED_MATCHING_FIELDS.length + 1)} assertions`);
