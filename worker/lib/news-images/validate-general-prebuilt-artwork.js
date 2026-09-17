const fs = require("fs");
const {
  ARTWORK_MANIFEST,
  ARTWORK_TECHNICAL_SPEC,
  ARTWORK_SAFETY_RULES,
  BRAND_IDENTITY,
  BRAND_IDENTITY_LABELS,
  CATEGORY_ARTWORK_COUNTS,
  FILENAME_PATTERN,
  getPoolBaseDir,
  getTotalArtworkCount,
  listManifestEntries,
  listUnexpectedFilesInCategory,
} = require("./general-prebuilt-artwork-manifest");
const { validatePromptDefinitionsAgainstManifest } = require("./general-prebuilt-artwork-prompts");

const DEFAULT_MAX_FILE_SIZE_BYTES = 1024 * 1024;

function validateBrandIdentity() {
  const issues = [];
  if (BRAND_IDENTITY !== "ECONOMIC_NEWSI") {
    issues.push({ code: "BRAND_IDENTITY_MISMATCH", expected: "ECONOMIC_NEWSI", actual: BRAND_IDENTITY });
  }
  if (BRAND_IDENTITY_LABELS.en !== "Economic Newsi") {
    issues.push({
      code: "BRAND_LABEL_MISMATCH",
      expected: "Economic Newsi",
      actual: BRAND_IDENTITY_LABELS.en,
    });
  }
  return { ok: issues.length === 0, issues };
}

function validateManifestStructure() {
  const issues = [];
  const total = getTotalArtworkCount();
  if (total !== 50) {
    issues.push({ code: "MANIFEST_COUNT_MISMATCH", expected: 50, actual: total });
  }

  const seenIds = new Set();
  const seenPaths = new Set();
  for (const entry of listManifestEntries()) {
    if (!FILENAME_PATTERN.test(entry.filename)) {
      issues.push({ code: "INVALID_FILENAME", path: entry.relativePath });
    }
    if (seenPaths.has(entry.relativePath)) {
      issues.push({ code: "DUPLICATE_MANIFEST_PATH", path: entry.relativePath });
    }
    seenPaths.add(entry.relativePath);

    if (seenIds.has(entry.id)) {
      issues.push({ code: "DUPLICATE_MANIFEST_ID", id: entry.id });
    }
    seenIds.add(entry.id);

    if (!entry.publicPath.startsWith("/news/general-prebuilt/")) {
      issues.push({ code: "INVALID_PUBLIC_PATH", path: entry.publicPath });
    }
    if (entry.publicPath.includes("economic-fast-lane")) {
      issues.push({ code: "FAST_LANE_PATH_LEAK", path: entry.publicPath });
    }
  }

  for (const [category, filenames] of Object.entries(ARTWORK_MANIFEST)) {
    const expectedCount = CATEGORY_ARTWORK_COUNTS[category];
    if (filenames.length !== expectedCount) {
      issues.push({
        code: "CATEGORY_COUNT_MISMATCH",
        category,
        expected: expectedCount,
        actual: filenames.length,
      });
    }
  }

  return { ok: issues.length === 0, issues, total };
}

function validateArtworkFiles(options = {}) {
  const baseDir = getPoolBaseDir(options.poolBaseDir);
  const requireAllPresent = options.requireAllPresent === true;
  const maxFileSizeBytes = options.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE_BYTES;
  const minBytes = (ARTWORK_TECHNICAL_SPEC.targetFileSizeKb.min || 0) * 1024;
  const maxBytes = Math.max(minBytes, (ARTWORK_TECHNICAL_SPEC.targetFileSizeKb.max || 300) * 1024 * 2);

  const issues = [];
  const present = [];
  const missing = [];

  for (const entry of listManifestEntries(baseDir)) {
    if (!fs.existsSync(entry.absolutePath)) {
      missing.push(entry.relativePath);
      if (requireAllPresent) {
        issues.push({ code: "MISSING_FILE", path: entry.relativePath });
      }
      continue;
    }

    const stat = fs.statSync(entry.absolutePath);
    if (!stat.isFile()) {
      issues.push({ code: "NOT_A_FILE", path: entry.relativePath });
      continue;
    }

    const lower = entry.filename.toLowerCase();
    if (!ARTWORK_TECHNICAL_SPEC.extensions.some((ext) => lower.endsWith(ext))) {
      issues.push({ code: "INVALID_EXTENSION", path: entry.relativePath });
    }

    if (stat.size === 0) {
      issues.push({ code: "EMPTY_FILE", path: entry.relativePath });
    }

    if (stat.size > maxFileSizeBytes) {
      issues.push({
        code: "FILE_TOO_LARGE",
        path: entry.relativePath,
        sizeBytes: stat.size,
        maxBytes: maxFileSizeBytes,
      });
    }

    if (stat.size < minBytes) {
      issues.push({
        code: "FILE_SMALLER_THAN_TARGET",
        path: entry.relativePath,
        sizeBytes: stat.size,
        minBytes,
        severity: "warning",
      });
    }

    if (stat.size > maxBytes) {
      issues.push({
        code: "FILE_LARGER_THAN_TARGET",
        path: entry.relativePath,
        sizeBytes: stat.size,
        maxBytes,
        severity: "warning",
      });
    }

    present.push({
      path: entry.relativePath,
      sizeBytes: stat.size,
      category: entry.category,
      filename: entry.filename,
    });
  }

  for (const category of Object.keys(ARTWORK_MANIFEST)) {
    for (const unexpected of listUnexpectedFilesInCategory(category, baseDir)) {
      issues.push({
        code: "UNEXPECTED_FILENAME",
        path: `${category}/${unexpected}`,
      });
    }
  }

  const hardIssues = issues.filter((issue) => issue.severity !== "warning");
  return {
    ok: hardIssues.length === 0,
    issues,
    presentCount: present.length,
    missingCount: missing.length,
    missing,
    present,
    totalExpected: getTotalArtworkCount(),
  };
}

