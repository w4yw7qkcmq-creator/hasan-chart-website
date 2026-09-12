const fs = require("fs");
const path = require("path");
const {
  ARTWORK_MANIFEST,
  ARTWORK_TECHNICAL_SPEC,
  CATEGORY_ARTWORK_COUNTS,
  FILENAME_PATTERN,
  getPoolBaseDir,
  getTotalArtworkCount,
  listManifestEntries,
  listUnexpectedFilesInCategory,
} = require("./economic-fast-lane-artwork-manifest");

const DEFAULT_MAX_FILE_SIZE_BYTES = 1024 * 1024;

function validateManifestStructure() {
  const issues = [];
  const total = getTotalArtworkCount();
  if (total !== 50) {
    issues.push({ code: "MANIFEST_COUNT_MISMATCH", expected: 50, actual: total });
  }

  const seenPaths = new Set();
  for (const entry of listManifestEntries()) {
    if (!FILENAME_PATTERN.test(entry.filename)) {
      issues.push({ code: "INVALID_FILENAME", path: entry.relativePath });
    }
    if (seenPaths.has(entry.relativePath)) {
      issues.push({ code: "DUPLICATE_MANIFEST_PATH", path: entry.relativePath });
    }
    seenPaths.add(entry.relativePath);
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

function validateEconomicFastLaneArtwork(options = {}) {
  const structure = validateManifestStructure();
  const files = validateArtworkFiles(options);
  const hardIssues = [...structure.issues, ...files.issues.filter((issue) => issue.severity !== "warning")];
  return {
    ok: structure.ok && files.ok,
    structure,
    files,
    summary: {
      totalExpected: getTotalArtworkCount(),
      presentCount: files.presentCount,
      missingCount: files.missingCount,
      issueCount: hardIssues.length,
    },
  };
}

module.exports = {
  validateManifestStructure,
  validateArtworkFiles,
  validateEconomicFastLaneArtwork,
};
