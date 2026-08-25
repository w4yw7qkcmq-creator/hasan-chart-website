const MATERIAL_DEVELOPMENT_PATTERN =
  /\b(?:surge|jump|fall|drop|plunge|rally|selloff|decline|rise|gain|lose|hike|cut|hold|unchanged|beat|miss|guidance|earnings|revenue|profit|sanction|tariff|approval|decision|warns|announces|reports|confirms|escalat|threaten|impose|deal|vote|approve|deny|halt|suspend|resume|default|bankruptcy|ipo|merger|acquisition|liquidation|inflation|recession|cpi|ppi|nfp|gdp|pmi|fomc|payroll|jobless|expected|forecast|probability|odds|split|coin toss|await|speech|keynote|buyback|stablecoin|debuts|launches|worth|billion|million|percent|%\b|rate call|rate decision|central bank|fed chair|treasury yield|oil price|gold|bitcoin|crypto|dollar|yen|stocks?)\b|هبوط|ارتفاع|قرار|إعلان|تصعيد|عقوب|فائدة|أرباح|إيرادات/i;

const SUBJECT_PATTERN =
  /\b(?:bank|fed|ecb|boj|pboc|treasury|company|ceo|president|chair|minister|regulator|court|congress|parliament|analyst|investor|market|stock|bond|yield|oil|gold|bitcoin|crypto|dollar|yen|euro|nvidia|apple|meta|trump|iran|china|korea|japan)\b/i;

const EVIDENCE_SUFFICIENCY = Object.freeze({
  SUFFICIENT_FULL: "SUFFICIENT_FULL",
  SUFFICIENT_MINIMAL: "SUFFICIENT_MINIMAL",
  INSUFFICIENT: "INSUFFICIENT",
});

function hasClearDevelopment(text = "") {
  return MATERIAL_DEVELOPMENT_PATTERN.test(text);
}

function hasIdentifiableSubject(text = "") {
  return SUBJECT_PATTERN.test(text) || /[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/.test(text);
}

function classifyEvidenceSufficiency(evidence = {}) {
  const title = String(evidence.title || "").trim();
  const description = String(evidence.description || "").trim();
  const contentEncoded = String(evidence.contentEncoded || "").trim();
  const snippet = description || contentEncoded;
  const combined = [title, snippet].filter(Boolean).join("\n");

  if (!title || title.length < 10) {
    return { level: EVIDENCE_SUFFICIENCY.INSUFFICIENT, reason: "missing_title" };
  }

  const combinedLength = combined.replace(/\s+/g, " ").length;
  const titleAloneDevelopment = hasClearDevelopment(title) && hasIdentifiableSubject(title);
  const combinedDevelopment = hasClearDevelopment(combined) && hasIdentifiableSubject(combined);

  if (!combinedDevelopment && !titleAloneDevelopment) {
    if (title.length < 50 && (!snippet || snippet.length < 35)) {
      return { level: EVIDENCE_SUFFICIENCY.INSUFFICIENT, reason: "teaser_only" };
    }
    return { level: EVIDENCE_SUFFICIENCY.INSUFFICIENT, reason: "no_clear_development" };
  }

  if (combinedLength >= 160 && combinedDevelopment) {
    return { level: EVIDENCE_SUFFICIENCY.SUFFICIENT_FULL, reason: null };
  }

  return { level: EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL, reason: null };
}

function isEvidenceSufficientForEditorial(level = "") {
  return (
    level === EVIDENCE_SUFFICIENCY.SUFFICIENT_FULL || level === EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL
  );
}

function shouldOverrideAiInsufficientEvidence(sufficiencyLevel = "", editorial = {}) {
  if (!isEvidenceSufficientForEditorial(sufficiencyLevel)) return false;
  const headline = String(editorial.headline || "").trim();
  const body = String(editorial.body || "").trim();
  return Boolean(headline && body && headline.length >= 8 && body.length >= 20);
}

module.exports = {
  EVIDENCE_SUFFICIENCY,
  classifyEvidenceSufficiency,
  isEvidenceSufficientForEditorial,
  shouldOverrideAiInsufficientEvidence,
  hasClearDevelopment,
};
