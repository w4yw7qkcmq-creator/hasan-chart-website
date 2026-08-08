const RUNTIME_MODES = {
  PRODUCTION: "production",
  TEST: "test",
  DEVELOPMENT: "development",
};

function resolveNewsIntelligenceRuntimeMode(options = {}) {
  if (options.runtimeMode) {
    return options.runtimeMode;
  }
  if (process.env.NEWS_INTELLIGENCE_RUNTIME_MODE === "test") {
    return RUNTIME_MODES.TEST;
  }
  if (
    process.env.NODE_ENV === "production" ||
    process.env.RAILWAY_ENVIRONMENT === "production" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return RUNTIME_MODES.PRODUCTION;
  }
  return RUNTIME_MODES.DEVELOPMENT;
}

function isProductionRuntime(options = {}) {
  return resolveNewsIntelligenceRuntimeMode(options) === RUNTIME_MODES.PRODUCTION;
}

function isTestRuntime(options = {}) {
  return resolveNewsIntelligenceRuntimeMode(options) === RUNTIME_MODES.TEST;
}

function allowMemoryIdempotencyFallback(options = {}) {
  return isTestRuntime(options) || process.env.NEWS_INTELLIGENCE_ALLOW_MEMORY_IDEMPOTENCY === "1";
}

module.exports = {
  RUNTIME_MODES,
  resolveNewsIntelligenceRuntimeMode,
  isProductionRuntime,
  isTestRuntime,
  allowMemoryIdempotencyFallback,
};
