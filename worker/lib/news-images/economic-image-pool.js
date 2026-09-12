const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { SOURCE_TYPES, PUBLICATION_TYPES } = require("../news-intelligence/publication-types");
const { isNumericEconomicRelease } = require("../news-intelligence/event-normalizer");
const { isApprovedNumericEconomicTelegramSource } = require("../news-intelligence/source-policy");
const { CANONICAL_EVENT_DEFINITIONS } = require("../economic-releases/canonical-events");
const { isFamilyPublicationEventType } = require("../news-intelligence/event-registry");

const IMAGE_MODES = {
  PREBUILT: "PREBUILT",
  PREBUILT_FAST_LANE: "PREBUILT_FAST_LANE",
};

const SELECTION_STATUS = {
  PREBUILT_SELECTED: "PREBUILT_SELECTED",
  PREBUILT_MISSING: "PREBUILT_MISSING",
  PREBUILT_FAILED_OPEN: "PREBUILT_FAILED_OPEN",
  SKIPPED: "SKIPPED",
  // Legacy aliases kept for internal comparisons during migration
  SELECTED: "PREBUILT_SELECTED",
  MISSING: "PREBUILT_MISSING",
  FAILED_OPEN: "PREBUILT_FAILED_OPEN",
};

function getPoolBaseDir(override) {
  if (override) {
    return override;
  }
  if (process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR) {
    return process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR;
  }
  return path.join(process.cwd(), "public", "news", "economic-fast-lane");
}

const POOL_BASE_DIR = getPoolBaseDir();

const DEFAULT_ASSETS = ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"];

/** @type {Record<string, string[]>} */
const CATEGORY_POOLS = Object.fromEntries(
  [
    "fed",
    "cpi",
    "nfp",
    "jobs",
    "pmi-ism",
    "eia",
    "ecb",
    "boe",
    "boj",
    "central-banks",
    "inflation",
    "gdp",
    "retail-sales",
    "consumer-confidence",
    "generic-us-economic",
    "generic-eurozone-economic",
    "generic-economic",
  ].map((category) => [category, DEFAULT_ASSETS.slice()])
);

/** @type {Record<string, string>} canonicalEventId → category folder */
const EVENT_TO_CATEGORY = {
  US_FED_RATE_DECISION: "fed",
  US_FOMC_MINUTES: "fed",
  US_FOMC_RATE_DECISION: "fed",

  US_CPI_MOM: "cpi",
  US_CPI_YOY: "cpi",
  US_CORE_CPI_MOM: "cpi",
  US_CORE_CPI_YOY: "cpi",

  US_NFP: "nfp",
  US_NONFARM_PAYROLLS: "nfp",

  US_UNEMPLOYMENT_RATE: "jobs",
  US_INITIAL_JOBLESS_CLAIMS: "jobs",
  US_CONTINUING_JOBLESS_CLAIMS: "jobs",
  US_ADP_EMPLOYMENT: "jobs",
  US_JOLTS_JOB_OPENINGS: "jobs",

  US_ISM_MANUFACTURING: "pmi-ism",
  US_ISM_NON_MANUFACTURING_PMI: "pmi-ism",
  US_ISM_SERVICES: "pmi-ism",
  US_MANUFACTURING_PMI: "pmi-ism",
  US_SERVICES_PMI: "pmi-ism",
  US_PMI: "pmi-ism",
  US_SP_GLOBAL_FLASH_MANUFACTURING_PMI: "pmi-ism",
  US_SP_GLOBAL_FLASH_SERVICES_PMI: "pmi-ism",
  US_SP_GLOBAL_FINAL_MANUFACTURING_PMI: "pmi-ism",
  US_SP_GLOBAL_FINAL_SERVICES_PMI: "pmi-ism",
  US_SP_GLOBAL_PMI: "pmi-ism",

  US_EIA_CRUDE_OIL_INVENTORIES: "eia",
  US_EIA_GASOLINE_INVENTORIES: "eia",
  US_EIA_DISTILLATE_INVENTORIES: "eia",
  US_EIA_CUSHING_CRUDE_OIL_INVENTORIES: "eia",

  EZ_ECB_RATE_DECISION: "ecb",
  EZ_ECB_DEPOSIT_RATE: "ecb",
  EZ_ECB_MAIN_REFINANCING_RATE: "ecb",
  EZ_ECB_MONETARY_POLICY_STATEMENT: "ecb",

  UK_BOE_RATE_DECISION: "boe",
  JP_BOJ_RATE_DECISION: "boj",

  US_GDP_QOQ: "gdp",
  US_RETAIL_SALES: "retail-sales",
  US_CORE_RETAIL_SALES: "retail-sales",
  US_CONSUMER_CONFIDENCE: "consumer-confidence",
};

function stableHash(input) {
  return crypto.createHash("sha256").update(String(input)).digest();
}

function selectPoolIndex(hash, poolLength) {
  if (poolLength <= 0) {
    return 0;
  }
  return hash.readUInt32BE(0) % poolLength;
}

