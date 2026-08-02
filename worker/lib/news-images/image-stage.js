const IMAGE_STAGE_RAW = "raw_background";
const IMAGE_STAGE_COMPOSED = "composed_final";

function createRawBackgroundMetadata(extra = {}) {
  return {
    imageStage: IMAGE_STAGE_RAW,
    hasBrandOverlay: false,
    hasOfficialTitleOverlay: false,
    ...extra,
  };
}

function createComposedFinalMetadata(extra = {}) {
  return {
    imageStage: IMAGE_STAGE_COMPOSED,
    hasBrandOverlay: true,
    hasOfficialTitleOverlay: true,
    ...extra,
  };
}

function assertComposerInput(metadata = {}) {
  const issues = [];

  if (metadata.imageStage && metadata.imageStage !== IMAGE_STAGE_RAW) {
    issues.push("imageStage_not_raw_background");
  }
  if (metadata.hasBrandOverlay === true) {
    issues.push("hasBrandOverlay_true");
  }
  if (metadata.hasOfficialTitleOverlay === true) {
    issues.push("hasOfficialTitleOverlay_true");
  }

  if (issues.length > 0) {
    return {
      ok: false,
      reason: "COMPOSER_INPUT_ALREADY_COMPOSED_REJECTED",
      issues,
    };
  }

  return { ok: true, issues: [] };
}

function assertSingleBrandOverlay(svg = "", expectedSubtitle = null) {
  const text = String(svg);
  const enMatches = text.match(/>EN</g) || [];
  const brandMatches = text.match(/Economic Newsi/g) || [];
  const subtitleElements = text.match(/font-size="15"[^>]*>([^<]+)</g) || [];

  const issues = [];
  if (enMatches.length !== 1) {
    issues.push(`en_count_${enMatches.length}`);
  }
  if (brandMatches.length !== 1) {
    issues.push(`brand_count_${brandMatches.length}`);
  }
  if (expectedSubtitle) {
    const subtitleMatches = text.match(new RegExp(expectedSubtitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || [];
    if (subtitleMatches.length !== 1) {
      issues.push(`subtitle_count_${subtitleMatches.length}`);
    }
  } else if (subtitleElements.length !== 1) {
    issues.push(`subtitle_element_count_${subtitleElements.length}`);
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: {
      en: enMatches.length,
      brand: brandMatches.length,
      subtitle: expectedSubtitle
        ? (text.match(new RegExp(expectedSubtitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
        : subtitleElements.length,
    },
  };
}

function assertSingleOfficialHeadline(svg = "", headlineLines = []) {
  const text = String(svg);
  const issues = [];
  for (const line of headlineLines) {
    const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.match(new RegExp(escaped, "g")) || [];
    if (matches.length !== 1) {
      issues.push(`headline_line_count_${line}_${matches.length}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  IMAGE_STAGE_RAW,
  IMAGE_STAGE_COMPOSED,
  createRawBackgroundMetadata,
  createComposedFinalMetadata,
  assertComposerInput,
  assertSingleBrandOverlay,
  assertSingleOfficialHeadline,
};
