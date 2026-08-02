function isFiniteNumber(value) {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function validateInstantAnalysisV2(result) {
  const warnings = [];
  const errors = [];

  if (!result || result.version !== "2.0") {
    errors.push("INVALID_VERSION");
    return { passed: false, warnings, errors };
  }

  if (!result.symbol) errors.push("MISSING_SYMBOL");
  if (!isFiniteNumber(result.market?.currentPrice) || result.market.currentPrice <= 0) {
    errors.push("INVALID_CURRENT_PRICE");
  }

  const confidence = result.decision?.confidence;
  if (!isFiniteNumber(confidence) || confidence < 0 || confidence > 100) {
    errors.push("INVALID_CONFIDENCE");
  }

  const trendStrength = result.market?.trendStrength;
  if (!isFiniteNumber(trendStrength) || trendStrength < 0 || trendStrength > 10) {
    errors.push("INVALID_TREND_STRENGTH");
  }

  const probSum =
    Number(result.scenarios?.primary?.probability || 0) +
    Number(result.scenarios?.alternative?.probability || 0);
  if (Math.abs(probSum - 100) > 5) warnings.push("SCENARIO_PROBABILITY_DRIFT");

  const plan = result.tradePlan || {};
  const decision = result.decision || {};

  if (decision.state === "wait" || decision.state === "avoid") {
    if (plan.isActionable) errors.push("ACTIONABLE_WHILE_NON_ACTIONABLE_STATE");
  }

  if (plan.isActionable) {
    const dir = decision.direction;
    const entryMid = plan.entryZone
      ? (plan.entryZone.from + plan.entryZone.to) / 2
      : null;

    if (!isFiniteNumber(plan.stopLoss)) errors.push("MISSING_STOP");
    if (!Array.isArray(plan.targets) || plan.targets.length < 1) errors.push("MISSING_TARGETS");

    if (dir === "long" && isFiniteNumber(entryMid) && isFiniteNumber(plan.stopLoss)) {
      if (plan.stopLoss >= entryMid) errors.push("LONG_STOP_ABOVE_ENTRY");
      for (const tp of plan.targets) {
        if (tp.price <= entryMid) errors.push("LONG_TARGET_BELOW_ENTRY");
      }
    }

    if (dir === "short" && isFiniteNumber(entryMid) && isFiniteNumber(plan.stopLoss)) {
      if (plan.stopLoss <= entryMid) errors.push("SHORT_STOP_BELOW_ENTRY");
      for (const tp of plan.targets) {
        if (tp.price >= entryMid) errors.push("SHORT_TARGET_ABOVE_ENTRY");
      }
    }

    for (let i = 1; i < plan.targets.length; i += 1) {
      if (dir === "long" && plan.targets[i].price <= plan.targets[i - 1].price) {
        errors.push("INVALID_TARGET_ORDER");
      }
      if (dir === "short" && plan.targets[i].price >= plan.targets[i - 1].price) {
        errors.push("INVALID_TARGET_ORDER");
      }
    }
  }

  const walk = (obj) => {
    if (typeof obj === "number" && !isFiniteNumber(obj)) errors.push("NON_FINITE_NUMBER");
    if (Array.isArray(obj)) obj.forEach(walk);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(walk);
  };
  walk(result);

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

function applyValidationFallback(result, validation) {
  if (validation.passed) {
    return { ...result, validation: { passed: true, warnings: validation.warnings, errors: [] } };
  }

  const safe = { ...result };
  safe.decision = {
    ...safe.decision,
    state: "wait",
    direction: "neutral",
  };
  safe.tradePlan = {
    isActionable: false,
    entryType: "none",
    entryZone: null,
    trigger: null,
    stopLoss: null,
    targets: [],
    invalidation: null,
    riskReward: null,
  };
  safe.validation = {
    passed: false,
    warnings: validation.warnings,
    errors: validation.errors,
  };
  return safe;
}

module.exports = {
  validateInstantAnalysisV2,
  applyValidationFallback,
};