function resolveImageCategory(canonicalEventId, countryCode = "US") {
  if (!canonicalEventId) {
    return countryCode === "US"
      ? "generic-us-economic"
      : countryCode === "EZ"
        ? "generic-eurozone-economic"
        : "generic-economic";
  }

  if (EVENT_TO_CATEGORY[canonicalEventId]) {
    return EVENT_TO_CATEGORY[canonicalEventId];
  }

  const eventUpper = String(canonicalEventId).toUpperCase();

  if (/FED|FOMC/.test(eventUpper)) return "fed";
  if (/CPI|INFLATION|PPI|PCE/.test(eventUpper)) return eventUpper.includes("INFLATION") ? "inflation" : "cpi";
  if (/NFP|NONFARM|PAYROLL/.test(eventUpper)) return "nfp";
  if (/JOBLESS|UNEMPLOYMENT|LABOR|ADP|JOLTS/.test(eventUpper)) return "jobs";
  if (/ISM|PMI/.test(eventUpper)) return "pmi-ism";
  if (/EIA_/.test(eventUpper)) return "eia";
  if (/ECB/.test(eventUpper)) return "ecb";
  if (/BOE/.test(eventUpper)) return "boe";
  if (/BOJ/.test(eventUpper)) return "boj";
  if (/RATE_DECISION|MONETARY_POLICY|CENTRAL_BANK/.test(eventUpper)) return "central-banks";
  if (/GDP/.test(eventUpper)) return "gdp";
  if (/RETAIL/.test(eventUpper)) return "retail-sales";
  if (/CONSUMER_CONFIDENCE|MICHIGAN|SENTIMENT/.test(eventUpper)) return "consumer-confidence";

  if (countryCode === "US") return "generic-us-economic";
  if (countryCode === "EZ" || countryCode === "EU") return "generic-eurozone-economic";
  return "generic-economic";
}

function resolveTelegramEconomicFastLaneImagePolicy(publication = {}) {
  if (!isTelegramEconomicFastLaneEligible(publication)) {
    return null;
  }
  return {
    imageMode: IMAGE_MODES.PREBUILT_FAST_LANE,
    imagePreferred: true,
    imageRequired: false,
    imageBlocking: false,
  };
}

function isTelegramEconomicFastLaneEligible(publication = {}) {
  if (publication.sourceType !== SOURCE_TYPES.TELEGRAM_ECONOMIC) {
    return false;
  }
  if (publication.publicationType !== PUBLICATION_TYPES.RELEASE) {
    return false;
  }
  if (!isApprovedNumericEconomicTelegramSource(publication.sourceId)) {
    return false;
  }
  const eventType =
    publication.eventType || publication.eventKey || publication.metadata?.premiumImageContext?.eventKey;
  if (!eventType) {
    return false;
  }
  if (isNumericEconomicRelease(eventType)) {
    return true;
  }
  if (isFamilyPublicationEventType(eventType)) {
    return true;
  }
  if (CANONICAL_EVENT_DEFINITIONS[eventType]) {
    return true;
  }
  return false;
}

function selectEconomicFastLaneImage({
  canonicalEventId,
  countryCode = "US",
  sourceMessageId = null,
  publishedAt = null,
  poolBaseDir,
} = {}) {
  const startedAt = Date.now();
  try {
    const category = resolveImageCategory(canonicalEventId, countryCode);
    const pool = CATEGORY_POOLS[category] || CATEGORY_POOLS["generic-economic"];

    if (!pool || pool.length === 0) {
      return {
        status: SELECTION_STATUS.PREBUILT_MISSING,
        imageMode: IMAGE_MODES.PREBUILT_FAST_LANE,
        category,
        selectionMs: Date.now() - startedAt,
      };
    }

    const rotationKey = `${canonicalEventId || "unknown"}:${sourceMessageId || publishedAt || ""}`;
    const startIndex = selectPoolIndex(stableHash(rotationKey), pool.length);
    const baseDir = getPoolBaseDir(poolBaseDir);

    for (let offset = 0; offset < pool.length; offset += 1) {
      const index = (startIndex + offset) % pool.length;
      const assetName = pool[index];
      const filePath = path.join(baseDir, category, assetName);
      const assetPath = `/news/economic-fast-lane/${category}/${assetName}`;

      if (fs.existsSync(filePath)) {
        return {
          status: SELECTION_STATUS.PREBUILT_SELECTED,
          imageMode: IMAGE_MODES.PREBUILT_FAST_LANE,
          category,
          assetPath,
          filePath,
          poolIndex: index,
          selectionMs: Date.now() - startedAt,
        };
      }
    }

    const fallbackAssetName = pool[startIndex];
    return {
      status: SELECTION_STATUS.PREBUILT_MISSING,
      imageMode: IMAGE_MODES.PREBUILT_FAST_LANE,
      category,
      assetPath: `/news/economic-fast-lane/${category}/${fallbackAssetName}`,
      filePath: path.join(baseDir, category, fallbackAssetName),
      poolIndex: startIndex,
      selectionMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: SELECTION_STATUS.PREBUILT_FAILED_OPEN,
      imageMode: IMAGE_MODES.PREBUILT_FAST_LANE,
      error: error?.message || String(error),
      selectionMs: Date.now() - startedAt,
    };
  }
}

module.exports = {
  IMAGE_MODES,
  SELECTION_STATUS,
  POOL_BASE_DIR,
  CATEGORY_POOLS,
  EVENT_TO_CATEGORY,
  resolveImageCategory,
  isTelegramEconomicFastLaneEligible,
  resolveTelegramEconomicFastLaneImagePolicy,
  selectEconomicFastLaneImage,
  selectPoolIndex,
  stableHash,
};
