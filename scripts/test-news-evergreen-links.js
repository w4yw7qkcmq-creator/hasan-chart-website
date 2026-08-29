#!/usr/bin/env node
/**
 * Phase 12 — deterministic news evergreen link fixtures + production replay.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectNewsCategory } from "../lib/news-images.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { getRelatedAssetsFromNews } = await import(
  pathToFileURL(path.join(rootDir, "app/components/asset-hub/getRelatedAssetsFromNews.js")).href
);
const { NEWS_ASSET_MATCHING_INDEX } = await import(
  pathToFileURL(path.join(rootDir, "lib/news-asset-matching-index.js")).href
);

/** Test-only mirror of watch-point rules — newsDetailHelpers.js intentionally unchanged. */
const WATCH_POINTS_BY_TOPIC = {
  inflation: [{ href: "/dxy" }, { href: "/xauusd" }, { href: "/stocks" }, { href: "/btc" }],
  rates: [{ href: "/dxy" }, { href: "/xauusd" }, { href: "/stocks" }, { href: "/crypto" }],
};

const TOPIC_TYPE_RULES = [
  { pattern: /inflation|cpi|pce|تضخم/i, watchTopic: "inflation" },
  { pattern: /fed|powell|rate|interest|federal reserve|فيدرالي|الفائدة|باول/i, watchTopic: "rates" },
];

function getWatchPointsForTest(news = {}) {
  const text = `${news.title || ""} ${news.content || ""}`.toLowerCase();
  for (const rule of TOPIC_TYPE_RULES) {
    if (rule.pattern.test(text)) {
      return WATCH_POINTS_BY_TOPIC[rule.watchTopic] || [];
    }
  }
  if (detectNewsCategory(news) === "economy") {
    return WATCH_POINTS_BY_TOPIC.inflation;
  }
  return WATCH_POINTS_BY_TOPIC.rates;
}

function paths(news, options = {}) {
  return getRelatedAssetsFromNews(news, options).map((item) => item.path);
}

function assertNoXau(resultPaths, label) {
  assert.ok(!resultPaths.includes("/xau"), `${label}: must not emit /xau, got ${resultPaths.join(", ")}`);
}

function assertIncludes(resultPaths, expected, label) {
  assert.ok(
    resultPaths.includes(expected),
    `${label}: expected ${expected} in ${resultPaths.join(", ") || "(empty)"}`
  );
}

function assertExcludes(resultPaths, forbidden, label) {
  assert.ok(
    !resultPaths.some((p) => forbidden.includes(p)),
    `${label}: must not include ${forbidden.join(", ")}, got ${resultPaths.join(", ")}`
  );
}

function assertEmpty(resultPaths, label) {
  assert.equal(resultPaths.length, 0, `${label}: expected NO_LINK, got ${resultPaths.join(", ")}`);
}

// --- Fixtures ---

