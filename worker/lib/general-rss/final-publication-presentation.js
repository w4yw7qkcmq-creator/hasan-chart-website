const { buildRssPublicationPresentation } = require("./publication-format");
const { validateRssMinimumInformation } = require("./minimum-information-gate");

function sealRssFinalPublicationPresentation(input = {}) {
  const presentation = buildRssPublicationPresentation(input);
  return Object.freeze({
    canonicalHeadline: presentation.canonicalHeadline,
    imageTitle: presentation.imageTitle,
    telegramMessage: presentation.telegramMessage,
    siteTitle: presentation.siteTitle,
    siteContent: presentation.siteContent,
    dedupeIdentity: presentation.dedupeIdentity,
    sourceTitleEmbeddedInHeadline: presentation.sourceTitleEmbeddedInHeadline,
  });
}

function buildAndValidateFinalRssPublication(input = {}) {
  const sealed = sealRssFinalPublicationPresentation(input);
  const minimumInformation = validateRssMinimumInformation(sealed, {
    sourceTitle: input.sourceTitle,
    knownEntities: input.knownEntities,
    organizations: input.organizations,
    people: input.people,
    instruments: input.instruments,
  });
  if (!minimumInformation.ok) {
    return { ok: false, presentation: null, reason: minimumInformation.reason, issue: minimumInformation.issue };
  }
  return { ok: true, presentation: sealed, reason: null };
}

function assertDeliveryMatchesValidatedPresentation(validatedPresentation, delivery = {}) {
  const telegramMessage = String(delivery.telegramMessage || "").trim();
  const siteTitle = String(delivery.siteTitle || "").trim();
  const siteContent = String(delivery.siteContent || "").trim();

  if (telegramMessage !== validatedPresentation.telegramMessage) {
    return { ok: false, issue: "telegram_message_mutated_after_validation" };
  }
  if (siteTitle !== validatedPresentation.siteTitle) {
    return { ok: false, issue: "site_title_mutated_after_validation" };
  }
  if (siteContent !== validatedPresentation.siteContent) {
    return { ok: false, issue: "site_content_mutated_after_validation" };
  }
  return { ok: true };
}

module.exports = {
  sealRssFinalPublicationPresentation,
  buildAndValidateFinalRssPublication,
  assertDeliveryMatchesValidatedPresentation,
};
