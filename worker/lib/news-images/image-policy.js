const { SOURCE_TYPES, PUBLICATION_TYPES } = require("../news-intelligence/publication-types");
const { IMAGE_REQUIRED_EVENTS } = require("../news-intelligence/economic-editorial/interpretation-registry");
const { isPremiumImageEvent } = require("./important-events");

const IMAGE_POLICY_MODES = {
  SOURCE_ONLY: "SOURCE_ONLY",
  AI_PRIMARY: "AI_PRIMARY",
  NONE: "NONE",
};

const FALLBACK_BRAND = "Economic Newsi";

function normalizeImportance(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (normalized === "VERY_IMPORTANT") return "VERY_IMPORTANT";
  if (normalized === "IMPORTANT" || normalized === "HIGH") return "HIGH";
  if (normalized === "MEDIUM") return "MEDIUM";
  if (normalized === "LOW") return "LOW";
  return normalized || "MEDIUM";
}

function isImportantImportance(importance) {
  const normalized = normalizeImportance(importance);
  return normalized === "HIGH" || normalized === "IMPORTANT" || normalized === "VERY_IMPORTANT";
}

function resolveCandidateImportance(publication = {}) {
  if (publication.importance && isImportantImportance(publication.importance)) {
    return normalizeImportance(publication.importance);
  }

  const candidate = publication.metadata?.candidate || {};
  if (candidate.newsType === "economic" || candidate.newsType === "pre_event") {
    return "HIGH";
  }

  const score = Number(candidate.newsValue?.score || publication.metadata?.newsValue?.score || 0);
  if (score >= 55) {
    return "HIGH";
  }

  return normalizeImportance(publication.importance || "MEDIUM");
}

function resolveNewsImagePolicy(input = {}) {
  const sourceType = input.sourceType || null;
  const publicationType = input.publicationType || null;
  const eventType = input.eventType || null;
  const eventFamily = input.eventFamily || null;
  const importance = resolveCandidateImportance(input);

  if (sourceType === SOURCE_TYPES.RSS_GENERAL) {
    return {
      mode: IMAGE_POLICY_MODES.SOURCE_ONLY,
      allowTextOnly: true,
      fallbackBrand: FALLBACK_BRAND,
      allowAi: false,
      importance,
    };
  }

  if (publicationType === PUBLICATION_TYPES.RELEASE) {
    return {
      mode: IMAGE_POLICY_MODES.AI_PRIMARY,
      allowTextOnly: true,
      fallbackBrand: FALLBACK_BRAND,
      allowAi: true,
      importance,
      economicRelease: true,
    };
  }

  if (
    eventType &&
    (IMAGE_REQUIRED_EVENTS.has(eventType) ||
      isPremiumImageEvent(eventType) ||
      (eventFamily && IMAGE_REQUIRED_EVENTS.has(eventFamily)))
  ) {
    return {
      mode: IMAGE_POLICY_MODES.AI_PRIMARY,
      allowTextOnly: true,
      fallbackBrand: FALLBACK_BRAND,
      allowAi: true,
      importance,
    };
  }

  if (sourceType !== SOURCE_TYPES.RSS_GENERAL && isImportantImportance(importance)) {
    return {
      mode: IMAGE_POLICY_MODES.AI_PRIMARY,
      allowTextOnly: true,
      fallbackBrand: FALLBACK_BRAND,
      allowAi: true,
      importance,
    };
  }

  return {
    mode: IMAGE_POLICY_MODES.NONE,
    allowTextOnly: true,
    fallbackBrand: FALLBACK_BRAND,
    allowAi: false,
    importance,
  };
}

function assertRssNeverUsesAi(policy = {}, context = "rss") {
  if (policy.mode !== IMAGE_POLICY_MODES.SOURCE_ONLY || policy.allowAi === true) {
    throw new Error(`RSS image policy violation (${context}): AI generation is forbidden for RSS`);
  }
}

module.exports = {
  IMAGE_POLICY_MODES,
  FALLBACK_BRAND,
  normalizeImportance,
  isImportantImportance,
  resolveCandidateImportance,
  resolveNewsImagePolicy,
  assertRssNeverUsesAi,
};
