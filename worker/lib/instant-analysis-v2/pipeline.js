const { INSTANT_ANALYSIS_V2_VERSION, TIMEFRAMES } = require("./constants");
const { fetchMultiTimeframeCandles, buildMarketDataSnapshot } = require("./market-data");
const { detectSwingPoints } = require("./swing-points");
const { computeAtr, computeEma, classifyVolatility, computeTrendFromStructure, computeTrendStrength, computeMomentum } = require("./indicators");
const { analyzeTimeframeStructure } = require("./market-structure");
const { analyzeLiquidity } = require("./liquidity");
const { detectFairValueGaps, selectDisplayFairValueGaps } = require("./fvg");
const { detectOrderBlocks } = require("./order-blocks");
const { computePremiumDiscount, buildSupplyDemandZones } = require("./zones");
const { buildEvidence, scoreOpportunity, buildDecisionReasons } = require("./scoring");
const { buildTradePlan, buildRiskManagement } = require("./trade-plan");
const { buildScenarios } = require("./scenarios");
const { assessNewsRisk } = require("./news-risk");
const { enrichWithOpenAiExplanation } = require("./explanation");
const { buildChartPayload } = require("./chart-renderer");
const { validateInstantAnalysisV2, applyValidationFallback } = require("./validator");
const { logInstantAnalysisV2 } = require("./logger");

function classifyMarketState(volatility, alignment) {
  if (volatility === "extreme") return "volatile";
  if (alignment === "conflicting") return "transition";
  if (volatility === "low") return "ranging";
  return "trending";
}

function computeAlignment(executionTrend, htfTrend) {
  if (executionTrend === "neutral" || htfTrend === "neutral") return "mixed";
  if (executionTrend === htfTrend) return "aligned";
  return "conflicting";
}

function analyzeSingleTimeframe(candles) {
  const swings = detectSwingPoints(candles);
  const atr = computeAtr(candles);
  const closes = candles.map((c) => c.close);
  const emaFast = computeEma(closes.slice(-20), 9);
  const emaSlow = computeEma(closes.slice(-40), 21);
  const trend = computeTrendFromStructure({
    swings,
    emaFast,
    emaSlow,
    lastClose: closes[closes.length - 1],
  });
  const structure = analyzeTimeframeStructure({ candles, swings, atr });

  return { swings, atr, trend, structure, momentum: computeMomentum(candles) };
}

