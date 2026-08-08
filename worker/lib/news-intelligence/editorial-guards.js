const BLOCK_REASONS = {
  EDITORIAL_OUTPUT_INVALID: "EDITORIAL_OUTPUT_INVALID",
  RAW_TEXT_FALLBACK_FORBIDDEN: "RAW_TEXT_FALLBACK_FORBIDDEN",
  FACT_INTEGRITY_FAILED: "FACT_INTEGRITY_FAILED",
  RSS_ECONOMIC_PUBLISH_FORBIDDEN: "RSS_ECONOMIC_PUBLISH_FORBIDDEN",
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateEditorialOutput(publication = {}) {
  const body = String(publication.body || "").trim();
  const title = String(publication.title || "").trim();

  if (!body || body.length < 40) {
    return { ok: false, reason: BLOCK_REASONS.EDITORIAL_OUTPUT_INVALID, issues: ["body_too_short"] };
  }

  if (!title) {
    return { ok: false, reason: BLOCK_REASONS.EDITORIAL_OUTPUT_INVALID, issues: ["missing_title"] };
  }

  if (publication.usedRawFallback === true) {
    return { ok: false, reason: BLOCK_REASONS.RAW_TEXT_FALLBACK_FORBIDDEN, issues: ["used_raw_fallback_flag"] };
  }

  const rawCandidates = [
    publication.rawSourceText,
    publication.metadata?.rawSourceText,
    publication.metadata?.sourceText,
  ].filter(isNonEmptyString);

  for (const raw of rawCandidates) {
    if (raw.trim() === body) {
      return { ok: false, reason: BLOCK_REASONS.RAW_TEXT_FALLBACK_FORBIDDEN, issues: ["body_equals_raw_source"] };
    }
  }

  if (publication.bodySource === "raw" || publication.bodySource === "source") {
    return { ok: false, reason: BLOCK_REASONS.RAW_TEXT_FALLBACK_FORBIDDEN, issues: ["body_source_raw"] };
  }

  return { ok: true, body, title };
}

function detectRawFallbackPattern(body, formatted, raw) {
  const finalBody = String(body || "").trim();
  const formattedBody = String(formatted || "").trim();
  const rawBody = String(raw || "").trim();

  if (rawBody && finalBody === rawBody) {
    return { blocked: true, reason: BLOCK_REASONS.RAW_TEXT_FALLBACK_FORBIDDEN };
  }

  if (formattedBody) {
    return { blocked: false };
  }

  if (rawBody && finalBody && !formattedBody) {
    return { blocked: true, reason: BLOCK_REASONS.RAW_TEXT_FALLBACK_FORBIDDEN };
  }

  return { blocked: false };
}

function extractNumericTokens(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .match(/-?\d+(?:\.\d+)?(?:K|M|B|%)?/g) || [];
}

function validateFactIntegrity(publicationFacts = {}, canonicalFacts = {}) {
  const fields = ["actual", "forecast", "previous"];
  const mismatches = [];

  for (const field of fields) {
    const pubValue = publicationFacts[field];
    const canonValue = canonicalFacts[field];
    if (!pubValue || !canonValue) {
      continue;
    }

    const pubTokens = extractNumericTokens(pubValue);
    const canonTokens = extractNumericTokens(canonValue);
    if (!pubTokens.length || !canonTokens.length) {
      continue;
    }

    const pubPrimary = pubTokens[0];
    const canonPrimary = canonTokens[0];
    if (pubPrimary !== canonPrimary) {
      mismatches.push({ field, expected: canonPrimary, actual: pubPrimary });
    }
  }

  if (mismatches.length) {
    return {
      ok: false,
      reason: BLOCK_REASONS.FACT_INTEGRITY_FAILED,
      mismatches,
    };
  }

  return { ok: true };
}

module.exports = {
  BLOCK_REASONS,
  validateEditorialOutput,
  detectRawFallbackPattern,
  validateFactIntegrity,
};
