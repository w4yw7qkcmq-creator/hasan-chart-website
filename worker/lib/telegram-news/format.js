const { getEconomicReleaseImpactText } = require("../economic-releases/format");
const { validateEconomicReleaseCompleteness } = require("../economic-releases/completeness");
const { mergeProviderEvents } = require("../economic-releases/normalize");
const { validateFinalMessageAgainstFacts } = require("./invariants");
const { resolveImpactWithAi } = require("./ai-impact");
const {
  buildStructuredFactsForEditorial,
  buildEditorialDraft,
  validateEditorialDraft,
} = require("./editorial");
const { formatTelegramNewsMessage } = require("./telegram-formatter");

async function formatHasanChartEconomicNews({ facts, post, classification }, options = {}) {
  const merged = mergeProviderEvents([
    {
      eventKey: facts.canonicalEventKey,
      title: facts.title,
      country: facts.country || "US",
      previous: facts.previous,
      revisedPrevious: facts.revisedPrevious,
      forecast: facts.forecast,
      actual: facts.actual,
      sourceName: post.sourceChannel,
      sourceTimestamp: post.sourcePublishedAt,
    },
  ]);

  const validation = validateEconomicReleaseCompleteness(merged, facts.canonical);

  if (!validation.complete) {
    return {
      formatted: null,
      validation,
      skipPublish: true,
      reason: validation.reason || "ECONOMIC_RELEASE_DROPPED_INCOMPLETE",
      missingFields: validation.missingFields,
      aiImpactUsed: false,
      aiResult: "none",
    };
  }

  const structuredFacts = buildStructuredFactsForEditorial(facts, post, classification);
  const editorial = await buildEditorialDraft(structuredFacts, options);
  let impactText = editorial.draft?.impact || "";

  if (options.disableAi !== true) {
    const impactResolved = await resolveImpactWithAi(facts, options);
    impactText = impactResolved.impactParagraph || impactText;
  } else {
    impactText = impactText || getEconomicReleaseImpactText(facts.title, facts.actual, facts.forecast);
  }

  const draftPayload = {
    template: "economic",
    headline: editorial.draft?.headline || facts.title,
    country: editorial.draft?.country || facts.country || "الولايات المتحدة",
    previous: facts.previous || facts.revisedPrevious,
    forecast: facts.forecast,
    actual: facts.actual,
    impact: impactText,
  };

  let formatted = formatTelegramNewsMessage(draftPayload);
  let editorialCheck = validateEditorialDraft(formatted, post.rawText, facts, structuredFacts);

  if (!editorialCheck.ok && editorialCheck.reason === "AI_EDITORIAL_DRAFT_TOO_SIMILAR") {
    formatted = formatTelegramNewsMessage({
      ...draftPayload,
      impact: getEconomicReleaseImpactText(facts.title, facts.actual, facts.forecast),
    });
    editorialCheck = validateEditorialDraft(formatted, post.rawText, facts, structuredFacts);
  }

  const factCheck = validateFinalMessageAgainstFacts(formatted, facts);
  if (!factCheck.ok) {
    const fixedTemplate = formatTelegramNewsMessage({
      ...draftPayload,
      impact: getEconomicReleaseImpactText(facts.title, facts.actual, facts.forecast),
    });
    return {
      formatted: fixedTemplate,
      fixedTemplate,
      validation,
      skipPublish: false,
      reason: factCheck.reason,
      missingFields: [],
      aiImpactUsed: false,
      aiResult: "fallback",
      usedFixedTemplate: true,
      editorialCheck,
    };
  }

  return {
    formatted,
    validation,
    skipPublish: false,
    reason: "complete",
    missingFields: [],
    aiImpactUsed: editorial.aiUsed === true,
    aiResult: editorial.aiResult || "rule_based",
    usedFixedTemplate: editorial.aiResult === "fallback",
    editorialCheck,
  };
}

async function formatHasanChartGeneralNews({ facts, post, classification }, options = {}) {
  const structuredFacts = buildStructuredFactsForEditorial(facts, post, classification);
  const editorial = await buildEditorialDraft(structuredFacts, options);

  if (!editorial.draft?.ok && editorial.reason) {
    return {
      formatted: null,
      validation: { complete: false, reason: editorial.reason },
      skipPublish: true,
      reason: editorial.reason,
      missingFields: [],
      aiImpactUsed: false,
      aiResult: "none",
    };
  }

  let impactText = editorial.draft?.impact || "";
  if (options.disableAi !== true) {
    const impactResolved = await resolveImpactWithAi(facts, options);
    impactText = impactResolved.impactParagraph || impactText;
  }

  const draftPayload = {
    template: editorial.draft?.template || "general",
    headline: editorial.draft?.headline || facts.title,
    summary: editorial.draft?.summary,
    bullets: editorial.draft?.bullets || [],
    impact: impactText,
  };

  let formatted = formatTelegramNewsMessage(draftPayload);
  let editorialCheck = validateEditorialDraft(formatted, post.rawText, facts, structuredFacts);

  if (!editorialCheck.ok && editorialCheck.reason === "AI_EDITORIAL_DRAFT_TOO_SIMILAR") {
    formatted = formatTelegramNewsMessage({
      ...draftPayload,
      summary: structuredFacts.factualPoints.slice(0, 2).join(" "),
      bullets: structuredFacts.factualPoints.slice(2, 4),
    });
    editorialCheck = validateEditorialDraft(formatted, post.rawText, facts, structuredFacts);
  }

  return {
    formatted,
    validation: { complete: true, reason: "plain_news" },
    skipPublish: false,
    reason: "plain_news",
    missingFields: [],
    aiImpactUsed: editorial.aiUsed === true,
    aiResult: editorial.aiResult || "rule_based",
    usedFixedTemplate: editorial.aiResult === "fallback",
    editorialCheck,
  };
}

async function formatPreEventAlert({ facts, post, classification }, options = {}) {
  const structuredFacts = buildStructuredFactsForEditorial(facts, post, classification);
  const editorial = await buildEditorialDraft(structuredFacts, options);

  if (!editorial.draft?.ok) {
    return {
      formatted: null,
      validation: { complete: false, reason: editorial.reason },
      skipPublish: true,
      reason: editorial.reason,
      missingFields: [],
      aiImpactUsed: false,
      aiResult: "none",
    };
  }

  const formatted = formatTelegramNewsMessage({
    template: "pre_event",
    headline: editorial.draft.headline,
    summary: editorial.draft.summary,
    bullets: editorial.draft.bullets,
  });

  return {
    formatted,
    validation: { complete: true, reason: "pre_event_alert" },
    skipPublish: false,
    reason: "pre_event_alert",
    missingFields: [],
    aiImpactUsed: false,
    aiResult: "rule_based",
    usedFixedTemplate: false,
    editorialCheck: { ok: true, issues: [], overlap: 0 },
  };
}

async function formatTelegramPost(post, facts, options = {}) {
  const classification = options.classification || {};

  if (classification.classification === "pre_event_alert") {
    return formatPreEventAlert({ facts, post, classification }, options);
  }

  if (facts.isPlainFedNews) {
    return formatHasanChartGeneralNews({ facts, post, classification }, options);
  }

  if (facts.isStructuredTriple) {
    return formatHasanChartEconomicNews({ facts, post, classification }, options);
  }

  return formatHasanChartGeneralNews({ facts, post, classification }, options);
}

module.exports = {
  formatHasanChartEconomicNews,
  formatHasanChartGeneralNews,
  formatPreEventAlert,
  formatTelegramPost,
};
