const { MIN_RR_TP1 } = require("./constants");
const { roundPrice, clamp } = require("./utils");

function buildTradePlan({
  direction,
  currentPrice,
  atr,
  structure,
  liquidity,
  zones,
  state,
}) {
  if (state !== "actionable" || direction === "neutral") {
    return {
      isActionable: false,
      entryType: "none",
      entryZone: null,
      trigger: null,
      stopLoss: null,
      targets: [],
      invalidation: null,
      riskReward: null,
    };
  }

  const isLong = direction === "long";
  const ob = zones.orderBlocks.find((z) => z.direction === (isLong ? "bullish" : "bearish") && z.status !== "invalidated");
  const buffer = Math.max(atr * 0.35, currentPrice * 0.001);

  let entryFrom;
  let entryTo;

  if (ob) {
    entryFrom = ob.from;
    entryTo = ob.to;
  } else if (isLong) {
    entryFrom = roundPrice(currentPrice - buffer * 1.2);
    entryTo = roundPrice(currentPrice - buffer * 0.2);
  } else {
    entryFrom = roundPrice(currentPrice + buffer * 0.2);
    entryTo = roundPrice(currentPrice + buffer * 1.2);
  }

  const entryMid = (entryFrom + entryTo) / 2;

  const stopLoss = isLong
    ? roundPrice(Math.min(structure.swingLow ?? entryFrom, entryFrom) - buffer)
    : roundPrice(Math.max(structure.swingHigh ?? entryTo, entryTo) + buffer);

  const risk = Math.abs(entryMid - stopLoss);
  if (!Number.isFinite(risk) || risk <= 0) {
    return {
      isActionable: false,
      entryType: "none",
      entryZone: null,
      trigger: null,
      stopLoss: null,
      targets: [],
      invalidation: null,
      riskReward: null,
    };
  }

  const liquidityTargets = isLong
    ? [...liquidity.buySideLiquidity.map((l) => l.price), structure.swingHigh].filter(Number.isFinite)
    : [...liquidity.sellSideLiquidity.map((l) => l.price), structure.swingLow].filter(Number.isFinite);

  const sortedTargets = (isLong
    ? liquidityTargets.filter((p) => p > entryMid).sort((a, b) => a - b)
    : liquidityTargets.filter((p) => p < entryMid).sort((a, b) => b - a))
    .slice(0, 3);

  while (sortedTargets.length < 3) {
    const mult = [1.5, 2.4, 3.6][sortedTargets.length];
    sortedTargets.push(roundPrice(isLong ? entryMid + risk * mult : entryMid - risk * mult));
  }

  const targets = sortedTargets.map((price, index) => ({
    label: `TP${index + 1}`,
    price: roundPrice(price),
    rr: roundPrice(Math.abs(price - entryMid) / risk, 2),
  }));

  const rrTp1 = targets[0]?.rr || 0;
  if (rrTp1 < MIN_RR_TP1) {
    return {
      isActionable: false,
      entryType: "none",
      entryZone: null,
      trigger: "Risk/Reward غير كافٍ للدخول",
      stopLoss: null,
      targets: [],
      invalidation: null,
      riskReward: null,
    };
  }

  if (isLong && (stopLoss >= entryFrom || targets.some((t) => t.price <= entryTo))) {
    return { isActionable: false, entryType: "none", entryZone: null, trigger: null, stopLoss: null, targets: [], invalidation: null, riskReward: null };
  }

  if (!isLong && (stopLoss <= entryTo || targets.some((t) => t.price >= entryFrom))) {
    return { isActionable: false, entryType: "none", entryZone: null, trigger: null, stopLoss: null, targets: [], invalidation: null, riskReward: null };
  }

  return {
    isActionable: true,
    entryType: "limit",
    entryZone: { from: roundPrice(entryFrom), to: roundPrice(entryTo) },
    trigger: isLong ? "إغلاق إعادة اختبار منطقة الطلب مع تأكيد BOS" : "إغلاق إعادة اختبار منطقة العرض مع تأكيد BOS",
    stopLoss,
    targets,
    invalidation: {
      price: stopLoss,
      condition: isLong ? "إغلاق تحت Stop Loss / كسر الهيكل الصاعد" : "إغلاق فوق Stop Loss / كسر الهيكل الهابط",
    },
    riskReward: {
      toTp1: targets[0]?.rr || 0,
      toTp2: targets[1]?.rr || 0,
      toTp3: targets[2]?.rr || 0,
    },
  };
}

function buildRiskManagement({ opportunityGrade, isActionable }) {
  const gradeToRisk = {
    "A+": 0.75,
    A: 0.6,
    "B+": 0.5,
    B: 0.35,
    C: 0,
    D: 0,
  };

  const suggested = isActionable ? gradeToRisk[opportunityGrade] ?? 0.25 : 0;

  return {
    suggestedRiskPercent: suggested,
    maxRiskPercent: 1,
    positionSizingAvailable: false,
    note: isActionable
      ? "أدخل رأس المال لاحقاً لحساب حجم الصفقة. هذه النسبة تعليمية وليست نصيحة مالية شخصية."
      : "لا توجد صفقة جاهزة الآن — لا يُقترح حجم مركز.",
  };
}

module.exports = {
  buildTradePlan,
  buildRiskManagement,
};
