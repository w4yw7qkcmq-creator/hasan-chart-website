#!/usr/bin/env node

const path = require("path");

const root = path.join(__dirname, "..");

const {
  evaluateGeneralNewsMarketRelevance,
  evaluateRssDuplicate,
  buildRssDuplicateKey,
  evaluateItemFreshness,
  processGeneralRssItems,
  resetRssObservationStateForTests,
  initializeRssFeedBaselines,
  isRssItemAfterBaseline,
  RSS_FEED_DELAY_GRACE_MINUTES,
} = require(path.join(root, "lib/general-rss"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  resetRssObservationStateForTests();
  const now = Date.now();

  const gold = evaluateGeneralNewsMarketRelevance({
    title: "Gold slips 1.2% as dollar rebounds from six-week lows",
    contentSnippet: "Gold prices fell after the dollar strengthened in forex markets.",
  });
  assert(gold.eligible === true, "gold medium should be accepted");

  const oilGeo = evaluateGeneralNewsMarketRelevance({
    title: "Oil prices jump 3% as Hormuz shipping tensions escalate",
    contentSnippet: "Brent crude rallied on geopolitical risk premium in energy markets.",
  });
  assert(oilGeo.eligible === true, "oil geopolitical price story should be accepted");

  const crypto = evaluateGeneralNewsMarketRelevance({
    title: "Bitcoin falls below $63,000 after $125M crypto liquidations",
    contentSnippet: "Crypto markets sold off with heavy futures liquidations.",
  });
  assert(crypto.eligible === true, "crypto move should be accepted");

  const earnings = evaluateGeneralNewsMarketRelevance({
    title: "Nvidia beats earnings estimates and raises revenue guidance",
    contentSnippet: "Shares moved in after-hours trading following quarterly results.",
  });
  assert(earnings.eligible === true, "large-cap earnings should be accepted");

  const politics = evaluateGeneralNewsMarketRelevance({
    title: "Local mayor announces new park renovation plan",
    contentSnippet: "City officials discussed community infrastructure without market impact.",
  });
  assert(politics.eligible === false, "political story without market angle should be rejected");

  const lifestyle = evaluateGeneralNewsMarketRelevance({
    title: "Thousands gather for WorldPride festival in Amsterdam",
    contentSnippet: "Celebrations continued after a recent security incident in Berlin.",
  });
  assert(lifestyle.eligible === false, "lifestyle story should be rejected");

  const macbook = evaluateGeneralNewsMarketRelevance({
    title: "How Apple's cheap MacBook Neo sparked a war in budget laptops",
    contentSnippet: "Apple's new consumer laptop targets budget buyers.",
  });
  assert(macbook.eligible === false, "apple product lifestyle should be rejected");
  assert(macbook.rejectionReason === "product_lifestyle_or_non_financial", "macbook reason");

  const appleEarnings = evaluateGeneralNewsMarketRelevance({
    title: "Apple beats earnings estimates and raises revenue guidance",
    contentSnippet: "Shares moved in after-hours trading following quarterly results.",
  });
  assert(appleEarnings.eligible === true, "apple earnings should be accepted");

  const goldmanOpinion = evaluateGeneralNewsMarketRelevance({
    title: "Goldman traders are on pace for a record year. A close-up look at how they're doing it",
    contentSnippet: "Trading desks at Goldman Sachs are having a strong year.",
  });
  assert(goldmanOpinion.eligible === false, "goldman profile/opinion should be rejected");

  const structured = evaluateGeneralNewsMarketRelevance({
    title: "US CPI",
    contentSnippet: "Previous: 0.3%\nForecast: 0.2%\nActual: 0.4%",
  });
  assert(structured.eligible === false, "structured economic RSS should be rejected");

  const breaking100 = evaluateItemFreshness(
    {
      title: "Breaking: Oil prices surge after Gulf tensions escalate",
      isoDate: new Date(now - 100 * 60 * 1000).toISOString(),
      fetchedAt: now,
    },
    now
  );
  assert(breaking100.fresh === true, "breaking at 100 minutes should be accepted");

  const breaking160 = evaluateItemFreshness(
    {
      title: "Breaking: Oil prices surge after Gulf tensions escalate",
      isoDate: new Date(now - 160 * 60 * 1000).toISOString(),
      fetchedAt: now,
    },
    now
  );
  assert(breaking160.fresh === false, "breaking at 160 minutes should be rejected");

  const market210 = evaluateItemFreshness(
    {
      title: "Gold prices fall 1.5% as dollar rebounds in forex markets",
      isoDate: new Date(now - 210 * 60 * 1000).toISOString(),
      fetchedAt: now,
    },
    now
  );
  assert(market210.fresh === true, "market move at 3.5 hours should be accepted");

  const market300 = evaluateItemFreshness(
    {
      title: "Gold prices fall 1.5% as dollar rebounds in forex markets",
      isoDate: new Date(now - 300 * 60 * 1000).toISOString(),
      fetchedAt: now,
    },
    now
  );
  assert(market300.fresh === false, "market move at 5 hours should be rejected");

  const earnings10h = evaluateItemFreshness(
    {
      title: "Amazon beats earnings estimates and raises revenue guidance",
      isoDate: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
      fetchedAt: now,
    },
    now
  );
  assert(earnings10h.fresh === true, "earnings at 10 hours should be accepted");

  const graceItem = evaluateItemFreshness(
    {
      title: "Breaking: Oil prices surge after Gulf tensions escalate",
      isoDate: new Date(now - 125 * 60 * 1000).toISOString(),
      fetchedAt: now,
    },
    now
  );
  assert(graceItem.fresh === true, "breaking within grace window should be accepted");
  assert(graceItem.graceApplied === true, "grace should be applied");

  const oldBacklog = evaluateItemFreshness(
    {
      title: "Gold prices fall 1.5% as dollar rebounds in forex markets",
      isoDate: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
      fetchedAt: now - 9 * 60 * 60 * 1000,
    },
    now
  );
  assert(oldBacklog.fresh === false, "old backlog should stay rejected despite grace");

  const crossA = {
    title: "Oil prices surge after tankers come under fire near Oman",
    link: "https://www.cnbc.com/a",
    isoDate: new Date().toISOString(),
    sourceName: "CNBC",
  };
  const crossB = {
    title: "Oil prices surge after tankers come under fire near Oman - MarketWatch",
    link: "https://www.marketwatch.com/b",
    isoDate: new Date().toISOString(),
    sourceName: "MarketWatch",
  };
  assert(evaluateRssDuplicate(crossB, [crossA], [crossA.title]).duplicate === true, "cross-source duplicate");

  assert(
    buildRssDuplicateKey({
      title: "Trump warns Iran over missile deployments in Gulf region",
    }) !== buildRssDuplicateKey({
      title: "Oil jumps 2% on Middle East supply risk after Gulf tensions",
    }),
    "iran tension and oil reaction should differ"
  );

  const baselineItems = [
    {
      title: "Existing newest",
      link: "https://example.com/1",
      isoDate: new Date(now - 30 * 60 * 1000).toISOString(),
      feedUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    },
  ];
  initializeRssFeedBaselines(baselineItems);
  assert(isRssItemAfterBaseline(baselineItems[0]) === false, "baseline item should not republish");

  const burstPipeline = processGeneralRssItems(
    [
      {
        title: "Dollar index rises as Treasury yields climb in forex markets",
        contentSnippet: "The dollar strengthened in forex markets.",
        isoDate: new Date(now).toISOString(),
        fetchedAt: now,
        feedUrl: "https://www.forexlive.com/feed/",
        sourceName: "ForexLive",
      },
      {
        title: "Nasdaq futures fall on tech selloff in US stocks",
        contentSnippet: "US stocks faced pressure in premarket trading.",
        isoDate: new Date(now - 2 * 60 * 1000).toISOString(),
        fetchedAt: now,
        feedUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
        sourceName: "CNBC",
      },
    ],
    {
      dryRun: true,
      skipObservationInit: true,
      skipBacklogCheck: true,
      publishedItems: [],
      publishStats: { postsLastHour: 0 },
      nowMs: now,
    }
  );
  const streaming = evaluateGeneralNewsMarketRelevance({
    title: "Here's what's worth streaming in August 2026 on Netflix, Hulu, HBO Max and more",
    contentSnippet: "Entertainment picks for the month ahead.",
  });
  assert(streaming.eligible === false, "streaming entertainment should be rejected");

  const assetOnly = evaluateGeneralNewsMarketRelevance({
    title: "Why every tech giant wants to look like Apple now",
    contentSnippet: "Apple remains a cultural benchmark for consumer technology brands.",
  });
  assert(assetOnly.eligible === false, "asset mention without investment reflection should be rejected");

  const politicsNoMarket = evaluateGeneralNewsMarketRelevance({
    title: "Trump appeals order that slammed his IRS lawsuit and referred his lawyer to bar",
    contentSnippet: "Legal proceedings continued without market developments.",
  });
  assert(politicsNoMarket.eligible === false, "politics without market impact should be rejected");

  assert(burstPipeline.diagnostics.wouldPublish === 1, "one publish candidate per cycle");

  for (const item of burstPipeline.eligibleItems) {
    assert(item.impactLevel === "HIGH" || item.impactLevel === "MEDIUM", "eligible must be HIGH or MEDIUM");
    assert(Boolean(item.marketAngle), "eligible must have market angle");
  }

  assert(RSS_FEED_DELAY_GRACE_MINUTES === 30, "grace minutes constant");

  assert(!("premiumImageEligible" in gold), "publish path independent from premium images");

  console.log("general-rss tests passed");
}

run();
