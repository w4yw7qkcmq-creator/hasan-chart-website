const MAX_ALERT_PRICE = 1_000_000_000;
const MIN_ALERT_PRICE = Number.MIN_VALUE;

const REASON = Object.freeze({
  INVALID_TARGET: "invalid_target",
  INVALID_CURRENT: "invalid_current",
  NOT_MET: "not_met",
  MET: "met",
  STALE_PRICE: "stale_price",
  MISSING_PRICE: "missing_price",
});

function normalizeCondition(value) {
  return String(value || "above").trim().toLowerCase() === "below" ? "below" : "above";
}

function normalizeTargetPrice(value) {
  const target = Number(value);
  if (!Number.isFinite(target) || target <= 0 || target > MAX_ALERT_PRICE) {
    return { ok: false, reason: REASON.INVALID_TARGET, value: null };
  }
  return { ok: true, value: target };
}

function normalizeCurrentPrice(value) {
  const current = Number(value);
  if (!Number.isFinite(current) || current <= 0) {
    return { ok: false, reason: REASON.INVALID_CURRENT, value: null };
  }
  return { ok: true, value: current };
}

function evaluatePriceAlertCondition({ condition, targetPrice, currentPrice }) {
  const normalizedCondition = normalizeCondition(condition);
  const target = normalizeTargetPrice(targetPrice);
  if (!target.ok) {
    return { triggered: false, reason: target.reason, condition: normalizedCondition };
  }

  const current = normalizeCurrentPrice(currentPrice);
  if (!current.ok) {
    return { triggered: false, reason: current.reason, condition: normalizedCondition };
  }

  const met =
    normalizedCondition === "below"
      ? current.value <= target.value
      : current.value >= target.value;

  return {
    triggered: met,
    reason: met ? REASON.MET : REASON.NOT_MET,
    condition: normalizedCondition,
    targetPrice: target.value,
    currentPrice: current.value,
  };
}

function validateTargetPriceAtCreation(targetPrice) {
  return normalizeTargetPrice(targetPrice);
}

module.exports = {
  REASON,
  MAX_ALERT_PRICE,
  normalizeCondition,
  normalizeTargetPrice,
  normalizeCurrentPrice,
  evaluatePriceAlertCondition,
  validateTargetPriceAtCreation,
};
