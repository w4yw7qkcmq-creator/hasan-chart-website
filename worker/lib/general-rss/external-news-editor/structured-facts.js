const { matchOfficialInText, getFedChairOfficial, normalizeLookup } = require("./entity-registry");
const { extractNumericTokens } = require("./numeric-utils");
const {
  extractQuoteSegments,
  extractAttributionSegments,
  UNCERTAINTY_PATTERNS,
} = require("./source-evidence");

function extractRoleFromSourceText(text = "", official = null) {
  const normalized = normalizeLookup(text);
  if (!official) return null;
  if (/minneapolis fed president|president of the minneapolis fed/.test(normalized) && official.id === "NEEL_KASHKARI") {
    return official.role;
  }
  if (/federal reserve chair|fed chair/.test(normalized) && official.chairStatus) {
    return official.role;
  }
  if (/president/.test(normalized) && official.regionalBank) {
    return official.role;
  }
  if (/governor/.test(normalized) && /governor/.test(normalizeLookup(official.role))) {
    return official.role;
  }
  return official.role;
}

function extractStructuredSourceFacts(evidence = {}) {
  const text = [evidence.sourceTitle, evidence.sourceSnippet, evidence.contentEncodedText]
    .filter(Boolean)
    .join("\n");
  const people = matchOfficialInText(text).map((official) => ({
    id: official.id,
    name: official.canonicalName,
    institution: official.institution,
    role: extractRoleFromSourceText(text, official),
    arabicRole: official.arabicRole,
    chairStatus: official.chairStatus,
  }));

  const attributions = extractAttributionSegments(text).map((segment) => {
    const matched = matchOfficialInText(segment.person || segment.raw);
    return {
      person: matched[0]?.canonicalName || segment.person,
      role: matched[0] ? extractRoleFromSourceText(text, matched[0]) : null,
      statementHint: segment.raw,
    };
  });

  return {
    people,
    organizations: evidence.organizationCandidates || [],
    numbers: extractNumericTokens(text),
    quotes: extractQuoteSegments(text),
    attributions,
    uncertaintyPresent: UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(text)),
    fedChair: getFedChairOfficial(),
    sourceTextLength: text.length,
  };
}

module.exports = {
  extractStructuredSourceFacts,
  extractRoleFromSourceText,
};
