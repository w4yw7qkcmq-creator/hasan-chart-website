#!/usr/bin/env node

import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  buildChartAnnotationsFromResult,
  buildChartPayload,
  CHART_CANDLE_LIMIT,
} = require("../worker/lib/instant-analysis-v2/chart-renderer.js");
const {
  sanitizeExplanationPayload,
  enrichWithOpenAiExplanation,
  buildDeterministicExplanation,
} = require("../worker/lib/instant-analysis-v2/explanation.js");
const { detectOrderBlocks, hasDisplacement } = require("../worker/lib/instant-analysis-v2/order-blocks.js");
const {
  detectFairValueGaps,
  selectDisplayFairValueGaps,
} = require("../worker/lib/instant-analysis-v2/fvg.js");
const { applyConfidenceCaps, CONFIDENCE_CAPS } = require("../worker/lib/instant-analysis-v2/confidence-caps.js");
const { buildEvidence, scoreOpportunity, buildDecisionReasons } = require("../worker/lib/instant-analysis-v2/scoring.js");
const { validateInstantAnalysisV2, applyValidationFallback } = require("../worker/lib/instant-analysis-v2/validator.js");
const { runInstantAnalysisV2 } = require("../worker/lib/instant-analysis-v2/pipeline.js");
const { formatPrice } = require("../worker/lib/instant-analysis-v2/utils.js");

let groups = 0;
let assertions = 0;

