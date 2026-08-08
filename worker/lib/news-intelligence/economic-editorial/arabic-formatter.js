const { formatDisplayValue, normalizeEconomicFieldValue } = require("../../economic-releases/normalize");
const { getInterpretationMetadata, getEventArabicName, getFamilyMetadata } = require("./interpretation-registry");

const LTR = "\u2066";
const PDF = "\u2069";

function wrapLtr(value) {
  if (value == null || value === "") {
    return null;
  }
  return `${LTR}${value}${PDF}`;
}

function displayValue(value) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "object" && value.display != null) {
    return formatDisplayValue(value);
  }
  const normalized = normalizeEconomicFieldValue(value);
  return formatDisplayValue(normalized) || String(value).trim() || null;
}

function formatFactLine(label, value) {
  const formatted = displayValue(value);
  if (!formatted) {
    return null;
  }
  return `${label}: ${wrapLtr(formatted)}`;
}

function buildFactsBlock(event = {}) {
  const lines = [];
  const previous = formatFactLine("السابق", event.previous);
  const forecast = formatFactLine("المتوقع", event.forecast);
  const actual = formatFactLine("الحالي", event.actual);
  if (previous) lines.push(previous);
  if (forecast) lines.push(forecast);
  if (actual) lines.push(actual);
  return lines.join("\n");
}

function buildChildFactsBlock(event = {}) {
  const meta = getInterpretationMetadata(event.eventType);
  const label = meta.childLabelAr || getEventArabicName(event.eventType);
  const facts = buildFactsBlock(event);
  if (!facts) {
    return null;
  }
  return `${label}:\n${facts}`;
}

function formatSingleEditorial(editorial = {}) {
  const parts = [];
  parts.push(`🚨 ${editorial.headline}`);
  if (editorial.countryLine) {
    parts.push(editorial.countryLine);
  }
  parts.push("");
  parts.push(editorial.factsBlock);
  if (editorial.interpretation) {
    parts.push("");
    parts.push("📊 القراءة:");
    parts.push(editorial.interpretation);
  }
  if (editorial.marketImpact) {
    parts.push("");
    parts.push("💵 التأثير المحتمل:");
    parts.push(editorial.marketImpact);
  }
  return parts.filter((line) => line != null && line !== "").join("\n").trim();
}

function formatFamilyEditorial(editorial = {}) {
  const parts = [];
  parts.push(`🚨 ${editorial.headline}`);
  if (editorial.countryLine) {
    parts.push(editorial.countryLine);
  }
  parts.push("");
  for (const child of editorial.children || []) {
    const block = buildChildFactsBlock(child);
    if (block) {
      parts.push(block);
      parts.push("");
    }
  }
  if (editorial.interpretation) {
    parts.push("📊 القراءة:");
    parts.push(editorial.interpretation);
  }
  if (editorial.marketImpact) {
    parts.push("");
    parts.push("💵 التأثير المحتمل:");
    parts.push(editorial.marketImpact);
  }
  return parts.filter((line) => line != null && line !== "").join("\n").trim();
}

function buildCountryLine(country = "US") {
  if (country === "US") {
    return "الولايات المتحدة 🇺🇸";
  }
  return country;
}

function buildSingleStructuredOutput(event, interpretation) {
  return {
    headline: getEventArabicName(event.eventType),
    countryLine: buildCountryLine(event.country),
    factsBlock: buildFactsBlock(event),
    interpretation: interpretation.interpretationLine,
    marketImpact: interpretation.impactLine,
    importance: getInterpretationMetadata(event.eventType).importance,
    visualPriority: getInterpretationMetadata(event.eventType).visualPriority || "OPTIONAL",
    editorialVersion: "phase2-v1",
    children: null,
  };
}

function buildFamilyStructuredOutput(family, events, familyInterpretation) {
  const familyMeta = getFamilyMetadata(family) || {};
  return {
    headline: familyMeta.headlineAr || "بيانات اقتصادية",
    countryLine: buildCountryLine(events[0]?.country || "US"),
    factsBlock: null,
    interpretation: familyInterpretation.familyInterpretation,
    marketImpact: familyInterpretation.familyImpact,
    importance: familyMeta.importance || "HIGH",
    visualPriority: familyMeta.visualPriority || "REQUIRED",
    editorialVersion: "phase2-v1-family",
    children: events,
    familyUsdBias: familyInterpretation.familyUsdBias,
  };
}

module.exports = {
  buildFactsBlock,
  buildChildFactsBlock,
  formatSingleEditorial,
  formatFamilyEditorial,
  buildCountryLine,
  buildSingleStructuredOutput,
  buildFamilyStructuredOutput,
};
