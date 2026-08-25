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
};
