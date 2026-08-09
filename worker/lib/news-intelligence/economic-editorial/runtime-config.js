function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT === "production";
}

function isPhase2EditorialEnabled(options = {}) {
  if (options.skipPhase2Editorial === true) {
    return false;
  }
  if (options.enablePhase2Editorial === true) {
    return true;
  }
  return process.env.NEWS_PHASE2_EDITORIAL === "1";
}

function isPhase2AiEnabled(options = {}) {
  if (options.forcePhase2Ai === true) {
    return Boolean(options.openAiClient);
  }
  if (options.enablePhase2Ai === true) {
    return Boolean(options.openAiClient);
  }
  return false;
}

function getPhase2RuntimeConfig(options = {}) {
  const editorialEnabled = isPhase2EditorialEnabled(options);
  const aiEnabled = editorialEnabled && isPhase2AiEnabled(options);
  return {
    phase2Editorial: editorialEnabled,
    phase2Ai: aiEnabled,
    productionRuntime: isProductionRuntime(),
    envFlag: process.env.NEWS_PHASE2_EDITORIAL || null,
  };
}

module.exports = {
  isProductionRuntime,
  isPhase2EditorialEnabled,
  isPhase2AiEnabled,
  getPhase2RuntimeConfig,
};
