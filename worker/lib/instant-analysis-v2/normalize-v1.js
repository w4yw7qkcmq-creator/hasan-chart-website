/**
 * Maps v2 enterprise result to legacy v1 shape for backward-compatible UI paths.
 */
function normalizeV2ToV1Legacy(v2) {
  if (!v2 || v2.version !== "2.0") return v2;

  const plan = v2.tradePlan || {};
  const entryMid = plan.entryZone ? (plan.entryZone.from + plan.entryZone.to) / 2 : null;

  return {
    success: true,
    version: "2.0",
    legacy: true,
    symbol: v2.symbol,
    trend: v2.market?.trend,
    direction: v2.decision?.direction === "long" ? "bullish" : v2.decision?.direction === "short" ? "bearish" : "neutral",
    marketBias: v2.market?.trend,
    currentPrice: v2.market?.currentPrice,
    summary: v2.explanation?.executiveSummary,
    smartMoney: v2.explanation?.institutionalView,
    classic: v2.explanation?.classicTechnicalView,
    risk: v2.explanation?.riskWarning,
    entry: plan.isActionable ? entryMid : null,
    stopLoss: plan.isActionable ? plan.stopLoss : null,
    target1: plan.targets?.[0]?.price || null,
    target2: plan.targets?.[1]?.price || null,
    confidence: v2.decision?.confidence,
    support: v2.structure?.swingLow,
    resistance: v2.structure?.swingHigh,
    signals: (v2.evidence || []).map((e) => `${e.label}: ${e.description}`),
    scenario: v2.scenarios?.primary?.title,
    bos: v2.structure?.bos?.detected ? `BOS ${v2.structure.bos.direction}` : "بانتظار BOS",
    choch: v2.structure?.choch?.detected ? `CHOCH ${v2.structure.choch.direction}` : "راقب CHOCH",
    premiumZone: v2.structure?.premiumDiscount === "premium",
    discountZone: v2.structure?.premiumDiscount === "discount",
    chartData: v2.chart?.candles || [],
    chartImage: v2.chart?.image || null,
    generatedAt: v2.generatedAt,
    analysis: [
      v2.explanation?.executiveSummary,
      v2.explanation?.institutionalView,
      v2.explanation?.classicTechnicalView,
      ...(v2.explanation?.whyThisDecision || []),
    ]
      .filter(Boolean)
      .join("\n\n"),
    v2,
  };
}

function isInstantAnalysisV2Result(result) {
  return Boolean(result && result.version === "2.0");
}

module.exports = {
  normalizeV2ToV1Legacy,
  isInstantAnalysisV2Result,
};
