const { ECONOMIC_NEWSI_BRAND, VISUAL_IDENTITY_PRINCIPLES, FORBIDDEN_IDENTITY_LOOKS, IDENTITY_SIGNATURE } = require("./config/brand-identity");
const { resolveEditorialDomains, resolveSyntheticEventKey } = require("./config/market-domains");
const {
  resolveCoverageMode,
  resolveInvestorRelevance,
  resolveHeroSubjectType,
  resolveVisualNarrative,
} = require("./editorial-relevance");
const {
  resolveMarketAngle,
  resolveIdentityForbiddenSubjects,
  resolvePrimaryMarket,
  resolveSecondaryMarkets,
} = require("./market-context-resolver");
const {
  resolveEditorialSubtitle,
  resolveHeadlineLines,
  resolveColorLanguage,
  resolveIdentityTone,
  resolveVisualIntensity,
} = require("./identity-style-resolver");

function resolveEditorialIdentity(profile = {}, entities = {}, artDirection = {}, editorialConsistency = {}, context = {}) {
  const syntheticEventKey = resolveSyntheticEventKey(profile, context);
  const editorialDomain = resolveEditorialDomains(profile, context);
  const marketAngle = resolveMarketAngle(profile, context, editorialDomain, syntheticEventKey);

  if (!marketAngle.premiumImageEligible || !marketAngle.hasMarketAngle) {
    const { logEditorialIdentityIneligible } = require("./eligibility-gate");
    logEditorialIdentityIneligible(profile, context, marketAngle);
    return {
      brand: ECONOMIC_NEWSI_BRAND,
      editorialDomain,
      investorRelevance: null,
      primaryMarket: null,
      secondaryMarkets: [],
      coverageMode: null,
      visualNarrative: null,
      identityTone: null,
      identityToneKey: null,
      heroSubjectType: null,
      colorLanguage: null,
      visualIntensity: null,
      visualIntensityGuidance: null,
      editorialSubtitle: null,
      headlineLines: [],
      forbiddenSubjects: resolveIdentityForbiddenSubjects(marketAngle),
      marketAngle,
      premiumImageEligible: false,
      identitySignature: IDENTITY_SIGNATURE,
      visualIdentityPrinciples: VISUAL_IDENTITY_PRINCIPLES,
      syntheticEventKey,
      heroSubject: null,
      ineligible: true,
    };
  }

  const primaryMarket = resolvePrimaryMarket(profile, entities, editorialDomain);
  const secondaryMarkets = resolveSecondaryMarkets(profile, entities, primaryMarket);
  const coverageMode = resolveCoverageMode(profile, editorialDomain, syntheticEventKey);
  const investorRelevance = resolveInvestorRelevance(editorialDomain, profile);
  const heroSubjectType = resolveHeroSubjectType(profile, artDirection, editorialDomain);
  const visualNarrative = resolveVisualNarrative(profile, artDirection, editorialConsistency);
  const identityTone = resolveIdentityTone(editorialDomain, coverageMode);
  const colorLanguage = resolveColorLanguage(editorialDomain);
  const visualIntensity = resolveVisualIntensity(profile, editorialDomain, syntheticEventKey);
  const editorialSubtitle = resolveEditorialSubtitle(editorialDomain, syntheticEventKey);
  const headlineLines = resolveHeadlineLines(syntheticEventKey, profile);
  const forbiddenSubjects = [
    ...new Set([
      ...resolveIdentityForbiddenSubjects(marketAngle),
      ...FORBIDDEN_IDENTITY_LOOKS,
    ]),
  ];

  return {
    brand: ECONOMIC_NEWSI_BRAND,
    editorialDomain,
    investorRelevance,
    primaryMarket,
    secondaryMarkets,
    coverageMode,
    visualNarrative,
    identityTone: identityTone.description,
    identityToneKey: identityTone.key,
    heroSubjectType,
    colorLanguage,
    visualIntensity: visualIntensity.level,
    visualIntensityGuidance: visualIntensity.guidance,
    editorialSubtitle,
    headlineLines,
    forbiddenSubjects,
    marketAngle,
    premiumImageEligible: marketAngle.premiumImageEligible,
    identitySignature: IDENTITY_SIGNATURE,
    visualIdentityPrinciples: VISUAL_IDENTITY_PRINCIPLES,
    syntheticEventKey,
    heroSubject:
      editorialConsistency?.photoStory?.heroSubject ||
      artDirection?.heroSubject ||
      null,
    ineligible: false,
  };
}

module.exports = {
  resolveEditorialIdentity,
};
