const {
  buildEditorialPromptBundle,
  resolveProductionImageProviderTarget,
  resolveEmergencyImageProvider,
} = require("./editorial-intelligence");
const { resolveOpenAIImageSettings } = require("./openai-image-settings");

function buildOpenAIImagePrompt(context = {}) {
  const bundle = buildEditorialPromptBundle(context);
  if (!bundle.validation.ok) {
    throw new Error(`Editorial prompt validation failed: ${bundle.validation.issues.join(", ")}`);
  }

  return {
    prompt: bundle.prompt,
    visualCategory: bundle.visualCategory,
    eventKey: bundle.profile.canonicalEventKey,
    releaseSeed: bundle.releaseSeed,
    seed: bundle.seed,
    displayTitle: bundle.displayTitle,
    overlayPlacement: bundle.overlayPlacement,
    titlePlacement: bundle.composition.titlePlacement,
    editorialProfile: bundle.profile,
    editorialSpec: bundle.spec,
    editorialValidation: bundle.validation,
  };
}

function assertPromptSafety(prompt) {
  const bundle = buildEditorialPromptBundle({ eventKey: "US_FED_RATE_DECISION", eventName: "Fed Rate Decision", releaseTime: "2026-09-17T18:00:00.000Z" });
  void bundle;
  const issues = [];
  if (!/absolutely no text|no text/i.test(prompt) || !/no logos/i.test(prompt)) {
    issues.push("missing_no_text_or_logos_directive");
  }
  if (/Bloomberg|Reuters|CNBC|Previous|Forecast|Actual|Hasan|Chart World/i.test(prompt)) {
    issues.push("forbidden_term");
  }
  if (/\b\d+(?:\.\d+)?%/.test(prompt)) {
    issues.push("contains_percentage_number");
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  buildOpenAIImagePrompt,
  assertPromptSafety,
  resolveOpenAIImageSettings,
  resolveProductionImageProviderTarget,
  resolveEmergencyImageProvider,
};
