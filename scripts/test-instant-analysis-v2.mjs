#!/usr/bin/env node

import { createRequire } from "module";

const require = createRequire(import.meta.url);

const { sortAndDedupeCandles, assessCandleQuality } = require("../worker/lib/instant-analysis-v2/market-data.js");
const { detectSwingPoints } = require("../worker/lib/instant-analysis-v2/swing-points.js");
const { analyzeTimeframeStructure } = require("../worker/lib/instant-analysis-v2/market-structure.js");
const { detectFairValueGaps } = require("../worker/lib/instant-analysis-v2/fvg.js");
const { analyzeLiquidity } = require("../worker/lib/instant-analysis-v2/liquidity.js");
const { buildTradePlan } = require("../worker/lib/instant-analysis-v2/trade-plan.js");
const { scoreOpportunity, buildEvidence } = require("../worker/lib/instant-analysis-v2/scoring.js");
const { validateInstantAnalysisV2 } = require("../worker/lib/instant-analysis-v2/validator.js");
const { computeAtr } = require("../worker/lib/instant-analysis-v2/indicators.js");
const { runInstantAnalysisV2 } = require("../worker/lib/instant-analysis-v2/pipeline.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeCandles(count, start = 100, step = 0.5, startTime = Date.now() - count * 900000) {
  const candles = [];
  let price = start;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    const close = price + (i % 5 === 0 ? step * 3 : step);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    candles.push({
      time: startTime + i * 900000,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 10,
    });
    price = close;
  }
  return candles;
}

const unsorted = makeCandles(50);
unsorted.push({ ...unsorted[0] });
const sorted = sortAndDedupeCandles(unsorted);
assert(sorted.length === 50, "duplicate candles removed");

const badQuality = assessCandleQuality(sorted.slice(0, 10), "15m");
assert(badQuality.quality === "insufficient", "insufficient candles detected");

const candles = makeCandles(80, 100, 0.8);
const swings = detectSwingPoints(candles);
const atr = computeAtr(candles);
const structure = analyzeTimeframeStructure({ candles, swings, atr });
assert(typeof structure.bos.detected === "boolean", "bos boolean");

const fvgs = detectFairValueGaps(candles, atr);
assert(Array.isArray(fvgs), "fvg array");

const liquidity = analyzeLiquidity({
  candles,
  swings,
  atr,
  currentPrice: candles[candles.length - 1].close,
});
assert(Array.isArray(liquidity.buySideLiquidity), "liquidity pools");

const plan = buildTradePlan({
  direction: "long",
  currentPrice: 120,
  atr: 2,
  structure: { swingLow: 110, swingHigh: 130, bos: { detected: true, direction: "bullish" }, choch: { detected: false } },
  liquidity,
  zones: { orderBlocks: [{ direction: "bullish", from: 115, to: 118, status: "fresh", score: 0.8 }] },
  state: "actionable",
});

if (plan.isActionable) {
  assert(plan.stopLoss < plan.entryZone.from, "long stop below entry");
  assert(plan.targets[0].price > plan.entryZone.to, "long tp above entry");
}

const waitPlan = buildTradePlan({
  direction: "long",
  currentPrice: 120,
  atr: 2,
  structure: { swingLow: 110, swingHigh: 130 },
  liquidity,
  zones: { orderBlocks: [] },
  state: "wait",
});
assert(waitPlan.isActionable === false, "wait state has no fake trade");

const market = {
  trend: "bullish",
  trendStrength: 6,
  alignment: "conflicting",
  volatility: "high",
  higherTimeframeTrend: "bearish",
  currentPrice: 120,
  marketState: "transition",
};
const newsRisk = { status: "high", message: "CPI soon" };
const decision = scoreOpportunity({
  evidence: buildEvidence({
    structure: { bos: { detected: false }, choch: { detected: false }, premiumDiscount: "equilibrium" },
    liquidity: { sweeps: [], buySideLiquidity: [], sellSideLiquidity: [] },
    zones: { orderBlocks: [], fairValueGaps: [] },
    market,
    dataQuality: "degraded",
    newsRisk,
  }),
  market,
  newsRisk,
  dataQuality: "degraded",
  tradePlan: waitPlan,
});
assert(decision.confidence <= 62, "conflict caps confidence");
assert(decision.state === "avoid" || decision.state === "wait", "high news lowers action");

const invalid = validateInstantAnalysisV2({
  version: "2.0",
  symbol: "BTCUSDT",
  market: { currentPrice: -1, trendStrength: 99 },
  decision: { confidence: 200, state: "wait", direction: "neutral" },
  tradePlan: { isActionable: false, targets: [] },
  scenarios: { primary: { probability: 40 }, alternative: { probability: 40 } },
});
assert(!invalid.passed, "validator catches bad payload");

const mockCandles = makeCandles(100, 50000, 25);
const v2 = await runInstantAnalysisV2({
  symbol: "BTCUSDT",
  analysisId: "test_fixture",
  fetchCandles: async () => mockCandles,
  fetchPrice: async () => mockCandles[mockCandles.length - 1].close,
  openaiApiKey: null,
});

assert(v2.version === "2.0", "pipeline returns v2");
assert(v2.validation?.passed === true, "fixture validates");
assert(v2.chart?.image?.startsWith("data:image/svg+xml"), "chart generated");
assert(v2.explanation?.executiveSummary, "deterministic explanation");

console.log("instant-analysis-v2 tests passed");