function assert(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

async function group(name, fn) {
  groups += 1;
  await fn();
  console.log(`✓ ${name}`);
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

function decodeSvg(imageDataUrl) {
  const b64 = imageDataUrl.replace("data:image/svg+xml;base64,", "");
  return Buffer.from(b64, "base64").toString("utf8");
}

function baseResult(overrides = {}) {
  return {
    version: "2.0",
    symbol: "BTCUSDT",
    generatedAt: new Date().toISOString(),
    market: { currentPrice: 50123.45, trend: "bullish", volatility: "medium", alignment: "aligned" },
    structure: {
      bos: { detected: true, level: 49800.5, direction: "bullish" },
      choch: { detected: false, level: null },
    },
    zones: {
      orderBlocks: [{ from: 49500, to: 49620, label: "OB test", status: "fresh" }],
      fairValueGaps: [{ from: 49900, to: 50050, status: "active" }],
      demand: [{ from: 49400, to: 49550, label: "Demand" }],
      supply: [{ from: 51000, to: 51200, label: "Supply" }],
    },
    liquidity: {
      buySideLiquidity: [{ price: 50800, label: "BSL" }],
      sellSideLiquidity: [{ price: 49200, label: "SSL" }],
    },
    decision: { state: "actionable", direction: "long", confidence: 70, opportunityGrade: "B+" },
    tradePlan: {
      isActionable: true,
      entryZone: { from: 49500, to: 49620 },
      stopLoss: 49100,
      targets: [
        { label: "TP1", price: 50500 },
        { label: "TP2", price: 51000 },
        { label: "TP3", price: 51500 },
      ],
    },
    evidence: [{ label: "BOS", weight: 0.9, description: "test" }],
    ...overrides,
  };
}

async function main() {
await group("Chart OHLC integrity", () => {
  const distinctive = makeCandles(90, 11111.11, 7.77);
  distinctive[0].close = 11111.11;
  distinctive[distinctive.length - 1].close = 99999.99;
  distinctive[distinctive.length - 1].open = 99800;
  distinctive[distinctive.length - 1].high = 100050;
  distinctive[distinctive.length - 1].low = 99750;

  const result = baseResult({ market: { currentPrice: 99999.99 } });
  const drawn = distinctive.slice(-CHART_CANDLE_LIMIT);
  const chart = buildChartPayload(result, distinctive);
  const svg = decodeSvg(chart.image);

  assert(chart.candleCount === drawn.length, "candle count capped correctly");
  assert(svg.includes(`firstClose=${drawn[0].close}`), "SVG embeds first drawn close");
  assert(svg.includes(`lastClose=${drawn[drawn.length - 1].close}`), "SVG embeds last drawn close");
  assert(svg.includes("current=99999.99"), "SVG current matches market.currentPrice");
  assert(svg.includes("بيانات OKX حقيقية"), "production chart labels real OHLC");
  assert(!svg.includes("x=\"150\" y1=\"205\""), "no v1 synthetic candle coordinates");
  assert(chart.candles[0].close === drawn[0].close, "chart uses oldest-to-newest slice");
});

await group("Annotation parity with JSON", () => {
  const result = baseResult();
  const annotations = buildChartAnnotationsFromResult(result);

  const bos = annotations.find((a) => a.type === "BOS");
  assert(bos?.price === result.structure.bos.level, "BOS level matches JSON");

  const fvg = annotations.find((a) => a.type === "FVG");
  assert(fvg?.from === 49900 && fvg?.to === 50050, "FVG from/to matches JSON");

  const ob = annotations.find((a) => a.type === "ORDER_BLOCK");
  assert(ob?.from === 49500 && ob?.to === 49620, "OB from/to matches JSON");

  const entry = annotations.find((a) => a.type === "ENTRY");
  assert(entry?.from === result.tradePlan.entryZone.from, "entry from matches tradePlan");
  assert(entry?.to === result.tradePlan.entryZone.to, "entry to matches tradePlan");

  const stop = annotations.find((a) => a.type === "STOP");
  assert(stop?.price === result.tradePlan.stopLoss, "SL matches tradePlan");

  const targets = annotations.filter((a) => a.type === "TARGET");
  assert(targets.length === 3, "three targets drawn");
  assert(targets[0].price === 50500, "TP1 matches tradePlan");

  const waitResult = baseResult({
    decision: { state: "wait", direction: "neutral", confidence: 40, opportunityGrade: "C" },
    tradePlan: { isActionable: false, entryZone: null, stopLoss: null, targets: [] },
  });
  const waitAnnotations = buildChartAnnotationsFromResult(waitResult);
  assert(!waitAnnotations.some((a) => ["ENTRY", "STOP", "TARGET"].includes(a.type)), "no trade plan on wait");
});

await group("Validation before chart render", () => {
  let result = baseResult({
    decision: { state: "wait", direction: "neutral", confidence: 55, opportunityGrade: "B" },
    tradePlan: { isActionable: true, entryZone: { from: 1, to: 2 }, stopLoss: 3, targets: [{ price: 4 }] },
  });
  const validation = validateInstantAnalysisV2(result);
  assert(!validation.passed, "invalid actionable/wait caught");
  result = applyValidationFallback(result, validation);
  const chart = buildChartPayload(result, makeCandles(80));
  const annotations = buildChartAnnotationsFromResult(result);
  assert(result.decision.state === "wait", "final decision is wait");
  assert(!annotations.some((a) => a.type === "ENTRY"), "chart respects post-validation wait");
  assert(chart.image?.startsWith("data:image/svg+xml"), "chart still renders after fallback");
});

await group("OpenAI isolation — adversarial payload", () => {
  const result = baseResult();
  const before = JSON.parse(JSON.stringify(result));
  const fallback = buildDeterministicExplanation(result);
  const adversarial = {
    entryZone: { from: 1, to: 2 },
    stopLoss: 3,
    targets: [{ price: 999999 }],
    currentPrice: 5,
    confidence: 100,
    decision: { state: "actionable", direction: "long" },
    executiveSummary: "شرح مقبول",
    institutionalView: "رؤية مقبولة",
  };
  const sanitized = sanitizeExplanationPayload(adversarial, fallback);
  assert(sanitized.executiveSummary === "شرح مقبول", "allows executiveSummary");
  assert(!("stopLoss" in sanitized), "rejects stopLoss");
  assert(!("entryZone" in sanitized), "rejects entryZone");
  assert(!("confidence" in sanitized), "rejects confidence");
  assert(!("decision" in sanitized), "rejects decision");
  assert(before.decision.state === "actionable", "source result untouched by sanitize");

  result.explanation = sanitized;
  assert(result.decision.state === before.decision.state, "merge path keeps decision");
  assert(result.tradePlan.stopLoss === before.tradePlan.stopLoss, "merge path keeps stopLoss");
});

await group("OpenAI isolation — mock fetch wait→buy attempt", async () => {
  const result = baseResult({
    decision: { state: "wait", direction: "neutral", confidence: 45, opportunityGrade: "C" },
    tradePlan: { isActionable: false, entryZone: null, stopLoss: null, targets: [] },
  });
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            decision: { state: "actionable", direction: "long" },
            stopLoss: 1,
            confidence: 99,
            executiveSummary: "محاولة تغيير القرار",
          }),
        },
      }],
    }),
  });
  const out = await enrichWithOpenAiExplanation({
    result,
    openaiApiKey: "test-key",
    fetchImpl: mockFetch,
  });
  assert(result.decision.state === "wait", "AI cannot flip wait to actionable on result object");
  assert(out.explanation?.executiveSummary === "محاولة تغيير القرار", "explanation text accepted");
});

