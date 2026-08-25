const { GENERAL_RSS_FEEDS, RSS_FEED_DELAY_GRACE_MINUTES } = require("./constants");
const { fetchGeneralRssFeeds, createRssParser, normalizeParsedRssItem } = require("./feed-fetch");
const {
  resolveRssSourceImage,
  decodeHtmlEntities,
  normalizeExternalImageUrl: normalizeRssExternalImageUrl,
  collectRssMediaCandidates,
  resetRssSourceImageStateForTests,
} = require("./rss-source-image-resolver");
const {
  recordRssImageTelemetryEvent,
  recordRssImageResolutionOutcome,
  getRssImageTelemetrySnapshot,
  resetRssImageTelemetryForTests,
} = require("./rss-image-telemetry");
const { isGenericRssImageUrl } = require("./rss-image-generic-blocklist");
const { processGeneralRssItems } = require("./pipeline");
const { evaluateGeneralNewsMarketRelevance } = require("./market-relevance");
const { evaluateRssDuplicate, buildRssDuplicateKey, buildRssEventFingerprint } = require("./dedup");
const { evaluateItemFreshness, getFeedDelayMinutes } = require("./age-policy");
const { classifyNewsCategory } = require("./news-category");
const {
  initializeRssFeedBaselines,
  isRssObservationReady,
  isRssItemAfterBaseline,
  isRssItemNew,
  markRssItemSeen,
  bootstrapAllRssSources,
  resetRssObservationStateForTests,
  getRssObservationSnapshot,
} = require("./observation-state");
const { markEligibleRssItemProcessed } = require("./pipeline");
const {
  BLOCK_REASONS: RSS_EDITORIAL_BLOCK_REASONS,
  validateGeneralRssEditorialOutput,
  buildRawSourceText,
} = require("./editorial-safety");
const {
  buildRssPublicationPresentation,
  normalizeHeadlineComparable,
  bodyStartsWithEquivalentHeadline,
  removeLeadingHeadlineFromBody,
  removeAllEquivalentHeadlineLines,
  collapseRepeatedNormalizedPhrase,
  resolveCanonicalHeadline,
} = require("./publication-format");
const {
  reviewExternalNewsBeforePublish,
  resetExternalNewsEditorStateForTests,
  getEditorTelemetrySnapshot,
  EDITOR_REASON_CODES,
} = require("./external-news-editor");
const {
  resolveRssSourceImageWithChartPolicy,
  getChartPolicyTelemetrySnapshot,
  resetChartPolicyStateForTests,
} = require("./chart-visual-policy");
const { auditRssPostPublish } = require("./rss-post-publish-audit");
const { evaluateRssCuratorGate, CURATOR_OUTCOMES } = require("./rss-curator-gate");
const { validateRssMinimumInformation, REASON_CODES: MINIMUM_INFO_REASON_CODES } = require("./minimum-information-gate");
const {
  sealRssFinalPublicationPresentation,
  buildAndValidateFinalRssPublication,
  assertDeliveryMatchesValidatedPresentation,
} = require("./final-publication-presentation");
const { sanitizeRssDraftAiText } = require("./rss-draft-sanitize");
const {
  reviewExternalNewsInShadowMode,
  scheduleExternalNewsShadowReview,
  RSS_EDITOR_MODE,
} = require("./external-news-editor/shadow-review");
const {
  runEditorV2ShadowReview,
  scheduleEditorV2ShadowReview,
  EDITOR_V2_MODE,
} = require("./editor-v2");
const {
  getEditorV2TelemetrySnapshot,
  resetEditorV2TelemetryForTests,
} = require("./editor-v2/telemetry");
const { V2_REASON_CODES } = require("./editor-v2/reason-codes");
const {
  buildCanonicalRssEvidence,
} = require("./editor-v2/canonical-evidence");
const {
  buildStructuredFactsV2,
} = require("./editor-v2/structured-facts");
const {
  validateEditorV2FactGuard,
} = require("./editor-v2/fact-guard");

module.exports = {
  GENERAL_RSS_FEEDS,
  RSS_FEED_DELAY_GRACE_MINUTES,
  fetchGeneralRssFeeds,
  createRssParser,
  normalizeParsedRssItem,
  resolveRssSourceImage,
  decodeHtmlEntities,
  normalizeRssExternalImageUrl,
  collectRssMediaCandidates,
  resetRssSourceImageStateForTests,
  recordRssImageTelemetryEvent,
  recordRssImageResolutionOutcome,
  getRssImageTelemetrySnapshot,
  resetRssImageTelemetryForTests,
  isGenericRssImageUrl,
  processGeneralRssItems,
  evaluateGeneralNewsMarketRelevance,
  evaluateRssDuplicate,
  buildRssDuplicateKey,
  buildRssEventFingerprint,
  evaluateItemFreshness,
  getFeedDelayMinutes,
  classifyNewsCategory,
  initializeRssFeedBaselines,
  isRssObservationReady,
  isRssItemAfterBaseline,
  isRssItemNew,
  markRssItemSeen,
  bootstrapAllRssSources,
  markEligibleRssItemProcessed,
  resetRssObservationStateForTests,
  getRssObservationSnapshot,
  RSS_EDITORIAL_BLOCK_REASONS,
  validateGeneralRssEditorialOutput,
  buildRawSourceText,
  buildRssPublicationPresentation,
  normalizeHeadlineComparable,
  bodyStartsWithEquivalentHeadline,
  removeLeadingHeadlineFromBody,
  removeAllEquivalentHeadlineLines,
  collapseRepeatedNormalizedPhrase,
  resolveCanonicalHeadline,
  reviewExternalNewsBeforePublish,
  resetExternalNewsEditorStateForTests,
  getEditorTelemetrySnapshot,
  EDITOR_REASON_CODES,
  resolveRssSourceImageWithChartPolicy,
  getChartPolicyTelemetrySnapshot,
  resetChartPolicyStateForTests,
  auditRssPostPublish,
  evaluateRssCuratorGate,
  CURATOR_OUTCOMES,
  validateRssMinimumInformation,
  MINIMUM_INFO_REASON_CODES,
  sealRssFinalPublicationPresentation,
  buildAndValidateFinalRssPublication,
  assertDeliveryMatchesValidatedPresentation,
  sanitizeRssDraftAiText,
  reviewExternalNewsInShadowMode,
  scheduleExternalNewsShadowReview,
  RSS_EDITOR_MODE,
  runEditorV2ShadowReview,
  scheduleEditorV2ShadowReview,
  EDITOR_V2_MODE,
  getEditorV2TelemetrySnapshot,
  resetEditorV2TelemetryForTests,
  V2_REASON_CODES,
  buildCanonicalRssEvidence,
  buildStructuredFactsV2,
  validateEditorV2FactGuard,
};
