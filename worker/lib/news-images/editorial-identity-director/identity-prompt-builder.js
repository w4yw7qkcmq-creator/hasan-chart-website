const { MARKET_CONTEXT_IS_EDITORIAL_NOT_LITERAL } = require("./market-context-resolver");

function buildIdentityPromptDirectives({ editorialIdentity = {}, profile = {} } = {}) {
  if (!editorialIdentity || !editorialIdentity.editorialDomain) {
    return [];
  }

  return [
    `Economic Newsi editorial identity: global financial news magazine for investors and traders.`,
    `Editorial domains: ${editorialIdentity.editorialDomain.join(", ")}.`,
    `Investor relevance: ${editorialIdentity.investorRelevance}`,
    `Primary market context: ${editorialIdentity.primaryMarket}.`,
    editorialIdentity.secondaryMarkets?.length
      ? `Secondary market context: ${editorialIdentity.secondaryMarkets.join(", ")}.`
      : null,
    `Coverage mode: ${editorialIdentity.coverageMode}.`,
    `Visual narrative: ${editorialIdentity.visualNarrative}`,
    `Identity tone: ${editorialIdentity.identityTone}.`,
    `Hero subject type: ${editorialIdentity.heroSubjectType}.`,
    `Color language: ${editorialIdentity.colorLanguage.palette}.`,
    `Color saturation discipline: ${editorialIdentity.colorLanguage.saturation}.`,
    `Contrast discipline: ${editorialIdentity.colorLanguage.contrast}.`,
    `Visual intensity: ${editorialIdentity.visualIntensity}. ${editorialIdentity.visualIntensityGuidance}.`,
    `Identity signature: ${editorialIdentity.identitySignature.join("; ")}.`,
    MARKET_CONTEXT_IS_EDITORIAL_NOT_LITERAL,
    editorialIdentity.marketAngle?.marketTransmission
      ? `Market transmission: ${editorialIdentity.marketAngle.marketTransmission}`
      : null,
    profile.displayTitle ? `Editorial headline context: ${profile.displayTitle}.` : null,
  ].filter(Boolean);
}

function appendIdentityToPrompt(basePrompt = "", editorialIdentity = {}, profile = {}) {
  const directives = buildIdentityPromptDirectives({ editorialIdentity, profile });
  if (!directives.length) {
    return basePrompt;
  }

  const marker = " Avoid:";
  const splitIndex = basePrompt.indexOf(marker);
  if (splitIndex === -1) {
    return `${basePrompt} Editorial identity: ${directives.join(" ")}`.replace(/\s+/g, " ").trim();
  }

  const scenePart = basePrompt.slice(0, splitIndex).trim();
  const avoidPart = basePrompt.slice(splitIndex);
  const identityForbidden = (editorialIdentity.forbiddenSubjects || []).slice(0, 8);
  const extraAvoid = identityForbidden.length ? `, ${identityForbidden.join(", ")}` : "";

  return `${scenePart} Editorial identity: ${directives.join(" ")} ${avoidPart.replace(/\.$/, "")}${extraAvoid}.`
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  buildIdentityPromptDirectives,
  appendIdentityToPrompt,
};
