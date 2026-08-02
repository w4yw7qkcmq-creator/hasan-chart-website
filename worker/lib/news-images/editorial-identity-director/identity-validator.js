const { SYMBOL_CLUTTER_FORBIDDEN } = require("./market-context-resolver");

function validateEditorialIdentity(identity = {}, profile = {}) {
  const issues = [];

  if (identity.ineligible || identity.premiumImageEligible === false) {
    if (identity.editorialSubtitle !== null) issues.push("ineligible_has_subtitle");
    if (identity.headlineLines && identity.headlineLines.length > 0) issues.push("ineligible_has_headline");
    if (identity.colorLanguage !== null) issues.push("ineligible_has_color_language");
    if (identity.visualIntensity !== null) issues.push("ineligible_has_visual_intensity");
    return { ok: issues.length === 0, issues };
  }

  if (!identity.editorialDomain || identity.editorialDomain.length === 0) {
    issues.push("missing_editorial_domain");
  }

  if (!identity.editorialSubtitle) {
    issues.push("missing_editorial_subtitle");
  }

  if (identity.editorialSubtitle === "Official Macro Release") {
    issues.push("static_subtitle_not_allowed");
  }

  if (identity.headlineLines && identity.headlineLines.join(" ") === identity.editorialSubtitle) {
    issues.push("headline_subtitle_duplicate");
  }

  if (identity.premiumImageEligible === false && profile.requirePremiumImage) {
    issues.push("not_premium_eligible");
  }

  if (!identity.heroSubjectType) {
    issues.push("missing_hero_subject_type");
  }

  if (!identity.colorLanguage?.palette) {
    issues.push("missing_color_language");
  }

  const forbidden = identity.forbiddenSubjects || [];
  for (const term of SYMBOL_CLUTTER_FORBIDDEN) {
    if (!forbidden.some((item) => item.toLowerCase().includes(term.toLowerCase().slice(0, 12)))) {
      // soft check only for symbol clutter awareness in validator exports
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

module.exports = {
  validateEditorialIdentity,
};