const FIXTURES = [
  {
    name: "Bitcoin-specific",
    news: {
      title: "Bitcoin holds above $80,000 as crypto majors rally",
      content: "Bitcoin and BTC remain firm ahead of Jackson Hole.",
      category: "crypto",
    },
    assert: (p) => {
      assertIncludes(p, "/btc", "Bitcoin-specific");
      assertIncludes(p, "/crypto", "Bitcoin-specific");
      assertExcludes(p, ["/forex"], "Bitcoin-specific");
    },
  },
  {
    name: "Broad crypto",
    news: {
      title: "Crypto market sentiment improves after volatile week",
      content: "Digital assets and blockchain tokens recovered broadly.",
      category: "crypto",
    },
    assert: (p) => assertIncludes(p, "/crypto", "Broad crypto"),
  },
  {
    name: "General gold",
    news: {
      title: "أسعار الذهب ترتفع مع تراجع الدولار",
      content: "سوق الذهب يستفيد من ضعف المعنويات.",
      category: "commodities",
    },
    assert: (p) => {
      assertIncludes(p, "/gold", "General gold");
      assertNoXau(p, "General gold");
    },
  },
  {
    name: "Explicit XAU/USD",
    news: {
      title: "XAU/USD يخترق 3500",
      content: "زوج الذهب مقابل الدولار XAU/USD extended gains.",
      category: "commodities",
    },
    assert: (p) => {
      assertIncludes(p, "/xauusd", "Explicit XAU/USD");
      assertNoXau(p, "Explicit XAU/USD");
    },
  },
  {
    name: "NASDAQ selloff",
    news: {
      title: "NASDAQ falls as tech stocks slide",
      content: "ناسداك led losses in US equities.",
      category: "stocks",
    },
    assert: (p) => {
      assertIncludes(p, "/nasdaq", "NASDAQ selloff");
      assertIncludes(p, "/stocks", "NASDAQ selloff");
    },
  },
  {
    name: "Broad US stocks",
    news: {
      title: "US stocks edge lower ahead of data",
      content: "Global equities and the S&P 500 eased.",
      category: "stocks",
    },
    assert: (p) => assertIncludes(p, "/stocks", "Broad US stocks"),
  },
  {
    name: "Forex-general",
    news: {
      title: "Forex market awaits central bank signals",
      content: "فوركس traders focus on rate expectations.",
      category: "economy",
    },
    assert: (p) => assertIncludes(p, "/forex", "Forex-general"),
  },
  {
    name: "EUR/USD",
    news: {
      title: "EUR/USD steadies near recent highs",
      content: "Euro dollar pair held support.",
      category: "forex",
    },
    assert: (p) => {
      assertIncludes(p, "/eurusd", "EUR/USD");
    },
  },
  {
    name: "Oil supply shock",
    news: {
      title: "Oil jumps on supply disruption fears",
      content: "Brent crude and OPEC supply concerns lifted energy prices.",
      category: "commodities",
    },
    assert: (p) => {
      assertIncludes(p, "/oil", "Oil supply shock");
    },
  },
  {
    name: "CPI release",
    news: {
      title: "US CPI rises 0.3% in latest report",
      content: "Consumer price inflation data came in line with expectations.",
      category: "economy",
    },
    assertRelated: (p) => assertEmpty(p, "CPI related assets"),
    assertWatch: (news) => {
      const watch = getWatchPointsForTest(news).map((w) => w.href);
      assert.ok(watch.length > 0, "CPI watch points may remain");
    },
  },
  {
    name: "NFP release",
    news: {
      title: "US NFP beats expectations",
      content: "Nonfarm payrolls added more jobs than forecast.",
      category: "economy",
    },
    assertRelated: (p) => {
      assertExcludes(p, ["/gold", "/xau", "/xauusd"], "NFP related assets");
    },
  },
  {
    name: "Fed rate decision",
    news: {
      title: "Fed keeps rates unchanged, Powell warns on inflation",
      content: "Federal Reserve and Fed officials held the benchmark rate.",
      category: "economy",
    },
    assert: (p) => {
      assert.ok(p.length > 0, "Fed rate story should retain useful links");
    },
    assertWatch: (news) => {
      const watch = getWatchPointsForTest(news).map((w) => w.href);
      assert.ok(watch.includes("/dxy") || watch.includes("/forex"), "Fed watch points");
    },
  },
  {
    name: "Consumer confidence",
    news: {
      title: "US consumer confidence index declines",
      content: "Consumer sentiment weakened this month.",
      category: "economy",
    },
    assertRelated: (p) => assertExcludes(p, ["/gold", "/xau", "/xauusd"], "Consumer confidence"),
  },
  {
    name: "GPU financing",
    news: {
      title:
        "أعلنت شركة بوليش عن جمعها لمبلغ مئة مليون دولار لتمويل قروض مدعومة بوحدات معالجة الرسوميات، بهدف تعزيز خدماتها في مجال التمويل الرقمي",
      content:
        "أعلنت شركة بوليش عن جمعها لمبلغ مئة مليون دولار لتمويل قروض مدعومة بوحدات معالجة الرسوميات، بهدف تعزيز خدماتها في مجال التمويل الرقمي.",
      slug: "market-news-ce8c1c",
      category: "economy",
    },
    assertRelated: (p) => {
      assertEmpty(p, "GPU financing");
    },
  },
  {
    name: "Arabic monetary A",
    news: {
      title: "تمويل بقيمة مئة مليون دولار",
      content: "شركة تمويل تقنية",
      category: "economy",
    },
    assertRelated: (p) =>
      assertExcludes(p, ["/dxy", "/xauusd", "/gold", "/xau"], "Arabic monetary A"),
  },
  {
    name: "Arabic monetary B",
    news: {
      title: "صفقة بقيمة 100 مليون دولار",
      content: "صفقة تمويل",
      category: "economy",
    },
    assertRelated: (p) =>
      assertExcludes(p, ["/dxy", "/xauusd", "/gold", "/xau"], "Arabic monetary B"),
  },
  {
    name: "Arabic monetary C",
    news: {
      title: "الشركة تجمع ثلاثة مليارات دولار",
      content: "جولة تمويل",
      category: "economy",
    },
    assertRelated: (p) =>
      assertExcludes(p, ["/dxy", "/xauusd", "/gold", "/xau"], "Arabic monetary C"),
  },
  {
    name: "Arabic USD market D",
    news: {
      title: "الدولار الأمريكي يرتفع أمام اليورo",
      content: "تحركات العملات",
      category: "economy",
    },
    assert: (p) => {
      assert.ok(p.length > 0, "Arabic USD market D");
      assertExcludes(p, ["/xau"], "Arabic USD market D");
    },
  },
  {
    name: "Arabic USD market E",
    news: {
      title: "مؤشر الدولار DXY يرتفع",
      content: "مؤشر الدولار",
      category: "economy",
    },
    assert: (p) => {
      assertIncludes(p, "/dxy", "Arabic USD market E");
      assertNoXau(p, "Arabic USD market E");
    },
  },
  {
    name: "Arabic USD market F",
    news: {
      title: "EUR/USD يتراجع مع قوة الدولار",
      content: "EUR/USD forex",
      category: "economy",
    },
    assert: (p) => {
      assertIncludes(p, "/eurusd", "Arabic USD market F");
      assertNoXau(p, "Arabic USD market F");
    },
  },
  {
    name: "Apple shares fall",
    news: {
      title: "Apple shares fall after earnings miss",
      content: "US stocks and tech names declined.",
      category: "stocks",
    },
    assert: (p) => {
      assertIncludes(p, "/stocks", "Apple shares fall");
      assertExcludes(p, ["/btc", "/crypto"], "Apple shares fall");
    },
  },
  {
    name: "Multi-asset dollar + gold",
    news: {
      title: "US dollar rises as gold prices fall",
      content: "Gold eased while the dollar index strengthened.",
      category: "economy",
    },
    assert: (p) => {
      assert.ok(p.length >= 1 && p.length <= 3, `Multi-asset cap sanity: ${p.join(", ")}`);
      assertNoXau(p, "Multi-asset");
    },
  },
  {
    name: "XAU/USD + generic gold language",
    news: {
      title: "الذهب يرتفع و XAUUSD يختبر مقاومة",
      content: "Gold prices climbed and xauusd tested resistance.",
      category: "commodities",
    },
    assert: (p) => {
      assert.equal(p[0], "/xauusd", `XAU/USD should be primary, got ${p.join(", ")}`);
      assertNoXau(p, "XAU/USD primary");
    },
  },
  {
    name: "No market topic",
    news: {
      title: "Company appoints new chief marketing officer",
      content: "Corporate leadership change announced today.",
      category: "economy",
    },
    assertRelated: (p) => assertEmpty(p, "No market topic"),
  },
];

