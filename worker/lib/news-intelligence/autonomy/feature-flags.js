function isPhase3AutonomyEnabled(options = {}) {
  if (options.enablePhase3Autonomy === true) return true;
  if (options.skipPhase3Autonomy === true) return false;
  return process.env.NEWS_PHASE3_AUTONOMY === "1";
}

function isPhase3AutoQuarantineEnabled(options = {}) {
  if (!isPhase3AutonomyEnabled(options)) return false;
  if (options.enablePhase3AutoQuarantine === true) return true;
  return process.env.NEWS_PHASE3_AUTO_QUARANTINE === "1";
}

function isPhase3DiagnosticsOnly(options = {}) {
  return !isPhase3AutonomyEnabled(options);
}

function getPhase3RuntimeConfig(options = {}) {
  return {
    phase3Autonomy: isPhase3AutonomyEnabled(options),
    phase3AutoQuarantine: isPhase3AutoQuarantineEnabled(options),
    envAutonomy: process.env.NEWS_PHASE3_AUTONOMY || null,
    envAutoQuarantine: process.env.NEWS_PHASE3_AUTO_QUARANTINE || null,
  };
}

module.exports = {
  isPhase3AutonomyEnabled,
  isPhase3AutoQuarantineEnabled,
  isPhase3DiagnosticsOnly,
  getPhase3RuntimeConfig,
};
