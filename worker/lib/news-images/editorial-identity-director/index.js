const { resolveEditorialIdentity } = require("./identity-profile");
const { buildIdentityPromptDirectives, appendIdentityToPrompt } = require("./identity-prompt-builder");
const { validateEditorialIdentity } = require("./identity-validator");
const { resolveEditorialSubtitle, resolveHeadlineLines } = require("./identity-style-resolver");
const { ECONOMIC_NEWSI_BRAND, VISUAL_IDENTITY_PRINCIPLES, IDENTITY_SIGNATURE } = require("./config/brand-identity");
const { EDITORIAL_DOMAINS, resolveEditorialDomains, resolveSyntheticEventKey } = require("./config/market-domains");
const { SUBTITLE_BY_DOMAIN, SUBTITLE_BY_EVENT, COLOR_LANGUAGE_BY_DOMAIN } = require("./config/editorial-tones");
const { MARKET_CONTEXT_IS_EDITORIAL_NOT_LITERAL } = require("./market-context-resolver");

function resolveEditorialSubtitleFromContext(context = {}) {
  if (context.editorialSubtitle !== undefined && context.editorialSubtitle !== null) {
    return context.editorialSubtitle;
  }
  if (context.editorialSubtitle === null) {
    return null;
  }
  try {
    const { buildEditorialProfile } = require("../editorial-intelligence/event-profiler");
    const profile = buildEditorialProfile(context);
    const identity = resolveEditorialIdentity(profile, {}, {}, {}, context);
    if (!identity.premiumImageEligible) {
      return null;
    }
    return identity.editorialSubtitle;
  } catch (_error) {
    return resolveEditorialSubtitle([], context.eventKey || "");
  }
}

module.exports = {
  resolveEditorialIdentity,
  resolveEditorialSubtitleFromContext,
  resolveEditorialImageEligibility: require("./eligibility-gate").resolveEditorialImageEligibility,
  logEditorialIdentityIneligible: require("./eligibility-gate").logEditorialIdentityIneligible,
  buildIdentityPromptDirectives,
  appendIdentityToPrompt,
  validateEditorialIdentity,
  resolveEditorialSubtitle,
  resolveHeadlineLines,
  resolveEditorialSubtitleFromContext,
  ECONOMIC_NEWSI_BRAND,
  VISUAL_IDENTITY_PRINCIPLES,
  IDENTITY_SIGNATURE,
  EDITORIAL_DOMAINS,
  resolveEditorialDomains,
  resolveSyntheticEventKey,
  SUBTITLE_BY_DOMAIN,
  SUBTITLE_BY_EVENT,
  COLOR_LANGUAGE_BY_DOMAIN,
  MARKET_CONTEXT_IS_EDITORIAL_NOT_LITERAL,
};
