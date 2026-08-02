const { GRADE_THRESHOLDS, MAX_CONFIDENCE } = require("./constants");
const { clamp } = require("./utils");
const { applyConfidenceCaps } = require("./confidence-caps");

function buildEvidence({ structure, liquidity, zones, market, dataQuality, newsRisk }) {
  const evidence = [];

  evidence.push({
    type: "BOS",
    status: structure.bos.detected ? "confirmed" : "absent",
    label: "كسر الهيكل",
    description: structure.bos.detected
      ? `BOS ${structure.bos.direction} عند ${structure.bos.level}`
      : "لا يوجد BOS مؤكد بالإغلاق",
    weight: structure.bos.detected ? 0.9 : 0,
  });

  evidence.push({
    type: "CHOCH",
    status: structure.choch.detected ? "confirmed" : "absent",
    label: "تغير السلوك",
    description: structure.choch.detected
      ? `CHOCH ${structure.choch.direction}`
      : "لا يوجد CHOCH مؤكد",
    weight: structure.choch.detected ? 0.75 : 0,
  });

  evidence.push({
    type: "LIQUIDITY_SWEEP",
    status: liquidity.sweeps.length ? "confirmed" : "absent",
    label: "سحب السيولة",
    description: liquidity.sweeps.length
      ? liquidity.sweeps[0].label
      : "لا يوجد sweep مؤكد",
    weight: liquidity.sweeps.length ? 0.7 : 0,
  });

  evidence.push({
    type: "ORDER_BLOCK",
    status: zones.orderBlocks.some((ob) => ob.confirmed && ob.status === "fresh")
      ? "partial"
      : zones.orderBlocks.some((ob) => ob.status === "fresh")
        ? "partial"
        : zones.orderBlocks.length
          ? "partial"
          : "absent",
    label: "منطقة Order Block",
    description: zones.orderBlocks[0]?.label || "لا يوجد Order Block محتمل",
    weight: zones.orderBlocks.some((ob) => ob.confirmed) ? 0.55 : zones.orderBlocks[0]?.score || 0,
  });

  const activeFvgs = (zones.fairValueGaps || []).filter((g) => g.status === "active" || g.status === "partially_filled");
  evidence.push({
    type: "FVG",
    status: activeFvgs.length ? "confirmed" : (zones.fairValueGaps || []).length ? "partial" : "absent",
    label: "فجوة القيمة العادلة",
    description: activeFvgs.length ? `${activeFvgs.length} FVG نشط` : "لا يوجد FVG نشط",
    weight: activeFvgs.length ? 0.55 : 0,
  });

  evidence.push({
    type: "HTF_TREND",
    status:
      market.alignment === "aligned"
        ? "confirmed"
        : market.alignment === "conflicting"
          ? "conflicting"
          : "partial",
    label: "توافق الأطر",
    description: `HTF: ${market.higherTimeframeTrend}, Execution: ${market.trend}, Alignment: ${market.alignment}`,
    weight: market.alignment === "aligned" ? 0.85 : market.alignment === "conflicting" ? -0.5 : 0.35,
  });

  evidence.push({
    type: "VOLATILITY",
    status: market.volatility === "extreme" ? "conflicting" : "confirmed",
    label: "التقلب",
    description: `التقلب: ${market.volatility}`,
    weight: market.volatility === "extreme" ? -0.4 : 0.2,
  });

  evidence.push({
    type: "ZONE",
    status: structure.premiumDiscount !== "equilibrium" ? "partial" : "absent",
    label: "بريميوم / ديسكونت",
    description: structure.premiumDiscount,
    weight: structure.premiumDiscount === "discount" || structure.premiumDiscount === "premium" ? 0.45 : 0.1,
  });

  if (newsRisk.status === "high") {
    evidence.push({
      type: "NEWS",
      status: "conflicting",
      label: "مخاطر الأخبار",
      description: newsRisk.message || "حدث اقتصادي عالي التأثير قريب",
      weight: -0.9,
    });
  }

  if (dataQuality !== "good") {
    evidence.push({
      type: "DATA",
      status: "partial",
      label: "جودة البيانات",
      description: `جودة البيانات: ${dataQuality}`,
      weight: -0.35,
    });
  }

  return evidence;
}