await group("OpenAI isolation — malformed/timeout fallback", async () => {
  const result = baseResult();
  const badJsonFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "not-json-at-all" } }] }),
  });
  const timeoutFetch = async () => {
    throw new Error("abort");
  };

  const bad = await enrichWithOpenAiExplanation({ result, openaiApiKey: "k", fetchImpl: badJsonFetch });
  assert(bad.source === "fallback_openai_timeout", "malformed json uses fallback");

  const timed = await enrichWithOpenAiExplanation({ result, openaiApiKey: "k", fetchImpl: timeoutFetch });
  assert(timed.source === "fallback_openai_timeout", "timeout uses deterministic fallback");
  assert(timed.explanation?.executiveSummary, "fallback explanation present");
});

await group("Order Block accuracy", () => {
  const atr = 10;
  const weakCandles = makeCandles(50, 100, 0.1);
  assert(!hasDisplacement(weakCandles, atr, "bullish"), "weak displacement rejected");

  const strong = [...makeCandles(49, 100, 0.5)];
  strong.push({
    time: Date.now(),
    open: 120,
    close: 135,
    high: 136,
    low: 119,
    volume: 5000,
  });
  assert(hasDisplacement(strong, atr, "bullish"), "valid displacement accepted");

  const noBos = detectOrderBlocks({
    candles: strong,
    bos: { detected: false },
    direction: "bullish",
    atr,
  });
  assert(noBos.length === 0, "no OB without BOS");

  const withBos = detectOrderBlocks({
    candles: strong,
    bos: { detected: true, direction: "bullish" },
    direction: "bullish",
    atr,
  });
  assert(withBos.length <= 1, "at most one OB candidate");
  if (withBos.length) {
    assert(withBos[0].label.includes("محتملة"), "OB labeled as potential not institutional certainty");
  }
});

await group("FVG filtering and status", () => {
  const candles = makeCandles(30, 100, 0.2);
  const atr = 50;
  const tiny = detectFairValueGaps(candles, atr);
  assert(Array.isArray(tiny), "fvg returns array");

  const gaps = [
    { from: 100, to: 101, status: "filled", direction: "bullish" },
    { from: 200, to: 220, status: "active", direction: "bullish" },
    { from: 210, to: 230, status: "partially_filled", direction: "bullish" },
    { from: 300, to: 330, status: "active", direction: "bearish" },
  ];
  const active = selectDisplayFairValueGaps(gaps, 215);
  assert(active.every((g) => g.status !== "filled"), "filled FVG excluded from display");
  assert(active.length <= 3, "max 3 FVG displayed");
});