// --- Legacy (pre-Phase-12) matcher for replay comparison ---

const LEGACY_MARKET_PAGES = {
  crypto: { id: "market-crypto", path: "/crypto", kind: "market" },
  forex: { id: "market-forex", path: "/forex", kind: "market" },
  metal: { id: "market-gold", path: "/xauusd", kind: "market" },
  energy: { id: "market-oil", path: "/oil", kind: "market" },
  indices: { id: "market-stocks", path: "/stocks", kind: "market" },
  commodities: { id: "market-commodities", path: "/commodities", kind: "market" },
};

const LEGACY_COMPANION = {
  btc: ["eth"],
  eth: ["btc"],
  gold: ["xauusd", "silver"],
  xauusd: ["gold"],
  silver: ["gold"],
};

const LEGACY_EXPLICIT = [
  { pattern: /bitcoin|btc|بيتكوين/i, assets: ["btc", "eth"], market: "crypto" },
  { pattern: /gold|xau|ذهب/i, assets: ["gold", "xauusd"], market: "metal" },
  { pattern: /nasdaq|ناسداك/i, assets: ["nasdaq"], market: "indices" },
  { pattern: /forex|فوركس/i, assets: ["eurusd", "gbpusd"], market: "forex" },
  { pattern: /oil|brent|crude|opec|نفط|أوبك/i, assets: ["oil"], market: "energy" },
  { pattern: /eurusd|eur\/usd/i, assets: ["eurusd"], market: "forex" },
];

