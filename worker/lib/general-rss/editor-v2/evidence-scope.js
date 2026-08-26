/**
 * Title-primary evidence scoping — prevents RSS snippet bleed from adjacent stories.
 */

const FX_PAIR_PATTERNS = Object.freeze([
  { id: "eurusd", pattern: /\bEURUSD\b/i, label: "EUR/USD", arabic: "EUR/USD" },
  { id: "usdjpy", pattern: /\bUSDJPY\b/i, label: "USD/JPY", arabic: "USD/JPY" },
  { id: "gbpusd", pattern: /\bGBPUSD\b/i, label: "GBP/USD", arabic: "GBP/USD" },
]);

function isTechnicalAnalysisTitle(title = "") {
  const t = String(title || "");
  return (
    /\btechnical\s+(?:look|analysis)\b/i.test(t) ||
    /\bbias,\s*risk\s+and\s+targets\b/i.test(t) ||
    /\bkickstart\s+the\s+trading\s+day\b/i.test(t) ||
    (/\bEURUSD\b/i.test(t) && /\bUSDJPY\b/i.test(t))
  );
}

function findFxPairsInText(text = "") {
  return FX_PAIR_PATTERNS.filter((entry) => entry.pattern.test(text)).map((entry) => ({ ...entry }));
}

function personAppearsInTitle(person = {}, title = "") {
  const name = String(person.name || person.id || "").trim();
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(String(title || ""));
}

function entityLabelInText(label = "", text = "") {
  if (!label) return false;
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(String(text || ""));
}

function collectAllowedEntityLabels(evidence = {}, facts = {}) {
  const title = String(evidence.title || "").trim();
  const allowed = new Set();

  for (const person of facts.people || []) {
    if (personAppearsInTitle(person, title)) {
      allowed.add(String(person.name || "").trim());
      if (person.arabicRole) allowed.add(String(person.arabicRole).trim());
    }
  }

  for (const org of facts.organizations || []) {
    const label = String(org || "").trim();
    if (entityLabelInText(label, title)) allowed.add(label);
  }

  for (const pair of findFxPairsInText(title)) {
    allowed.add(pair.label);
    allowed.add(pair.arabic);
  }

  const instrumentLabels = {
    oil: ["Oil", "النفط"],
    gold: ["Gold", "الذهب"],
    bitcoin: ["Bitcoin", "البيتكوين"],
    sp500: ["S&P 500", "مؤشر S&P 500"],
  };
  for (const id of facts.instruments || []) {
    for (const label of instrumentLabels[id] || []) {
      if (entityLabelInText(label, title)) allowed.add(label);
    }
  }

  return allowed;
}

function outputContainsUnsupportedEntity(text = "", allowedLabels = new Set(), evidence = {}) {
  const title = String(evidence.title || "");
  const { matchOfficialInText } = require("../external-news-editor/entity-registry");
  const { INSTITUTION_ENTITIES, COMPANY_ENTITIES, findEntitiesInText } = require("./primary-subject");

  for (const official of matchOfficialInText(text)) {
    if (!personAppearsInTitle({ name: official.canonicalName }, title)) {
      const arabicPattern = new RegExp(official.arabicNames?.[0] || official.canonicalName, "iu");
      if (arabicPattern.test(text) || new RegExp(official.canonicalName, "i").test(text)) {
        return { unsupported: official.canonicalName, reason: "person_not_in_title" };
      }
    }
  }

  for (const registry of [INSTITUTION_ENTITIES, COMPANY_ENTITIES]) {
    for (const entity of findEntitiesInText(text, registry)) {
      if (!entityLabelInText(entity.label, title) && new RegExp(entity.arabic || entity.label, "iu").test(text)) {
        return { unsupported: entity.label, reason: "entity_not_in_title" };
      }
    }
  }

  if (isTechnicalAnalysisTitle(title)) {
    if (/Tom Barkin|Barkin|تom barkin|barkin/i.test(text)) {
      return { unsupported: "Tom Barkin", reason: "technical_analysis_contamination" };
    }
    if (/البنك المركزي الأوروبي|ECB sources/i.test(text) && !/\bECB\b/i.test(title)) {
      return { unsupported: "ECB", reason: "technical_analysis_contamination" };
    }
  }

  return null;
}

module.exports = {
  FX_PAIR_PATTERNS,
  isTechnicalAnalysisTitle,
  findFxPairsInText,
  personAppearsInTitle,
  entityLabelInText,
  collectAllowedEntityLabels,
  outputContainsUnsupportedEntity,
};