async function validateArtworkFilesAsync(options = {}) {
  const baseDir = getPoolBaseDir(options.poolBaseDir);
  const requireAllPresent = options.requireAllPresent === true;
  const validateDimensions = options.validateDimensions === true;
  const maxFileSizeBytes = options.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE_BYTES;
  const minBytes = (ARTWORK_TECHNICAL_SPEC.targetFileSizeKb.min || 0) * 1024;
  const maxBytes = Math.max(minBytes, (ARTWORK_TECHNICAL_SPEC.targetFileSizeKb.max || 300) * 1024 * 2);

  const issues = [];
  const present = [];
  const missing = [];

  let sharp = options.sharp;
  if (validateDimensions && !sharp) {
    sharp = require("sharp");
  }

  for (const entry of listManifestEntries(baseDir)) {
    if (!fs.existsSync(entry.absolutePath)) {
      missing.push(entry.relativePath);
      if (requireAllPresent) {
        issues.push({ code: "MISSING_FILE", path: entry.relativePath });
      }
      continue;
    }

    const stat = fs.statSync(entry.absolutePath);
    if (!stat.isFile()) {
      issues.push({ code: "NOT_A_FILE", path: entry.relativePath });
      continue;
    }

    const lower = entry.filename.toLowerCase();
    if (!ARTWORK_TECHNICAL_SPEC.extensions.some((ext) => lower.endsWith(ext))) {
      issues.push({ code: "INVALID_EXTENSION", path: entry.relativePath });
    }

    if (stat.size === 0) {
      issues.push({ code: "EMPTY_FILE", path: entry.relativePath });
    }

    if (stat.size > maxFileSizeBytes) {
      issues.push({
        code: "FILE_TOO_LARGE",
        path: entry.relativePath,
        sizeBytes: stat.size,
        maxBytes: maxFileSizeBytes,
      });
    }

    if (validateDimensions && sharp) {
      try {
        const meta = await sharp(entry.absolutePath).metadata();
        if (meta.width !== 1080 || meta.height !== 1080) {
          issues.push({
            code: "INVALID_DIMENSIONS",
            path: entry.relativePath,
            width: meta.width,
            height: meta.height,
          });
        }
      } catch {
        issues.push({ code: "UNREADABLE_IMAGE", path: entry.relativePath });
      }
    }

    present.push({
      path: entry.relativePath,
      sizeBytes: stat.size,
      category: entry.category,
      filename: entry.filename,
    });
  }

  for (const category of Object.keys(ARTWORK_MANIFEST)) {
    for (const unexpected of listUnexpectedFilesInCategory(category, baseDir)) {
      issues.push({
        code: "UNEXPECTED_FILENAME",
        path: `${category}/${unexpected}`,
      });
    }
  }

  const hardIssues = issues.filter((issue) => issue.severity !== "warning");
  return {
    ok: hardIssues.length === 0,
    issues,
    presentCount: present.length,
    missingCount: missing.length,
    missing,
    present,
    totalExpected: getTotalArtworkCount(),
  };
}

function validateGeneralPrebuiltArtwork(options = {}) {
  const structure = validateManifestStructure();
  const brand = validateBrandIdentity();
  const prompts = validatePromptDefinitionsAgainstManifest(options.poolBaseDir);
  const files = validateArtworkFiles(options);
  const hardIssues = [
    ...structure.issues,
    ...brand.issues,
    ...prompts.issues,
    ...files.issues.filter((issue) => issue.severity !== "warning"),
  ];
  return {
    ok: structure.ok && brand.ok && prompts.ok && files.ok,
    structure,
    brand,
    prompts,
    files,
    safetyRules: ARTWORK_SAFETY_RULES,
    summary: {
      totalExpected: getTotalArtworkCount(),
      presentCount: files.presentCount,
      missingCount: files.missingCount,
      issueCount: hardIssues.length,
    },
  };
}

module.exports = {
  validateBrandIdentity,
  validateManifestStructure,
  validateArtworkFiles,
  validateArtworkFilesAsync,
  validateGeneralPrebuiltArtwork,
};
