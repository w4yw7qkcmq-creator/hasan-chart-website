const path = require("path");

/**
 * Visual identity for Economic Newsi general-news prebuilt artwork (V2).
 * Independent from structured numeric Economic Fast-Lane library.
 */
const BRAND_IDENTITY = "ECONOMIC_NEWSI";

const BRAND_IDENTITY_LABELS = {
  en: "Economic Newsi",
  ar: "الأخبار الاقتصادية",
};

const POOL_PUBLIC_ROOT = "/news/general-prebuilt";

const ARTWORK_TECHNICAL_SPEC = {
  format: "JPG",
  mimeTypes: ["image/jpeg"],
  extensions: [".jpg", ".jpeg"],
  orientation: "square",
  recommendedDimensions: { width: 1080, height: 1080 },
  targetFileSizeKb: { min: 100, max: 300, practical: true },
  optimizedFor: ["telegram", "mobile"],
  backgroundGeneration: "AI background only; deterministic local SVG/sharp overlay for all text",
  mustNotContain: [
    "live prices",
    "percentages",
    "dates",
    "timestamps",
    "specific casualty numbers",
    "specific claims that could become outdated",
    "fake newspaper screenshots",
    "AI-generated readable typography",
    "source Telegram channel branding",
    "ForexBreakingNews",
    "ForexNewspaper",
    "HasaN CharT",
    "HasaN CharT World",
    "HasaN Trading",
    "HasaN CharT Academy",
    "third-party Telegram URLs",
  ],
  selectionMode: "local synchronous filesystem lookup (future)",
};

/** @type {Record<string, number>} */
const CATEGORY_ARTWORK_COUNTS = {
  "iran-us": 6,
  "oil-up": 4,
  "oil-down": 4,
  gold: 5,
  usd: 4,
  "us-economy": 3,
  "fed-general": 3,
  geopolitics: 4,
  "hormuz-shipping": 3,
  "china-markets": 3,
  "global-markets-up": 3,
  "global-markets-down": 3,
  crypto: 3,
  "breaking-economic": 2,
};

/** Small category label shown under Economic Newsi on overlay */
const CATEGORY_CONTEXT_LABELS = {
  "iran-us": "Geopolitics",
  "oil-up": "Energy Markets",
  "oil-down": "Energy Markets",
  gold: "Gold Markets",
  usd: "US Dollar",
  "us-economy": "Global Markets",
  "fed-general": "Central Banks",
  geopolitics: "Geopolitics",
  "hormuz-shipping": "Energy Markets",
  "china-markets": "Global Markets",
  "global-markets-up": "Global Markets",
  "global-markets-down": "Global Markets",
  crypto: "Crypto Markets",
  "breaking-economic": "Breaking News",
};

const ROUTING_FALLBACK_CATEGORY = "breaking-economic";

const ARTWORK_SAFETY_RULES = {
  reusableGenericArtwork: true,
  neutralGeopoliticalImagery: true,
  noDirectionGuessing: true,
  forbiddenContent: ARTWORK_TECHNICAL_SPEC.mustNotContain,
  excludedBrandIdentities: [
    "HasaN CharT World",
    "HasaN CharT Academy",
    "HasaN Trading",
    "ForexBreakingNews",
    "ForexNewspaper",
  ],
  independentFromEconomicFastLane: true,
};

const FILENAME_PATTERN = /^\d{2}\.jpg$/;

function buildFilenameList(count) {
  return Array.from({ length: count }, (_, index) => `${String(index + 1).padStart(2, "0")}.jpg`);
}

function getPoolBaseDir(override) {
  if (override) {
    return override;
  }
  if (process.env.GENERAL_PREBUILT_IMAGE_POOL_DIR) {
    return process.env.GENERAL_PREBUILT_IMAGE_POOL_DIR;
  }
  return path.join(process.cwd(), "public", "news", "general-prebuilt");
}

function getWorkerMirrorBaseDir(override) {
  if (override) {
    return override;
  }
  if (process.env.GENERAL_PREBUILT_WORKER_POOL_DIR) {
    return process.env.GENERAL_PREBUILT_WORKER_POOL_DIR;
  }
  return path.join(process.cwd(), "worker", "public", "news", "general-prebuilt");
}

/** @type {Record<string, string[]>} */
const ARTWORK_MANIFEST = Object.fromEntries(
  Object.entries(CATEGORY_ARTWORK_COUNTS).map(([category, count]) => [
    category,
    buildFilenameList(count),
  ])
);

function buildAssetId(category, filename) {
  const index = filename.replace(/\.jpg$/, "");
  return `${category}-${index}`;
}

function getTotalArtworkCount() {
  return Object.values(CATEGORY_ARTWORK_COUNTS).reduce((sum, count) => sum + count, 0);
}

function listManifestEntries(baseDir = getPoolBaseDir()) {
  const entries = [];
  for (const [category, filenames] of Object.entries(ARTWORK_MANIFEST)) {
    for (const filename of filenames) {
      entries.push({
        id: buildAssetId(category, filename),
        category,
        filename,
        relativePath: `${category}/${filename}`,
        absolutePath: path.join(baseDir, category, filename),
        publicPath: `${POOL_PUBLIC_ROOT}/${category}/${filename}`,
        categoryLabel: CATEGORY_CONTEXT_LABELS[category] || "Breaking News",
        isFallback: category === ROUTING_FALLBACK_CATEGORY,
      });
    }
  }
  return entries;
}

function listUnexpectedFilesInCategory(category, baseDir = getPoolBaseDir()) {
  const fs = require("fs");
  const categoryDir = path.join(baseDir, category);
  if (!fs.existsSync(categoryDir)) {
    return [];
  }
  const allowed = new Set(ARTWORK_MANIFEST[category] || []);
  return fs
    .readdirSync(categoryDir)
    .filter((name) => name !== ".gitkeep" && name !== "ARTWORK.md" && !allowed.has(name));
}

function assertManifestTotals() {
  const total = getTotalArtworkCount();
  if (total !== 50) {
    throw new Error(`General prebuilt manifest must contain exactly 50 assets, got ${total}`);
  }
}

assertManifestTotals();

module.exports = {
  BRAND_IDENTITY,
  BRAND_IDENTITY_LABELS,
  POOL_PUBLIC_ROOT,
  ARTWORK_TECHNICAL_SPEC,
  ARTWORK_SAFETY_RULES,
  CATEGORY_ARTWORK_COUNTS,
  CATEGORY_CONTEXT_LABELS,
  ROUTING_FALLBACK_CATEGORY,
  ARTWORK_MANIFEST,
  FILENAME_PATTERN,
  buildFilenameList,
  buildAssetId,
  getPoolBaseDir,
  getWorkerMirrorBaseDir,
  getTotalArtworkCount,
  listManifestEntries,
  listUnexpectedFilesInCategory,
};
