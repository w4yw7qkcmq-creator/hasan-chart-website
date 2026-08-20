const { readRawBackground } = require("./cache");
const premium = require("./premium-image-generator");
const policy = require("./image-policy");
const orchestrator = require("./image-orchestrator");

module.exports = {
  OUTPUT_DIR: premium.OUTPUT_DIR,
  isPremiumImagesEnabled: premium.isPremiumImagesEnabled,
  generatePremiumNewsImage: premium.generatePremiumNewsImage,
  generateDeterministicBrandedFallbackImage: premium.generateDeterministicBrandedFallbackImage,
  resolvePremiumNewsImagePath: premium.resolvePremiumNewsImagePath,
  inspectAndMaybeRejectOpenAiBackground: premium.inspectAndMaybeRejectOpenAiBackground,
  readRawBackground,
  resolveNewsImagePolicy: policy.resolveNewsImagePolicy,
  assertRssNeverUsesAi: policy.assertRssNeverUsesAi,
  resolvePublicationImageResult: orchestrator.resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests: orchestrator.resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests: orchestrator.getOpenAiImageCallCountForTests,
};