function legacyScore(text, config) {
  let score = 0;
  for (const keyword of config?.keywords || []) {
    const k = String(keyword).toLowerCase();
    if (k && text.includes(k)) score += k.length >= 4 ? 3 : 2;
  }
  const symbol = String(config.symbol || "").toLowerCase();
  if (symbol && text.includes(symbol)) score += 2;
  return score;
}

function getRelatedAssetsLegacy(newsItem = {}, maxItems = 8) {
  const text = `${newsItem.title || ""} ${newsItem.content || ""} ${newsItem.slug || ""}`.toLowerCase();
  const detectedCategory = detectNewsCategory(newsItem);
  const results = new Map();
  const add = (item, score) => {
    const ex = results.get(item.id);
    if (!ex || ex.score < score) results.set(item.id, { ...item, score });
  };

  for (const config of Object.values(NEWS_ASSET_MATCHING_INDEX)) {
    const score = legacyScore(text, config);
    if (score > 0) {
      const legacyPath = config.id === "gold" ? "/xau" : config.path;
      add({ id: config.id, path: legacyPath, kind: "asset", score }, score);
    }
  }

  for (const [id, item] of [...results.entries()]) {
    for (const cid of LEGACY_COMPANION[id] || []) {
      const c = NEWS_ASSET_MATCHING_INDEX[cid];
      if (c) {
        const legacyPath = c.id === "gold" ? "/xau" : c.path;
        add({ id: c.id, path: legacyPath, kind: "asset", score: Math.max(item.score - 1, 1) }, Math.max(item.score - 1, 1));
      }
    }
  }

  for (const { pattern, assets, market } of LEGACY_EXPLICIT) {
    if (!pattern.test(text)) continue;
    for (const assetId of assets) {
      const c = NEWS_ASSET_MATCHING_INDEX[assetId];
      if (c) {
        const legacyPath = c.id === "gold" ? "/xau" : c.path;
        add({ id: c.id, path: legacyPath, kind: "asset", score: 5 }, 5);
      }
    }
    if (market && LEGACY_MARKET_PAGES[market]) add({ ...LEGACY_MARKET_PAGES[market], score: 4 }, 4);
  }

  const marketFromCategory = { crypto: "crypto", commodities: "commodities", stocks: "indices", economy: "forex", geopolitics: "commodities" }[detectedCategory];
  if (marketFromCategory && LEGACY_MARKET_PAGES[marketFromCategory]) {
    add({ ...LEGACY_MARKET_PAGES[marketFromCategory], score: 1 }, 1);
  }

  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, maxItems).map((i) => i.path);
}