function scoreOpportunity({ evidence, market, newsRisk, dataQuality, dataFreshnessSeconds, tradePlan, structure }) {
  let score = 48;
  for (const item of evidence) {
    score += (item.weight || 0) * 12;
  }

  if (market.alignment === "conflicting") score -= 14;
  if (dataQuality === "degraded") score -= 8;
  if (dataQuality === "insufficient") score -= 20;
  if (newsRisk.status === "high") score -= 22;
  if (newsRisk.status === "caution") score -= 10;
  if (tradePlan.isActionable) score += 6;

  score = clamp(score, 0, 100);

  let confidence = clamp(Math.round(score * 0.92), 0, MAX_CONFIDENCE);
  if (market.alignment === "conflicting") confidence = Math.min(confidence, 62);
  if (dataQuality !== "good") confidence = Math.min(confidence, 58);
  if (newsRisk.status === "high") confidence = Math.min(confidence, 45);

  const grade = GRADE_THRESHOLDS.find((g) => score >= g.min)?.grade || "D";

  let state = "wait";
  let direction = "neutral";
  let riskLevel = market.volatility === "extreme" ? "extreme" : market.volatility === "high" ? "high" : "medium";

  if (newsRisk.status === "high") {
    state = "avoid";
  } else if (tradePlan.isActionable && score >= 58 && confidence >= 52) {
    state = "actionable";
    direction = market.trend === "bullish" ? "long" : market.trend === "bearish" ? "short" : "neutral";
    if (direction === "neutral") state = "wait";
  } else if (score < 45 || dataQuality === "insufficient") {
    state = "avoid";
    riskLevel = "high";
  }

  const capped = applyConfidenceCaps({
    confidence,
    grade,
    state,
    market,
    structure: structure || {},
    newsRisk,
    dataQuality,
    dataFreshnessSeconds,
    evidence,
  });

  if (capped.state !== "actionable") {
    direction = capped.state === "avoid" ? "neutral" : direction === "neutral" ? "neutral" : direction;
  }

  return {
    state: capped.state,
    direction: capped.state === "actionable" ? direction : "neutral",
    opportunityGrade: capped.opportunityGrade,
    confidence: capped.confidence,
    riskLevel,
    trendStrength: market.trendStrength,
    score,
  };
}

function buildDecisionReasons({
  state,
  evidence,
  market,
  structure,
  newsRisk,
  dataQuality,
  dataFreshnessSeconds,
  tradePlan,
  validationErrors = null,
}) {
  if (Array.isArray(validationErrors) && validationErrors.length) {
    return {
      primaryReason: "لم تكتمل صلاحية الخطة بعد التحقق النهائي",
      waitReason: `لم تكتمل صلاحية الخطة: ${validationErrors.join("، ")}`,
    };
  }

  if (state === "actionable") {
    const topEvidence = (evidence || [])
      .filter((item) => item.status === "confirmed" && (item.weight || 0) >= 0.5)
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];

    return {
      primaryReason: topEvidence
        ? `${topEvidence.label}: ${topEvidence.description}`
        : "توافق فني مقبول مع خطة مخاطرة صالحة",
      waitReason: null,
    };
  }

  if (state === "avoid") {
    if (newsRisk?.status === "high") {
      const message = newsRisk.message || "حدث اقتصادي عالي التأثير قريب";
      return {
        primaryReason: message,
        waitReason: `${message} — تجنب الدخول حتى يمر الحدث`,
      };
    }

    if (dataQuality === "insufficient") {
      return {
        primaryReason: "جودة البيانات غير كافية للتحليل",
        waitReason: "بيانات الشموع غير كافية أو غير موثوقة — تجنب الدخول",
      };
    }

    return {
      primaryReason: "ظروف السوق أو المخاطر لا تسمح بإعداد دخول",
      waitReason: "جودة البيانات أو المخاطر الحالية لا تسمح بإعداد دخول",
    };
  }

  let waitReason;

  if (market?.alignment === "conflicting") {
    waitReason = "تعارض بين اتجاه الإطار التنفيذي والأطر الأعلى — انتظر توافقاً أو تأكيد BOS";
  } else if (!structure?.bos?.detected) {
    waitReason = "لا يوجد BOS مؤكد بالإغلاق — انتظر كسر هيكل واضح";
  } else if (String(tradePlan?.trigger || "").includes("Risk/Reward")) {
    waitReason = "العائد للمخاطرة غير كافٍ — انتظر إعداداً بـ RR أفضل";
  } else if (Number.isFinite(dataFreshnessSeconds) && dataFreshnessSeconds > 45 * 60) {
    waitReason = "بيانات السوق قديمة — انتظر تحديثاً أحدث قبل أي قرار";
  } else if (market?.volatility === "extreme") {
    waitReason = "تقلب شديد في السوق — انتظر استقراراً قبل الدخول";
  } else if (newsRisk?.status === "caution") {
    waitReason = newsRisk.message || "مخاطر أخبار محتملة — انتظر حتى يتضح المشهد";
  } else if (dataQuality === "degraded") {
    waitReason = "جودة البيانات منخفضة — انتظر بيانات أفضل أو تأكيداً إضافياً";
  } else if (!tradePlan?.isActionable) {
    waitReason = "شروط الدخول غير مكتملة — انتظر إعادة اختبار منطقة الهيكل";
  } else {
    waitReason = "انتظر BOS/CHOCH أو إعادة اختبار منطقة الهيكل مع تحسن جودة البيانات";
  }

  return {
    primaryReason: "السوق يحتاج تأكيداً إضافياً قبل الدخول",
    waitReason,
  };
}

module.exports = {
  buildEvidence,
  scoreOpportunity,
  buildDecisionReasons,
};