async function runInstantAnalysisV2({
  symbol,
  analysisId,
  fetchCandles,
  fetchPrice,
  openaiApiKey,
  fetchUpcomingEvents = null,
}) {
  const startedAt = Date.now();
  const timings = { marketDataMs: 0, technicalEngineMs: 0, openAiMs: 0, chartRenderMs: 0, totalMs: 0 };

  logInstantAnalysisV2("INSTANT_ANALYSIS_V2_STARTED", { analysisId, symbol });

  const marketDataStarted = Date.now();
  const timeframeResults = await fetchMultiTimeframeCandles({
    symbol,
    timeframes: TIMEFRAMES,
    fetchCandles,
  });
  timings.marketDataMs = Date.now() - marketDataStarted;

  logInstantAnalysisV2("MARKET_DATA_FETCHED", {
    analysisId,
    symbol,
    quality: Object.fromEntries(Object.entries(timeframeResults).map(([k, v]) => [k, v.quality])),
    marketDataMs: timings.marketDataMs,
  });

  const technicalStarted = Date.now();
  const execution = timeframeResults["15m"];
  const structureTf = timeframeResults["1h"];
  const htf = timeframeResults["4h"];

  if (!execution?.candles?.length || execution.quality === "insufficient") {
    logInstantAnalysisV2("MARKET_DATA_INVALID", { analysisId, symbol, reason: "INSUFFICIENT_15M" });
    throw new Error("INSUFFICIENT_MARKET_DATA");
  }

  const execAnalysis = analyzeSingleTimeframe(execution.candles);
  const structAnalysis = structureTf?.candles?.length >= 40 ? analyzeSingleTimeframe(structureTf.candles) : null;
  const htfAnalysis = htf?.candles?.length >= 40 ? analyzeSingleTimeframe(htf.candles) : null;

  const currentPrice = execution.candles[execution.candles.length - 1]?.close;
  if (!Number.isFinite(currentPrice)) {
    if (typeof fetchPrice === "function") {
      const tickerPrice = await fetchPrice(symbol);
      if (!Number.isFinite(tickerPrice)) throw new Error("INVALID_CURRENT_PRICE");
    } else {
      throw new Error("INVALID_CURRENT_PRICE");
    }
  }

  const resolvedPrice = Number.isFinite(currentPrice)
    ? currentPrice
    : await fetchPrice(symbol);

  const executionTrend = execAnalysis.trend;
  const htfTrend = htfAnalysis?.trend || structAnalysis?.trend || "neutral";
  const alignment = computeAlignment(executionTrend, htfTrend);
  const volatility = classifyVolatility(execAnalysis.atr, resolvedPrice);

  const premiumDiscount = computePremiumDiscount({
    swingHigh: execAnalysis.structure.swingHigh,
    swingLow: execAnalysis.structure.swingLow,
    currentPrice: resolvedPrice,
  });

  const liquidity = analyzeLiquidity({
    candles: execution.candles,
    swings: execAnalysis.swings,
    atr: execAnalysis.atr,
    currentPrice: resolvedPrice,
  });

  const allFvgs = detectFairValueGaps(execution.candles, execAnalysis.atr);
  const fairValueGaps = selectDisplayFairValueGaps(allFvgs, resolvedPrice);
  const directionForOb = execAnalysis.structure.bos.direction || executionTrend;
  const orderBlocks = detectOrderBlocks({
    candles: execution.candles,
    bos: execAnalysis.structure.bos,
    direction: directionForOb,
    atr: execAnalysis.atr,
  });

  const zones = buildSupplyDemandZones({
    swings: execAnalysis.swings,
    orderBlocks,
    direction: directionForOb,
  });
  zones.fairValueGaps = fairValueGaps;

  const data = buildMarketDataSnapshot({ symbol, timeframeResults, source: "okx" });

  const market = {
    currentPrice: resolvedPrice,
    marketState: classifyMarketState(volatility, alignment),
    volatility,
    trend: executionTrend,
    trendStrength: computeTrendStrength(executionTrend, execAnalysis.structure.bos.detected ? 2 : 0, alignment),
    higherTimeframeTrend: htfTrend,
    alignment,
  };

  const structure = {
    bos: execAnalysis.structure.bos,
    choch: execAnalysis.structure.choch,
    swingHigh: execAnalysis.structure.swingHigh,
    swingLow: execAnalysis.structure.swingLow,
    premiumDiscount: premiumDiscount.premiumDiscount,
    equilibrium: premiumDiscount.equilibrium,
  };

  timings.technicalEngineMs = Date.now() - technicalStarted;

  logInstantAnalysisV2("STRUCTURE_ANALYSIS_COMPLETED", {
    analysisId,
    symbol,
    bos: structure.bos.detected,
    choch: structure.choch.detected,
    technicalEngineMs: timings.technicalEngineMs,
  });

  const newsRisk = await assessNewsRisk({ symbol, fetchUpcomingEvents });

  const evidenceBase = buildEvidence({
    structure,
    liquidity,
    zones,
    market,
    dataQuality: data.quality,
    newsRisk,
  });

  let decision = scoreOpportunity({
    evidence: evidenceBase,
    market,
    newsRisk,
    dataQuality: data.quality,
    dataFreshnessSeconds: data.freshnessSeconds,
    tradePlan: { isActionable: false },
    structure,
  });

  let tradePlan = buildTradePlan({
    direction: decision.direction,
    currentPrice: resolvedPrice,
    atr: execAnalysis.atr,
    structure,
    liquidity,
    zones,
    state: decision.state,
  });

  decision = scoreOpportunity({
    evidence: evidenceBase,
    market,
    newsRisk,
    dataQuality: data.quality,
    dataFreshnessSeconds: data.freshnessSeconds,
    tradePlan,
    structure,
  });

  if (decision.state !== "actionable") {
    tradePlan = buildTradePlan({
      direction: decision.direction,
      currentPrice: resolvedPrice,
      atr: execAnalysis.atr,
      structure,
      liquidity,
      zones,
      state: decision.state,
    });
  }

  logInstantAnalysisV2("TRADE_PLAN_VALIDATED", { analysisId, symbol, actionable: tradePlan.isActionable });

  const scenarios = buildScenarios({ decision, tradePlan, structure, market });
  const riskManagement = buildRiskManagement({
    opportunityGrade: decision.opportunityGrade,
    isActionable: tradePlan.isActionable,
  });

  let result = {
    version: INSTANT_ANALYSIS_V2_VERSION,
    analysisId: analysisId || `ia_${Date.now()}`,
    symbol,
    generatedAt: new Date().toISOString(),
    data,
    market,
    structure,
    liquidity,
    zones: {
      demand: zones.demand,
      supply: zones.supply,
      orderBlocks: zones.orderBlocks,
      fairValueGaps,
    },
    decision,
    tradePlan,
    scenarios,
    evidence: evidenceBase,
    newsRisk,
    riskManagement,
    explanation: null,
    chart: null,
    validation: null,
    meta: {
      openaiModel: process.env.INSTANT_ANALYSIS_OPENAI_MODEL || "gpt-4o-mini",
      timings,
    },
  };

  const openAiStarted = Date.now();
  const explanationResult = await enrichWithOpenAiExplanation({ result, openaiApiKey });
  timings.openAiMs = Date.now() - openAiStarted;

  result.explanation = explanationResult.explanation;
  result.meta.explanationSource = explanationResult.source;
  result.meta.tokenUsage = explanationResult.tokenUsage;

  if (explanationResult.source === "openai") {
    logInstantAnalysisV2("OPENAI_EXPLANATION_COMPLETED", { analysisId, symbol, openAiMs: timings.openAiMs });
  } else {
    logInstantAnalysisV2("OPENAI_EXPLANATION_FALLBACK", { analysisId, symbol, source: explanationResult.source, openAiMs: timings.openAiMs });
  }

  const validation = validateInstantAnalysisV2(result);
  if (!validation.passed) {
    logInstantAnalysisV2("ANALYSIS_V2_VALIDATION_FAILED", { analysisId, symbol, errors: validation.errors });
    result = applyValidationFallback(result, validation);
  } else {
    result.validation = { passed: true, warnings: validation.warnings, errors: [] };
  }

  const decisionReasons = buildDecisionReasons({
    state: result.decision.state,
    evidence: evidenceBase,
    market: result.market,
    structure: result.structure,
    newsRisk: result.newsRisk,
    dataQuality: result.data.quality,
    dataFreshnessSeconds: result.data.freshnessSeconds,
    tradePlan: result.tradePlan,
    validationErrors: result.validation?.passed === false ? result.validation.errors : null,
  });
  result.decision = { ...result.decision, ...decisionReasons };

  const chartStarted = Date.now();
  result.chart = buildChartPayload(result, execution.candles);
  timings.chartRenderMs = Date.now() - chartStarted;

  timings.totalMs = Date.now() - startedAt;
  result.meta.timings = timings;
  result.meta.durationMs = timings.totalMs;

  logInstantAnalysisV2("INSTANT_ANALYSIS_V2_COMPLETED", {
    analysisId,
    symbol,
    state: result.decision.state,
    grade: result.decision.opportunityGrade,
    durationMs: timings.totalMs,
    timings,
  });

  return result;
}

module.exports = {
  runInstantAnalysisV2,
  analyzeSingleTimeframe,
};
