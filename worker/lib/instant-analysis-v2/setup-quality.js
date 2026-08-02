const { MIN_RR_TP1 } = require("./constants");

function computeSetupQuality({
  structure,
  liquidity,
  zones,
  market,
  tradePlan,
  decision,
}) {
  const factors = [];
  let score = 0;

  if (structure?.bos?.detected) {
    score += 18;
    factors.push({ key: "bos", label: "كسر الهيكل", points: 18, status: "ok" });
  } else {
    factors.push({ key: "bos", label: "كسر الهيكل", points: 0, status: "missing" });
  }

  if (structure?.choch?.detected) {
    score += 10;
    factors.push({ key: "choch", label: "تغير السلوك", points: 10, status: "ok" });
  } else {
    factors.push({ key: "choch", label: "تغير السلوك", points: 0, status: "missing" });
  }

  const hasLiquidity = (liquidity?.sweeps?.length || 0) > 0 ||
    (liquidity?.buySideLiquidity?.length || 0) > 0 ||
    (liquidity?.sellSideLiquidity?.length || 0) > 0;
  if (hasLiquidity) {
    score += 12;
    factors.push({ key: "liquidity", label: "السيولة", points: 12, status: "ok" });
  } else {
    factors.push({ key: "liquidity", label: "السيولة", points: 0, status: "weak" });
  }

  if (market?.alignment === "aligned") {
    score += 16;
    factors.push({ key: "htf", label: "توافق الأطر", points: 16, status: "ok" });
  } else if (market?.alignment === "mixed") {
    score += 8;
    factors.push({ key: "htf", label: "توافق الأطر", points: 8, status: "partial" });
  } else {
    factors.push({ key: "htf", label: "توافق الأطر", points: 0, status: "conflict" });
  }

  const rr = tradePlan?.riskReward?.toTp1 || 0;
  if (tradePlan?.isActionable && rr >= MIN_RR_TP1) {
    score += 14;
    factors.push({ key: "rr", label: "العائد للمخاطرة", points: 14, status: "ok" });
  } else if (rr > 0) {
    score += 5;
    factors.push({ key: "rr", label: "العائد للمخاطرة", points: 5, status: "weak" });
  } else {
    factors.push({ key: "rr", label: "العائد للمخاطرة", points: 0, status: "missing" });
  }

  const activeFvgs = (zones?.fairValueGaps || []).filter(
    (g) => g.status === "active" || g.status === "partially_filled"
  );
  if (activeFvgs.length) {
    score += 10;
    factors.push({ key: "fvg", label: "فجوة القيمة العادلة", points: 10, status: "ok" });
  } else {
    factors.push({ key: "fvg", label: "فجوة القيمة العادلة", points: 0, status: "missing" });
  }

  const freshOb = (zones?.orderBlocks || []).some((ob) => ob.status === "fresh");
  if (freshOb) {
    score += 10;
    factors.push({ key: "ob", label: "Order Block", points: 10, status: "ok" });
  } else if ((zones?.orderBlocks || []).length) {
    score += 4;
    factors.push({ key: "ob", label: "Order Block", points: 4, status: "weak" });
  } else {
    factors.push({ key: "ob", label: "Order Block", points: 0, status: "missing" });
  }

  if (market?.volatility === "extreme") {
    score -= 8;
    factors.push({ key: "volatility", label: "التقلب", points: -8, status: "high" });
  } else if (market?.volatility === "high") {
    score -= 3;
    factors.push({ key: "volatility", label: "التقلب", points: -3, status: "partial" });
  } else {
    score += 5;
    factors.push({ key: "volatility", label: "التقلب", points: 5, status: "ok" });
  }

  score = Math.max(0, Math.min(100, score));

  let grade = "D";
  if (score >= 90) grade = "A+";
  else if (score >= 80) grade = "A";
  else if (score >= 70) grade = "B+";
  else if (score >= 58) grade = "B";
  else if (score >= 45) grade = "C";

  if (decision?.opportunityGrade && decision.opportunityGrade !== grade) {
    grade = decision.opportunityGrade;
  }

  return {
    grade,
    score,
    maxScore: 100,
    factors,
  };
}

module.exports = {
  computeSetupQuality,
};
