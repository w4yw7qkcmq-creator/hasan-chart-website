const CONFIDENCE_CAPS = {
  MAX: 88,
  DEGRADED_DATA: 58,
  STALE_OR_DEGRADED: 58,
  HTF_CONFLICT: 62,
  NO_BOS: 68,
  HIGH_NEWS: 45,
  EXTREME_VOLATILITY: 55,
  FEW_EVIDENCE: 60,
  INSUFFICIENT_FORCE_AVOID: true,
};

const GRADE_CAPS = {
  HTF_CONFLICT_MAX: "B+",
  NO_BOS_MAX: "B",
  DEGRADED_DATA_MAX: "B",
  HIGH_NEWS_MAX: "C",
};

const GRADE_ORDER = ["A+", "A", "B+", "B", "C", "D"];

function capGrade(grade, maxGrade) {
  const gi = GRADE_ORDER.indexOf(grade);
  const mi = GRADE_ORDER.indexOf(maxGrade);
  if (gi === -1 || mi === -1) return grade;
  return GRADE_ORDER[Math.max(gi, mi)];
}

function countStrongEvidence(evidence) {
  return (evidence || []).filter((e) => e.status === "confirmed" && (e.weight || 0) >= 0.5).length;
}

function applyConfidenceCaps({
  confidence,
  grade,
  state,
  market,
  structure,
  newsRisk,
  dataQuality,
  dataFreshnessSeconds,
  evidence,
}) {
  let cappedConfidence = confidence;
  let cappedGrade = grade;
  let cappedState = state;

  if (dataQuality === "insufficient") {
    cappedState = "avoid";
    cappedConfidence = Math.min(cappedConfidence, 40);
    cappedGrade = capGrade(cappedGrade, "D");
  }

  if (dataQuality === "degraded") {
    cappedConfidence = Math.min(cappedConfidence, CONFIDENCE_CAPS.DEGRADED_DATA);
    cappedGrade = capGrade(cappedGrade, GRADE_CAPS.DEGRADED_DATA_MAX);
  }

  if (Number.isFinite(dataFreshnessSeconds) && dataFreshnessSeconds > 20 * 60) {
    cappedConfidence = Math.min(cappedConfidence, CONFIDENCE_CAPS.STALE_OR_DEGRADED);
    if (dataFreshnessSeconds > 45 * 60) cappedState = cappedState === "actionable" ? "wait" : cappedState;
  }

  if (market?.alignment === "conflicting") {
    cappedConfidence = Math.min(cappedConfidence, CONFIDENCE_CAPS.HTF_CONFLICT);
    cappedGrade = capGrade(cappedGrade, GRADE_CAPS.HTF_CONFLICT_MAX);
    if (cappedGrade === "A+" || cappedGrade === "A") cappedGrade = "B+";
    if (cappedState === "actionable") cappedState = "wait";
  }

  if (!structure?.bos?.detected) {
    cappedConfidence = Math.min(cappedConfidence, CONFIDENCE_CAPS.NO_BOS);
    cappedGrade = capGrade(cappedGrade, GRADE_CAPS.NO_BOS_MAX);
  }

  if (newsRisk?.status === "high") {
    cappedConfidence = Math.min(cappedConfidence, CONFIDENCE_CAPS.HIGH_NEWS);
    cappedGrade = capGrade(cappedGrade, GRADE_CAPS.HIGH_NEWS_MAX);
    cappedState = "avoid";
  } else if (newsRisk?.status === "caution") {
    cappedConfidence = Math.min(cappedConfidence, 55);
    if (cappedState === "actionable") cappedState = "wait";
  }

  if (market?.volatility === "extreme") {
    cappedConfidence = Math.min(cappedConfidence, CONFIDENCE_CAPS.EXTREME_VOLATILITY);
    if (cappedState === "actionable") cappedState = "wait";
  }

  if (countStrongEvidence(evidence) < 2) {
    cappedConfidence = Math.min(cappedConfidence, CONFIDENCE_CAPS.FEW_EVIDENCE);
  }

  return {
    confidence: Math.max(0, Math.min(CONFIDENCE_CAPS.MAX, cappedConfidence)),
    opportunityGrade: cappedGrade,
    state: cappedState,
  };
}

module.exports = {
  CONFIDENCE_CAPS,
  applyConfidenceCaps,
  capGrade,
};