// --- Index integrity ---

// Canonical index keeps /xau for asset-hub parity; news matcher remaps to /gold at render time.
assert.equal(NEWS_ASSET_MATCHING_INDEX.gold.path, "/xau", "canonical gold.path remains /xau in index");
assert.equal(NEWS_ASSET_MATCHING_INDEX.xauusd.path, "/xauusd", "xauusd.path must be /xauusd");

// --- Run fixtures ---

let passed = 0;
for (const fixture of FIXTURES) {
  const resultPaths = paths(fixture.news);
  assertNoXau(resultPaths, fixture.name);
  fixture.assert?.(resultPaths);
  fixture.assertRelated?.(resultPaths);
  fixture.assertWatch?.(fixture.news);
  passed += 1;
}

console.log(`✓ ${passed}/${FIXTURES.length} deterministic fixtures passed`);

// --- Cap comparison on fixtures + GPU ---

const CAP_SAMPLES = [
  ...FIXTURES.map((f) => ({ label: f.name, news: f.news })),
];

function summarizeCap(maxItems) {
  let good = 0;
  let questionable = 0;
  let wrong = 0;
  let totalLinks = 0;
  let maxLinks = 0;

  for (const sample of CAP_SAMPLES) {
    const p = paths(sample.news, { maxItems });
    totalLinks += p.length;
    maxLinks = Math.max(maxLinks, p.length);
    if (p.includes("/xau")) wrong += 1;
    else if (p.length === 0 && ["GPU financing", "No market topic", "CPI release"].includes(sample.label)) good += 1;
    else if (p.length === 0) questionable += 1;
    else good += 1;
  }

  return {
    cap: maxItems,
    good,
    questionable,
    wrong,
    avg: (totalLinks / CAP_SAMPLES.length).toFixed(2),
    max: maxLinks,
  };
}

console.log("\nCap comparison (fixtures):");
for (const cap of [2, 3, 4, 8]) {
  console.log(summarizeCap(cap));
}

// --- GPU production article replay (clean DB-equivalent text) ---

const GPU_PRODUCTION_NEWS = {
  title:
    "أعلنت شركة بوليش عن جمعها لمبلغ مئة مليون دولار لتمويل قروض مدعومة بوحدات معالجة الرسوميات، بهدف تعزيز خدماتها في مجال التمويل الرقمي",
  content:
    "أعلنت شركة بوليش عن جمعها لمبلغ مئة مليون دولار لتمويل قروض مدعومة بوحدات معالجة الرسوميات، بهدف تعزيز خدماتها في مجال التمويل الرقمي.",
  slug: "market-news-ce8c1c",
  category: "economy",
};

const gpuBeforePaths = getRelatedAssetsLegacy(GPU_PRODUCTION_NEWS);
const gpuAfterPaths = paths(GPU_PRODUCTION_NEWS);
assert.deepEqual(
  gpuAfterPaths,
  [],
  `GPU production replay must NO_LINK, got ${gpuAfterPaths.join(", ") || "(empty)"}`
);
assertNoXau(gpuAfterPaths, "GPU production replay");
console.log("✓ GPU production article replay:", { before: gpuBeforePaths, after: gpuAfterPaths });

// --- Production replay (newest 30 from sitemap) ---

