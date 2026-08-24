const { buildRawSourceText } = require("../editorial-safety");
const { extractNumericTokens } = require("./numeric-utils");
const { matchOfficialInText } = require("./entity-registry");

const UNCERTAINTY_PATTERNS = [
  /\bmay\b/i,
  /\bmight\b/i,
  /\bcould\b/i,
  /\blikely\b/i,
  /\breportedly\b/i,
  /\baccording to\b/i,
  /\bexpected\b/i,
  /\bpossible\b/i,
  /\buncertain\b/i,
  /\bappears\b/i,
  /\bseems\b/i,
];

const CERTAINTY_UPGRADE_PATTERNS = [
  /أكد/u,
  /أكدت/u,
  /حسم/u,
  /بالتأكيد/u,
  /سيحدث/u,
  /سيرتفع/u,
  /سينخفض/u,
  /حدث/u,
];

const ORGANIZATION_PATTERNS = [
  { name: "Federal Reserve", pattern: /federal reserve|fed\b|الاحتياطي الفيدرالي/i },
  { name: "ECB", pattern: /european central bank|\becb\b|البنك المركزي الأوروبي/i },
  { name: "Bank of England", pattern: /bank of england|\bboe\b|بنك إngland|بنك england/i },
];

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuoteSegments(text = "") {
  const segments = [];
  const direct = String(text || "").match(/"([^"]{8,200})"|“([^”]{8,200})”|'([^']{8,200})'/g) || [];
  for (const quote of direct) {
    segments.push({ type: "direct", text: quote.replace(/^["'“]|["'”]$/g, "") });
  }
  return segments;
}

function extractAttributionSegments(text = "") {
  const segments = [];
  const patterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+said/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}),\s*(?:president|ceo|chair|governor)/gi,
    /(Minneapolis Fed President Neel Kashkari)/gi,
    /(Federal Reserve Chair Kevin Warsh)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of String(text || "").matchAll(pattern)) {
      segments.push({ person: match[1] || match[0], raw: match[0] });
    }
  }
  return segments;
}

function extractRssSourceEvidence(item = {}, source = "") {
  const sourceTitle = String(item.title || "").trim();
  const sourceSnippet = String(item.contentSnippet || item.summary || item.description || "").trim();
  const contentEncodedText = stripHtml(item.contentEncoded || item["content:encoded"] || "");
  const articleCanonicalUrl = String(item.link || item.guid || "").trim();
  const combined = [sourceTitle, sourceSnippet, contentEncodedText].filter(Boolean).join("\n");
  const sourceTextNormalized = combined.replace(/\s+/g, " ").trim();

  return {
    source: source || item.sourceName || "unknown",
    sourceTitle,
    sourceSnippet,
    contentEncodedText,
    articleCanonicalUrl,
    peopleCandidates: matchOfficialInText(combined),
    organizationCandidates: ORGANIZATION_PATTERNS.filter((org) => org.pattern.test(combined)).map((org) => org.name),
    numericTokens: extractNumericTokens(combined),
    currencyTokens: extractNumericTokens(combined).filter((token) => /[$€£¥]/.test(token.raw)),
    quoteSegments: extractQuoteSegments(combined),
    attributionSegments: extractAttributionSegments(combined),
    uncertaintyMarkers: UNCERTAINTY_PATTERNS.filter((pattern) => pattern.test(combined)).map((pattern) => pattern.source),
    sourceTextNormalized,
    rawSourceText: buildRawSourceText(item),
  };
}

module.exports = {
  UNCERTAINTY_PATTERNS,
  CERTAINTY_UPGRADE_PATTERNS,
  extractRssSourceEvidence,
  extractQuoteSegments,
  extractAttributionSegments,
};