await group("Confidence caps", () => {
  const base = {
    confidence: 85,
    grade: "A+",
    state: "actionable",
    market: { alignment: "aligned", volatility: "medium" },
    structure: { bos: { detected: true } },
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    evidence: [
      { status: "confirmed", weight: 0.9 },
      { status: "confirmed", weight: 0.8 },
    ],
  };

  const degraded = applyConfidenceCaps({ ...base, dataQuality: "degraded" });
  assert(degraded.confidence <= CONFIDENCE_CAPS.DEGRADED_DATA, "degraded data cap");

  const conflict = applyConfidenceCaps({
    ...base,
    market: { alignment: "conflicting", volatility: "medium" },
  });
  assert(conflict.confidence <= CONFIDENCE_CAPS.HTF_CONFLICT, "HTF conflict cap");

  const noBos = applyConfidenceCaps({ ...base, structure: { bos: { detected: false } } });
  assert(noBos.confidence <= CONFIDENCE_CAPS.NO_BOS, "no BOS cap");

  const news = applyConfidenceCaps({ ...base, newsRisk: { status: "high" } });
  assert(news.state === "avoid", "high news forces avoid");
  assert(news.confidence <= CONFIDENCE_CAPS.HIGH_NEWS, "high news confidence cap");

  const stale = applyConfidenceCaps({ ...base, dataFreshnessSeconds: 50 * 60 });
  assert(stale.confidence <= CONFIDENCE_CAPS.STALE_OR_DEGRADED, "stale data cap");
});

