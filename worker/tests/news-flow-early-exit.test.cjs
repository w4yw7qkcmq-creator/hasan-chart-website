#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const {
  resetCheckpointStoreForTests,
  hydrateFromDb,
  bootstrapRssSource,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const { processGeneralRssItems, resetRssObservationStateForTests } = require(path.join(root, "lib/general-rss"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runEarlyExitRegression() {
  resetCheckpointStoreForTests();
  resetRssObservationStateForTests();
  hydrateFromDb(null);

  const now = Date.now();
  const economicIncomplete = {
    title: "Newsquawk week ahead: RBA announcement and US retail sales",
    link: "https://investinglive.com/news/week-ahead",
    isoDate: new Date(now).toISOString(),
    pubDate: new Date(now).toISOString(),
    feedUrl: "https://www.forexlive.com/feed/",
    sourceName: "ForexLive",
    contentSnippet: "Preview of upcoming US retail sales and RBA decision",
  };
  const geoValid = {
    title: "Oil prices jump 3% as Hormuz shipping tensions escalate",
    link: "https://example.com/oil-hormuz",
    isoDate: new Date(now - 60_000).toISOString(),
    pubDate: new Date(now - 60_000).toISOString(),
    feedUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    sourceName: "CNBC",
    contentSnippet: "Brent crude rallied on geopolitical risk premium in energy markets.",
  };
  const cryptoValid = {
    title: "Bitcoin falls below $63,000 after $125M crypto liquidations",
    link: "https://example.com/btc-liq",
    isoDate: new Date(now - 120_000).toISOString(),
    pubDate: new Date(now - 120_000).toISOString(),
    feedUrl: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    sourceName: "CoinDesk",
    contentSnippet: "Crypto markets sold off with heavy futures liquidations.",
  };

  bootstrapRssSource("ForexLive", [economicIncomplete], { nowMs: now, maxAgeHours: 24, publishedLinks: new Set() });
  bootstrapRssSource("CNBC", [geoValid], { nowMs: now, maxAgeHours: 24, publishedLinks: new Set() });
  bootstrapRssSource("CoinDesk", [cryptoValid], { nowMs: now, maxAgeHours: 24, publishedLinks: new Set() });

  const pipeline = processGeneralRssItems([economicIncomplete, geoValid, cryptoValid], {
    publishedItems: [],
    publishStats: { postsLastHour: 0 },
    dryRun: true,
    skipCheckpointAdvance: true,
    nowMs: now,
  });

  assert(pipeline.eligibleItems.length >= 2, "valid geopolitical and crypto items remain eligible after preview item");
  const titles = pipeline.eligibleItems.map((entry) => entry.title);
  assert(titles.some((title) => title.includes("Oil prices")), "geopolitical item eligible");
  assert(titles.some((title) => title.includes("Bitcoin")), "crypto item eligible");

  const previewOnly = pipeline.diagnostics.items.filter((entry) => entry.action === "RSS_ELIGIBLE");
  assert(previewOnly.length >= 2, "at least two RSS_ELIGIBLE actions recorded");
}

runEarlyExitRegression();
console.log("news-flow-early-exit.test.cjs PASS");
