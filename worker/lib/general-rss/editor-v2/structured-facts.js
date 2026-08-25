const { extractStructuredSourceFacts, extractRoleFromSourceText } = require("../external-news-editor/structured-facts");
const { extractNumericTokens } = require("../external-news-editor/numeric-utils");
const { matchOfficialInText, normalizeLookup, isFedChairTitlePhrase } = require("../external-news-editor/entity-registry");
const { UNCERTAINTY_PATTERNS } = require("../external-news-editor/source-evidence");

const ARABIC_UNCERTAINTY_PATTERNS = [
  /قد/u,
  /ربما/u,
  /من المتوقع/u,
  /بحسب/u,
  /وفق(?:اً)?/u,
  /يُتوقع/u,
  /يمكن/u,
  /محتمل/u,
];

const INSTRUMENT_PATTERNS = [
  { id: "gold", pattern: /\bgold\b|xau|الذهب/i },
  { id: "oil", pattern: /\boil\b|crude|brent|wti|النفط|برنت/i },
  { id: "bitcoin", pattern: /\bbitcoin\b|\bbtc\b|البيتكوين|بيتكوين/i },
  { id: "nasdaq", pattern: /nasdaq|ناسdaq|ناسداك/i },
  { id: "dow", pattern: /dow jones|داو/i },
  { id: "sp500", pattern: /s&p 500|sp500/i },
  { id: "nvidia", pattern: /\bnvidia\b|إنفيديا|انفيديا/i },
];

function extractInstruments(text = "") {
  return INSTRUMENT_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.id);
}

function extractUncertaintyMarkers(text = "") {
  const markers = [];
  for (const pattern of UNCERTAINTY_PATTERNS) {
    if (pattern.test(text)) markers.push(pattern.source);
  }
  for (const pattern of ARABIC_UNCERTAINTY_PATTERNS) {
    if (pattern.test(text)) markers.push(String(pattern));
  }
  return [...new Set(markers)];
}

function detectEntityRoleConflicts(evidence = {}, facts = {}) {
  const text = [evidence.title, evidence.description, evidence.contentEncoded].filter(Boolean).join("\n");
  const normalized = normalizeLookup(text);
  const conflicts = [];

  for (const person of facts.people || []) {
    const official = matchOfficialInText(person.name || person.id).find((entry) => entry.id === person.id);
    if (!official) continue;

    const sourceSaysChair = /federal reserve chair|fed chair|رئيس الاحتياطي الفيدرالي/.test(normalized);
    const sourceSaysRegional =
      /minneapolis fed president|president of the minneapolis fed|رئيس بنك الاحتياطي الفيدرالي في مينيابولis|مينيابولis fed president|minneapolis fed/i.test(
        normalized
      );

    if (official.id === "NEEL_KASHKARI" && sourceSaysChair && !sourceSaysRegional) {
      conflicts.push({
        personId: official.id,
        sourceRole: "fed_chair",
        registryRole: official.role,
        code: "ENTITY_ROLE_CONFLICT",
      });
    }

    if (official.chairStatus && sourceSaysRegional && !sourceSaysChair) {
      conflicts.push({
        personId: official.id,
        sourceRole: "regional_president",
        registryRole: official.role,
        code: "ENTITY_ROLE_CONFLICT",
      });
    }

    const sourceRole = extractRoleFromSourceText(text, official);
    if (sourceRole && person.role && normalizeLookup(sourceRole) !== normalizeLookup(person.role)) {
      if (isFedChairTitlePhrase(sourceRole) !== isFedChairTitlePhrase(person.role)) {
        conflicts.push({
          personId: official.id,
          sourceRole,
          registryRole: person.role,
          code: "ENTITY_ROLE_CONFLICT",
        });
      }
    }
  }

  return conflicts;
}

function buildStructuredFactsV2(evidence = {}) {
  const legacyEvidence = {
    source: evidence.source,
    sourceTitle: evidence.title,
    sourceSnippet: evidence.description,
    contentEncodedText: evidence.contentEncoded,
    articleCanonicalUrl: evidence.sourceUrl,
    organizationCandidates: evidence.organizations,
    numericTokens: extractNumericTokens(
      [evidence.title, evidence.description, evidence.contentEncoded].filter(Boolean).join("\n")
    ),
    rawSourceText: evidence.rawSourceText,
    sourceTextNormalized: evidence.sourceTextNormalized,
    uncertaintyMarkers: evidence.uncertaintyMarkers,
    attributionSegments: evidence.attribution,
    quoteSegments: (evidence.quotes || []).map((text) => ({ type: "direct", text })),
  };

  const baseFacts = extractStructuredSourceFacts(legacyEvidence);
  const combined = [evidence.title, evidence.description, evidence.contentEncoded].filter(Boolean).join("\n");

  return Object.freeze({
    people: baseFacts.people || [],
    organizations: baseFacts.organizations || evidence.organizations || [],
    instruments: extractInstruments(combined),
    numbers: baseFacts.numbers || extractNumericTokens(combined),
    percentages: (baseFacts.numbers || extractNumericTokens(combined)).filter((entry) => entry.isPercent),
    currencies: evidence.currencies || [],
    quotes: baseFacts.quotes || [],
    attributions: baseFacts.attributions || [],
    uncertaintyPresent: baseFacts.uncertaintyPresent || extractUncertaintyMarkers(combined).length > 0,
    uncertaintyMarkers: extractUncertaintyMarkers(combined),
    fedChair: baseFacts.fedChair || null,
    sourceTextLength: combined.length,
    roleConflicts: detectEntityRoleConflicts(evidence, baseFacts),
  });
}

module.exports = {
  buildStructuredFactsV2,
  detectEntityRoleConflicts,
  extractInstruments,
  extractUncertaintyMarkers,
};
