const fs = require("fs");
const path = require("path");
const { SOURCE_TYPES, PUBLICATION_TYPES } = require("../news-intelligence/publication-types");
const { isNumericEconomicRelease } = require("../news-intelligence/event-normalizer");
const { CANONICAL_EVENT_DEFINITIONS } = require("../economic-releases/canonical-events");
const { isImportantImportance, resolveCandidateImportance } = require("./image-policy");
const {
  isTelegramEconomicFastLaneEligible,
  stableHash,
  selectPoolIndex,
  IMAGE_MODES,
} = require("./economic-image-pool");
const {
  CATEGORY_ARTWORK_COUNTS,
  buildFilenameList,
  ROUTING_FALLBACK_CATEGORY,
} = require("./general-prebuilt-artwork-manifest");
const {
  classifyGeneralNewsArtworkCategory,
  sanitizeGeneralNewsClassificationText,
} = require("./general-news-artwork-router");

const GENERAL_PREBUILT_STATUS = {
  GENERAL_PREBUILT_SELECTED: "GENERAL_PREBUILT_SELECTED",
  GENERAL_PREBUILT_NO_MATCH: "GENERAL_PREBUILT_NO_MATCH",
  GENERAL_PREBUILT_MISSING: "GENERAL_PREBUILT_MISSING",
  GENERAL_PREBUILT_FAILED_OPEN: "GENERAL_PREBUILT_FAILED_OPEN",
};

const IRAN_US_MILITARY_ASSETS = new Set(["01.jpg", "02.jpg", "03.jpg", "06.jpg"]);
const IRAN_US_DIPLOMACY_ASSETS = new Set(["04.jpg"]);
const IRAN_US_SANCTIONS_ASSETS = new Set(["05.jpg"]);

function getGeneralPrebuiltPoolBaseDir(override) {
  if (override) {
    return override;
  }
  if (process.env.GENERAL_PREBUILT_IMAGE_POOL_DIR) {
    return process.env.GENERAL_PREBUILT_IMAGE_POOL_DIR;
  }
  return path.join(process.cwd(), "public", "news", "general-prebuilt");
}

function buildCategoryAssetList(category) {
  const count = CATEGORY_ARTWORK_COUNTS[category];
  if (!count) {
    return [];
  }
  return buildFilenameList(count);
}

function resolveIranUsAssetCandidates(classificationText = "") {
  const text = String(classificationText || "").toLowerCase();
  if (/negotiat|diplomacy|diplomatic talks|peace talks|begin talks|resume talks/.test(text)) {
    return [...IRAN_US_DIPLOMACY_ASSETS];
  }
  if (/\b(sanctions?|policy|measures against iran|sanctions on iran)\b/.test(text)) {
    return [...IRAN_US_SANCTIONS_ASSETS];
  }
  if (
    /\b(military|strike|air strike|airstrike|aircraft|fighter|missile|threat|escalation|attack|naval|war|exchange threats)\b/.test(
      text
    )
  ) {
    return [...IRAN_US_MILITARY_ASSETS];
  }
  return buildCategoryAssetList("iran-us");
}

function resolveAssetCandidates(category, classificationText = "") {
  if (category === "iran-us") {
    return resolveIranUsAssetCandidates(classificationText);
  }
  return buildCategoryAssetList(category);
}

function buildPublicationClassificationText(publication = {}) {
  const title = publication.title || publication.metadata?.candidate?.title || "";
  const body = publication.body || publication.metadata?.candidate?.body || publication.metadata?.telegramMessage || "";
  return sanitizeGeneralNewsClassificationText(`${title}\n${body}`.trim());
}

function buildStableSelectionKey(publication = {}, category = "") {
  const parts = [
    category,
    publication.eventFingerprint ||
      publication.metadata?.eventFingerprint ||
      publication.metadata?.dedupeKey ||
      publication.id ||
      publication.metadata?.rawMessageId ||
      publication.metadata?.sourceMessageId ||
      publication.metadata?.sourceUrl ||
      publication.title ||
      "",
  ];
  return parts.filter(Boolean).join(":");
}