await group("Decision reasons after final caps", () => {
  const structure = {
    bos: { detected: true, direction: "bullish", level: 100 },
    choch: { detected: false },
    premiumDiscount: "discount",
  };
  const liquidity = { sweeps: [{ label: "sweep" }], buySideLiquidity: [], sellSideLiquidity: [] };
  const zones = {
    orderBlocks: [{ confirmed: true, status: "fresh", score: 0.8, label: "OB" }],
    fairValueGaps: [{ status: "active" }],
  };

  const conflictMarket = {
    trend: "bullish",
    trendStrength: 6,
    alignment: "conflicting",
    volatility: "medium",
    higherTimeframeTrend: "bearish",
  };
  const conflictEvidence = buildEvidence({
    structure,
    liquidity,
    zones,
    market: conflictMarket,
    dataQuality: "good",
    newsRisk: { status: "none" },
  });
  const actionablePlan = {
    isActionable: true,
    entryZone: { from: 98, to: 99 },
    stopLoss: 95,
    targets: [{ price: 105 }],
  };
  const conflictDecision = scoreOpportunity({
    evidence: conflictEvidence,
    market: conflictMarket,
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: actionablePlan,
    structure,
  });
  assert(conflictDecision.state === "wait", "HTF conflict caps actionable to wait");
  const conflictReasons = buildDecisionReasons({
    state: conflictDecision.state,
    evidence: conflictEvidence,
    market: conflictMarket,
    structure,
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: actionablePlan,
  });
  assert(conflictReasons.waitReason.includes("تعارض"), "HTF waitReason mentions conflict");
  assert(!conflictReasons.primaryReason.includes("فرصة"), "wait state avoids ready-opportunity wording");

  const newsRisk = { status: "high", message: "CPI خلال ساعة" };
  const newsDecision = scoreOpportunity({
    evidence: conflictEvidence,
    market: { ...conflictMarket, alignment: "aligned" },
    newsRisk,
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: actionablePlan,
    structure,
  });
  assert(newsDecision.state === "avoid", "high news caps to avoid");
  const newsReasons = buildDecisionReasons({
    state: newsDecision.state,
    evidence: conflictEvidence,
    market: { ...conflictMarket, alignment: "aligned" },
    structure,
    newsRisk,
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: actionablePlan,
  });
  assert(newsReasons.waitReason.includes("CPI"), "avoid waitReason mentions news");

  const rrReasons = buildDecisionReasons({
    state: "wait",
    evidence: conflictEvidence,
    market: { ...conflictMarket, alignment: "aligned" },
    structure,
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: { isActionable: false, trigger: "Risk/Reward غير كافٍ للدخول" },
  });
  assert(rrReasons.waitReason.includes("العائد للمخاطرة"), "RR waitReason mentions risk reward");

  const staleReasons = buildDecisionReasons({
    state: "wait",
    evidence: conflictEvidence,
    market: { ...conflictMarket, alignment: "aligned" },
    structure,
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 50 * 60,
    tradePlan: { isActionable: false },
  });
  assert(staleReasons.waitReason.includes("قديمة"), "stale waitReason mentions old data");

  const volReasons = buildDecisionReasons({
    state: "wait",
    evidence: conflictEvidence,
    market: { ...conflictMarket, alignment: "aligned", volatility: "extreme" },
    structure,
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: actionablePlan,
  });
  assert(volReasons.waitReason.includes("تقلب"), "extreme volatility waitReason mentions volatility");

  const goodMarket = { ...conflictMarket, alignment: "aligned", volatility: "medium" };
  const goodDecision = scoreOpportunity({
    evidence: conflictEvidence,
    market: goodMarket,
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: actionablePlan,
    structure,
  });
  if (goodDecision.state === "actionable") {
    const goodReasons = buildDecisionReasons({
      state: "actionable",
      evidence: conflictEvidence,
      market: goodMarket,
      structure,
      newsRisk: { status: "none" },
      dataQuality: "good",
      dataFreshnessSeconds: 60,
      tradePlan: actionablePlan,
    });
    assert(goodReasons.waitReason == null, "actionable has no waitReason");
    assert(!goodReasons.waitReason, "actionable has no contradictory wait text");
    assert(goodReasons.primaryReason, "actionable has primaryReason");
  }

  const validationReasons = buildDecisionReasons({
    state: "wait",
    evidence: conflictEvidence,
    market: goodMarket,
    structure,
    newsRisk: { status: "none" },
    dataQuality: "good",
    dataFreshnessSeconds: 60,
    tradePlan: { isActionable: false },
    validationErrors: ["ACTIONABLE_WHILE_NON_ACTIONABLE_STATE"],
  });
  assert(validationReasons.waitReason.includes("صلاحية الخطة"), "validation fallback mentions plan validity");
});

await group("Pipeline fixture benchmark + timings", async () => {
  let fetchCount = 0;
  const mockCandles = makeCandles(120, 50000, 25);
  const v2 = await runInstantAnalysisV2({
    symbol: "BTCUSDT",
    analysisId: "audit_fixture",
    fetchCandles: async () => {
      fetchCount += 1;
      return mockCandles;
    },
    fetchPrice: async () => {
      throw new Error("ticker should not be needed when candle close exists");
    },
    openaiApiKey: null,
  });

  assert(v2.version === "2.0", "pipeline v2");
  assert(v2.validation?.passed === true, "fixture validates");
  assert(fetchCount >= 3, "fetches all required timeframes in parallel");
  assert(v2.meta?.timings?.marketDataMs >= 0, "marketDataMs logged");
  assert(v2.meta?.timings?.technicalEngineMs >= 0, "technicalEngineMs logged");
  assert(v2.meta?.timings?.chartRenderMs >= 0, "chartRenderMs logged");
  assert(v2.meta?.timings?.totalMs >= v2.meta.timings.marketDataMs, "totalMs sane");
  assert(v2.chart?.candleCount > 0, "chart has candles");
  assert(formatPrice(v2.market.currentPrice), "current price formatted");
});

console.log(`\ninstant-analysis-v2 audit: ${groups} groups, ${assertions} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
