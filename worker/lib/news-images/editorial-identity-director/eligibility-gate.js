const { resolveEditorialDomains, resolveSyntheticEventKey } = require("./config/market-domains");
const { resolveMarketAngle } = require("./market-context-resolver");

function resolveEditorialImageEligibility(profile = {}, context = {}) {
  const editorialDomain = resolveEditorialDomains(profile, context);
  const syntheticEventKey = resolveSyntheticEventKey(profile, context);
  const marketAngle = resolveMarketAngle(profile, context, editorialDomain, syntheticEventKey);
  return Boolean(marketAngle.premiumImageEligible && marketAngle.hasMarketAngle);
}

function logEditorialIdentityIneligible(profile = {}, context = {}, marketAngle = {}) {
  console.log(
    "PREMIUM_IMAGE_EDITORIAL_IDENTITY_INELIGIBLE",
    JSON.stringify({
      eventKey: profile.canonicalEventKey || profile.eventKey || context.eventKey || null,
      syntheticEventKey: resolveSyntheticEventKey(profile, context),
      hasMarketAngle: marketAngle.hasMarketAngle,
      premiumImageEligible: marketAngle.premiumImageEligible,
    })
  );
}

module.exports = {
  resolveEditorialImageEligibility,
  logEditorialIdentityIneligible,
};
