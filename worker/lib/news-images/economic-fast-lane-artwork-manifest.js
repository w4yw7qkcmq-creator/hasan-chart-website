const path = require("path");

/**
 * Visual identity for prebuilt Fast-Lane artwork.
 * NOT HasaN CharT World website / Academy / Trading branding.
 */
const BRAND_IDENTITY = "ECONOMIC_NEWS_CHANNEL";

const BRAND_IDENTITY_LABELS = {
  en: "Economic News Channel",
  ar: "الأخبار الاقتصادية",
};

const ARTWORK_TECHNICAL_SPEC = {
  format: "JPG",
  mimeTypes: ["image/jpeg"],
  extensions: [".jpg", ".jpeg"],
  orientation: "square",
  recommendedDimensions: { width: 1080, height: 1080 },
  targetFileSizeKb: { min: 100, max: 300, practical: true },
  optimizedFor: ["telegram", "mobile"],
  mustNotContain: [
    "actual economic result",
    "previous value",
    "forecast value",
    "economic numbers",
    "release date",
    "release time",
    "dynamically changing information",
    "source Telegram channel branding",
    "ForexBreakingNews",
    "ForexNewspaper",
    "third-party Telegram URLs",
  ],
  selectionMode: "local synchronous filesystem lookup",
};

/** @type {Record<string, number>} */
const CATEGORY_ARTWORK_COUNTS = {
  fed: 5,
  cpi: 4,
  nfp: 4,
  jobs: 4,
  "pmi-ism": 4,
  eia: 5,
  ecb: 4,
  boe: 2,
  boj: 2,
  "central-banks": 2,
  inflation: 2,
  gdp: 3,
  "retail-sales": 2,
  "consumer-confidence": 2,
  "generic-us-economic": 2,
  "generic-eurozone-economic": 2,
  "generic-economic": 1,
};

const ARTWORK_SAFETY_RULES = {
  reusableGenericArtwork: true,
  liveNumbersInTelegramTextOnly: true,
  forbiddenContent: ARTWORK_TECHNICAL_SPEC.mustNotContain,
  independentChannelIdentity: true,
  excludedBrandIdentities: [
    "HasaN CharT World website",
    "HasaN CharT Academy",
    "HasaN Trading",
  ],
};

const PROTOTYPE_ASSETS = [
  {
    id: "prototype-fed-01",
    category: "fed",
    relativePath: "fed/01.jpg",
    publicPath: "/news/economic-fast-lane/fed/01.jpg",
    concept: "Federal Reserve / US interest-rate decision",
    status: "pending_artwork",
  },
  {
    id: "prototype-cpi-01",
    category: "cpi",
    relativePath: "cpi/01.jpg",
    publicPath: "/news/economic-fast-lane/cpi/01.jpg",
    concept: "US CPI / inflation",
    status: "pending_artwork",
  },
];

const FILENAME_PATTERN = /^\d{2}\.jpg$/;

function buildFilenameList(count) {
  return Array.from({ length: count }, (_, index) => `${String(index + 1).padStart(2, "0")}.jpg`);
}

function getPoolBaseDir(override) {
  if (override) {
    return override;
  }
  if (process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR) {
    return process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR;
  }
  return path.join(process.cwd(), "public", "news", "economic-fast-lane");
}

/** @type {Record<string, string[]>} */
const ARTWORK_MANIFEST = Object.fromEntries(
  Object.entries(CATEGORY_ARTWORK_COUNTS).map(([category, count]) => [
    category,
    buildFilenameList(count),
  ])
);

function getTotalArtworkCount() {
  return Object.values(CATEGORY_ARTWORK_COUNTS).reduce((sum, count) => sum + count, 0);
}

function listManifestEntries(baseDir = getPoolBaseDir()) {
  const entries = [];
  for (const [category, filenames] of Object.entries(ARTWORK_MANIFEST)) {
    for (const filename of filenames) {
      entries.push({
        category,
        filename,
        relativePath: `${category}/${filename}`,
        absolutePath: path.join(baseDir, category, filename),
        publicPath: `/news/economic-fast-lane/${category}/${filename}`,
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
    .filter((name) => name !== ".gitkeep" && !allowed.has(name));
}

module.exports = {
  BRAND_IDENTITY,
  BRAND_IDENTITY_LABELS,
  ARTWORK_TECHNICAL_SPEC,
  ARTWORK_SAFETY_RULES,
  CATEGORY_ARTWORK_COUNTS,
  ARTWORK_MANIFEST,
  PROTOTYPE_ASSETS,
  FILENAME_PATTERN,
  buildFilenameList,
  getPoolBaseDir,
  getTotalArtworkCount,
  listManifestEntries,
  listUnexpectedFilesInCategory,
};
