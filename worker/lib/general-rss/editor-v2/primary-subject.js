/**
 * Primary subject resolution — headline protagonist must not be replaced by comparators.
 */

const { findFxPairsInText, isTechnicalAnalysisTitle, personAppearsInTitle } = require("./evidence-scope");
const { ACTION_CLASSES } = require("./action-resolution");

const COMPANY_ENTITIES = Object.freeze([
  { id: "amd", pattern: /\bamd\b/i, label: "AMD", arabic: "AMD" },
  { id: "nvidia", pattern: /\bnvidia\b/i, label: "Nvidia", arabic: "إنفيديا" },
  { id: "intel", pattern: /\bintel\b/i, label: "Intel", arabic: "إنتل" },
  { id: "zerohash", pattern: /\bzerohash\b/i, label: "Zerohash", arabic: "Zerohash" },
  { id: "layerzero", pattern: /\blayerzero\b/i, label: "LayerZero", arabic: "LayerZero" },
  { id: "coinbase", pattern: /\bcoinbase\b/i, label: "Coinbase", arabic: "كوينبيس" },
]);

const INSTITUTION_ENTITIES = Object.freeze([
  { id: "boj", pattern: /\bboj\b|bank of japan/i, label: "Bank of Japan", arabic: "بنك اليابان" },
  { id: "ecb", pattern: /\becb\b|european central bank/i, label: "ECB", arabic: "البنك المركزي الأوروبي" },
  { id: "fed", pattern: /\bfed\b|federal reserve/i, label: "Federal Reserve", arabic: "الاحتياطي الفيدرالي" },
  { id: "bok", pattern: /bank of korea/i, label: "Bank of Korea", arabic: "بنك كوريا" },
  { id: "pboc", pattern: /\bpboc\b|people'?s bank of china/i, label: "PBOC", arabic: "البنك المركزي الصيني" },
]);

const GEO_ENTITIES = Object.freeze([
  { id: "canada", pattern: /\bcanada\b/i, label: "Canada", arabic: "كندا" },
  { id: "iran", pattern: /\biran\b/i, label: "Iran", arabic: "إيران" },
  { id: "us", pattern: /\bu\.?s\.?\b|united states/i, label: "United States", arabic: "الولايات المتحدة" },
]);

const INSTRUMENT_ENTITIES = Object.freeze([
  { id: "oil", pattern: /\boil\b|crude|brent|wti|النفط/i, label: "Oil", arabic: "النفط" },
  { id: "gold", pattern: /\bgold\b|الذهب/i, label: "Gold", arabic: "الذهب" },
  { id: "bitcoin", pattern: /\bbitcoin\b|\bbtc\b/i, label: "Bitcoin", arabic: "البيتكوين" },
  { id: "sp500", pattern: /s&p\s*500|sp500/i, label: "S&P 500", arabic: "مؤشر S&P 500" },
]);

function findEntitiesInText(text = "", registry = []) {
  return registry.filter((entry) => entry.pattern.test(text)).map((entry) => ({ ...entry }));
}

function resolvePrimarySubject(evidence = {}, facts = {}, action = {}) {
  const title = String(evidence.title || "").trim();
  const snippet = String(evidence.description || evidence.contentEncoded || "").trim();
  const combined = `${title}\n${snippet}`;

  const whyBeatMatch = title.match(/\bwhy\s+([A-Z][A-Za-z0-9&]+)\s+can\s+beat\b/i);
  if (whyBeatMatch) {
    const name = whyBeatMatch[1];
    const company = COMPANY_ENTITIES.find((e) => e.pattern.test(name));
    return {
      id: company?.id || name.toLowerCase(),
      label: company?.label || name,
      arabic: company?.arabic || name,
      comparators: findEntitiesInText(title, COMPANY_ENTITIES).filter((e) => e.label !== (company?.label || name)),
      kind: "company",
    };
  }

  if (isTechnicalAnalysisTitle(title)) {
    const pairs = findFxPairsInText(title);
    if (pairs.length) {
      return {
        id: "fx_pairs",
        label: pairs.map((p) => p.label).join(", "),
        arabic: pairs.map((p) => p.arabic).join(" و"),
        comparators: [],
        kind: "fx",
      };
    }
  }

  const primaryPerson = (facts.people || []).find((person) => personAppearsInTitle(person, title));
  if (primaryPerson?.name && /\bsaid\b|\bsays\b|\bwarns\b|\bannounces\b/i.test(combined)) {
    return {
      id: primaryPerson.id || primaryPerson.name,
      label: primaryPerson.name,
      arabic: `${primaryPerson.arabicRole ? `${primaryPerson.arabicRole} ` : ""}${primaryPerson.name}`.trim(),
      comparators: [],
      kind: "person",
    };
  }

  for (const registry of [COMPANY_ENTITIES, INSTITUTION_ENTITIES]) {
    const inTitle = findEntitiesInText(title, registry);
    if (inTitle.length) {
      return {
        id: inTitle[0].id,
        label: inTitle[0].label,
        arabic: inTitle[0].arabic,
        comparators: inTitle.slice(1),
        kind: registry === COMPANY_ENTITIES ? "company" : "institution",
      };
    }
  }

  if ([ACTION_CLASSES.FALL, ACTION_CLASSES.RISE, ACTION_CLASSES.DROP, ACTION_CLASSES.SURGE].includes(action.actionClass)) {
    const instrument = findEntitiesInText(combined, INSTRUMENT_ENTITIES);
    if (instrument.length) {
      return {
        id: instrument[0].id,
        label: instrument[0].label,
        arabic: instrument[0].arabic,
        comparators: instrument.slice(1),
        kind: "instrument",
      };
    }
  }

  for (const registry of [GEO_ENTITIES]) {
    const inTitle = findEntitiesInText(title, registry);
    if (inTitle.length) {
      return {
        id: inTitle[0].id,
        label: inTitle[0].label,
        arabic: inTitle[0].arabic,
        comparators: inTitle.slice(1),
        kind: "geo",
      };
    }
  }

  if ([ACTION_CLASSES.COUNTER_TARIFF, ACTION_CLASSES.TARIFF].includes(action.actionClass)) {
    const geo = findEntitiesInText(combined, GEO_ENTITIES);
    if (geo.length) {
      return { id: geo[0].id, label: geo[0].label, arabic: geo[0].arabic, comparators: [], kind: "geo" };
    }
  }

  for (const org of facts.organizations || []) {
    const label = String(org || "").trim();
    if (label && new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(title)) {
      return { id: label.toLowerCase(), label, arabic: label, comparators: [], kind: "organization" };
    }
  }

  const instrument = findEntitiesInText(combined, INSTRUMENT_ENTITIES);
  if (instrument.length) {
    return {
      id: instrument[0].id,
      label: instrument[0].label,
      arabic: instrument[0].arabic,
      comparators: instrument.slice(1),
      kind: "instrument",
    };
  }

  return { id: null, label: "", arabic: "", comparators: [], kind: "unknown" };
}

function primarySubjectMismatch(primarySubject = {}, editorialText = "") {
  const text = String(editorialText || "");
  if (!primarySubject?.label) return null;

  for (const comp of primarySubject.comparators || []) {
    const compPattern = new RegExp(comp.arabic || comp.label, "iu");
    const primaryPattern = new RegExp(primarySubject.arabic || primarySubject.label, "iu");
    if (compPattern.test(text) && !primaryPattern.test(text)) {
      return "V2_PRIMARY_SUBJECT_MISMATCH";
    }
  }

  if (primarySubject.id === "amd" && /إنفيديا|nvidia/i.test(text) && !/amd/i.test(text)) {
    return "V2_PRIMARY_SUBJECT_MISMATCH";
  }
  if (primarySubject.id === "zerohash" && /إعلام|اتصالات|comcast/i.test(text) && !/zerohash/i.test(text)) {
    return "V2_PRIMARY_SUBJECT_MISMATCH";
  }

  return null;
}

module.exports = {
  COMPANY_ENTITIES,
  INSTITUTION_ENTITIES,
  GEO_ENTITIES,
  INSTRUMENT_ENTITIES,
  resolvePrimarySubject,
  primarySubjectMismatch,
  findEntitiesInText,
};