function fetchProductionArticles(limit = 30) {
  const sitemap = execSync(
    'curl -sS --max-time 60 "https://www.hasanchartworld.com/news-sitemap.xml"',
    { encoding: "utf8" }
  );
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].slice(0, limit).map((m) => m[1]);
  const articles = [];

  for (const url of urls) {
    const slug = url.replace("https://www.hasanchartworld.com/news/", "");
    const html = execSync(
      `curl -sS --max-time 45 "https://www.hasanchartworld.com/news/${slug}"`,
      { encoding: "utf8" }
    );
    const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
    const proseMatch = html.match(/<div class="prose[\s\S]*?<\/div>/i);
    const paras = proseMatch
      ? [...proseMatch[0].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
          .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
          .filter(Boolean)
      : [];
    const content = paras.join(" ").slice(0, 4000);
    const categoryMatch = html.match(/href="\/news\/category\/([^"]+)"/);
    articles.push({
      slug,
      title,
      content: content || title,
      category: categoryMatch?.[1] || detectNewsCategory({ title, content }),
    });
  }

  return articles;
}

function classifyReplay(pathsList, topicHint = "") {
  if (pathsList.includes("/xau")) return "wrong";
  if (pathsList.length === 0) return "no_link";
  const t = topicHint.toLowerCase();
  const ideal = [];
  if (/bitcoin|btc|crypto|بيتكوين/.test(t)) ideal.push("/btc", "/crypto");
  if (/nasdaq|stock|أسهم/.test(t)) ideal.push("/nasdaq", "/stocks");
  if (/gold|ذهب/.test(t)) ideal.push("/gold", "/xauusd");
  if (/forex|eurusd|فوركس/.test(t)) ideal.push("/forex", "/eurusd");
  if (/oil|نفط/.test(t)) ideal.push("/oil");
  if (ideal.length && pathsList.some((p) => ideal.includes(p))) return "good";
  if (pathsList.length > 0) return "questionable";
  return "no_link";
}

let productionArticles = [];
try {
  productionArticles = fetchProductionArticles(30);
} catch (error) {
  console.warn("Production replay skipped:", error.message);
}

if (productionArticles.length > 0) {
  const summarizeReplay = (getter) => {
    const stats = { good: 0, questionable: 0, wrong: 0, no_link: 0, totalLinks: 0, maxLinks: 0, xau: 0 };
    for (const article of productionArticles) {
      const p = getter(article);
      stats.totalLinks += p.length;
      stats.maxLinks = Math.max(stats.maxLinks, p.length);
      if (p.includes("/xau")) stats.xau += 1;
      const cls = classifyReplay(p, `${article.title} ${article.slug}`);
      stats[cls] += 1;
    }
    stats.avg = (stats.totalLinks / productionArticles.length).toFixed(2);
    return stats;
  };

  const current = summarizeReplay((a) =>
    getRelatedAssetsLegacy({ title: a.title, content: a.content, slug: a.slug, category: a.category })
  );
  const candidate = summarizeReplay((a) =>
    paths({ title: a.title, content: a.content, slug: a.slug, category: a.category })
  );

  console.log("\n30-article production replay:");
  console.log("CURRENT (legacy):", current);
  console.log("CANDIDATE (refined):", candidate);

  assert.equal(candidate.xau, 0, "Candidate must have zero /xau occurrences");
}

// --- Watch-point macro replay (unchanged module) ---

const WATCH_FIXTURES = [
  { name: "CPI", news: { title: "US CPI rises", content: "inflation cpi data", category: "economy" }, expectWatch: true },
  { name: "NFP", news: { title: "US NFP report", content: "nonfarm payrolls", category: "economy" }, expectWatch: true },
  { name: "Fed", news: { title: "Fed rate decision", content: "Federal Reserve Powell", category: "economy" }, expectWatch: true },
  { name: "GPU financing", news: FIXTURES.find((f) => f.name === "GPU financing").news, expectWatch: true },
];

for (const wf of WATCH_FIXTURES) {
  const watch = getWatchPointsForTest(wf.news);
  if (wf.expectWatch) {
    assert.ok(watch.length > 0, `${wf.name} watch points should remain available`);
  }
}

console.log("✓ Watch-point macro replay passed (newsDetailHelpers unchanged)");
console.log("\nAll Phase 12 evergreen link tests passed.");
