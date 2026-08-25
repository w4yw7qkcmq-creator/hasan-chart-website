const { buildRawSourceText } = require("../editorial-safety");
const { extractRssSourceEvidence } = require("../external-news-editor/source-evidence");
const { extractNumericTokens } = require("../external-news-editor/numeric-utils");
const { matchOfficialInText } = require("../external-news-editor/entity-registry");

function detectSourceLanguage(text = "") {
  const arabicChars = (String(text || "").match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (String(text || "").match(/[A-Za-z]/g) || []).length;
  if (arabicChars > latinChars * 1.5) return "ar";
  if (latinChars > 0) return "en";
  return "unknown";
}

function buildCanonicalRssEvidence(item = {}, source = "") {
  const base = extractRssSourceEvidence(item, source || item.sourceName);
  const description = String(item.contentSnippet || item.summary || item.description || base.sourceSnippet || "").trim();
  const contentEncoded = String(base.contentEncodedText || "").trim();
  const combined = [base.sourceTitle, description, contentEncoded].filter(Boolean).join("\n");
  const numbers = extractNumericTokens(combined);
  const people = matchOfficialInText(combined).map((official) => ({
    id: official.id,
    name: official.canonicalName,
    role: official.role,
    arabicRole: official.arabicRole,
    institution: official.institution,
    chairStatus: official.chairStatus,
  }));

  return Object.freeze({
    source: base.source || source || item.sourceName || "unknown",
    sourceUrl: base.articleCanonicalUrl || String(item.link || "").trim(),
    title: base.sourceTitle,
    description,
    contentEncoded,
    publishedAt: item.isoDate || item.pubDate || item.articlePublishedAt || null,
    people,
    organizations: base.organizationCandidates || [],
    instruments: [],
    numbers: numbers.map((entry) => entry.raw),
    percentages: numbers.filter((entry) => entry.isPercent).map((entry) => entry.raw),
    currencies: base.currencyTokens?.map((entry) => entry.raw) || [],
    quotes: (base.quoteSegments || []).map((entry) => entry.text),
    attribution: (base.attributionSegments || []).map((entry) => ({
      person: entry.person,
      raw: entry.raw,
    })),
    uncertaintyMarkers: base.uncertaintyMarkers || [],
    sourceLanguage: detectSourceLanguage(combined),
    sourceTextNormalized: base.sourceTextNormalized,
    rawSourceText: base.rawSourceText || buildRawSourceText(item),
  });
}

module.exports = {
  buildCanonicalRssEvidence,
  detectSourceLanguage,
};