function isGeneralPrebuiltEligible(publication = {}) {
  if (isTelegramEconomicFastLaneEligible(publication)) {
    return false;
  }

  const eventKey = publication.eventType || publication.eventKey || null;
  if (eventKey && isNumericEconomicRelease(eventKey)) {
    return false;
  }
  if (
    eventKey &&
    CANONICAL_EVENT_DEFINITIONS[eventKey] &&
    publication.publicationType === PUBLICATION_TYPES.RELEASE &&
    publication.sourceType === SOURCE_TYPES.TELEGRAM_ECONOMIC
  ) {
    return false;
  }

  const sourceType = publication.sourceType;
  if (sourceType === SOURCE_TYPES.TELEGRAM_GENERAL || sourceType === SOURCE_TYPES.RSS_GENERAL) {
    return true;
  }
  if (
    sourceType === SOURCE_TYPES.TELEGRAM_ECONOMIC &&
    publication.publicationType === PUBLICATION_TYPES.GENERAL_NEWS
  ) {
    return true;
  }
  if (
    publication.publicationType === PUBLICATION_TYPES.GENERAL_NEWS &&
    isImportantImportance(resolveCandidateImportance(publication))
  ) {
    return true;
  }
  return false;
}

function resolveGeneralPrebuiltImagePolicy(publication = {}) {
  if (!isGeneralPrebuiltEligible(publication)) {
    return null;
  }
  return {
    imageMode: IMAGE_MODES.GENERAL_PREBUILT,
    imagePreferred: true,
    imageRequired: false,
    imageBlocking: false,
  };
}

function selectGeneralPrebuiltImage({ publication, poolBaseDir } = {}) {
  const startedAt = Date.now();
  try {
    const classificationText = buildPublicationClassificationText(publication);
    const routing = classifyGeneralNewsArtworkCategory(classificationText, { allowStructuredEconomic: false });

    if (routing.category === null) {
      return {
        status: GENERAL_PREBUILT_STATUS.GENERAL_PREBUILT_NO_MATCH,
        imageMode: IMAGE_MODES.GENERAL_PREBUILT,
        routingReason: routing.reason,
        generalPrebuiltEligible: true,
        selectionMs: Date.now() - startedAt,
      };
    }

    const category = routing.category || ROUTING_FALLBACK_CATEGORY;
    const candidates = resolveAssetCandidates(category, classificationText);
    if (!candidates.length) {
      return {
        status: GENERAL_PREBUILT_STATUS.GENERAL_PREBUILT_MISSING,
        imageMode: IMAGE_MODES.GENERAL_PREBUILT,
        category,
        routingReason: routing.reason,
        selectionMs: Date.now() - startedAt,
      };
    }

    const rotationKey = buildStableSelectionKey(publication, category);
    const startIndex = selectPoolIndex(stableHash(rotationKey), candidates.length);
    const baseDir = getGeneralPrebuiltPoolBaseDir(poolBaseDir);

    for (let offset = 0; offset < candidates.length; offset += 1) {
      const index = (startIndex + offset) % candidates.length;
      const assetName = candidates[index];
      const filePath = path.join(baseDir, category, assetName);
      const assetPath = `/news/general-prebuilt/${category}/${assetName}`;

      if (fs.existsSync(filePath)) {
        return {
          status: GENERAL_PREBUILT_STATUS.GENERAL_PREBUILT_SELECTED,
          imageMode: IMAGE_MODES.GENERAL_PREBUILT,
          category,
          assetName,
          assetPath,
          filePath,
          poolIndex: index,
          routingReason: routing.reason,
          routingConfidence: routing.confidence,
          routingDirectional: routing.directional,
          iranUsVariant: category === "iran-us" ? assetName : null,
          generalPrebuiltEligible: true,
          selectionMs: Date.now() - startedAt,
        };
      }
    }

    return {
      status: GENERAL_PREBUILT_STATUS.GENERAL_PREBUILT_MISSING,
      imageMode: IMAGE_MODES.GENERAL_PREBUILT,
      category,
      assetName: candidates[startIndex],
      assetPath: `/news/general-prebuilt/${category}/${candidates[startIndex]}`,
      filePath: path.join(baseDir, category, candidates[startIndex]),
      poolIndex: startIndex,
      routingReason: routing.reason,
      selectionMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: GENERAL_PREBUILT_STATUS.GENERAL_PREBUILT_FAILED_OPEN,
      imageMode: IMAGE_MODES.GENERAL_PREBUILT,
      error: error?.message || String(error),
      selectionMs: Date.now() - startedAt,
    };
  }
}

module.exports = {
  GENERAL_PREBUILT_STATUS,
  getGeneralPrebuiltPoolBaseDir,
  buildPublicationClassificationText,
  resolveGeneralPrebuiltImagePolicy,
  isGeneralPrebuiltEligible,
  selectGeneralPrebuiltImage,
  resolveIranUsAssetCandidates,
  resolveAssetCandidates,
};
