const { formatTelegramNewsMessage } = require("../telegram-news/telegram-formatter");
const { buildConciseStructuredFallback } = require("../telegram-news/concise-editorial");
const { buildStructuredFactsForEditorial } = require("../telegram-news/editorial");
const { sanitizeChannelArtifacts } = require("../telegram-news/channel-sanitizer");
const { validateSemanticPublication, BLOCK_REASONS } = require("./semantic-publication-validation");
const { PUBLICATION_TYPES } = require("./publication-types");

function buildDeterministicGeneralPublication(publication = {}, editorial = {}) {
  const candidate = publication.metadata?.candidate || {};
  const facts = candidate.facts || publication.facts || {};
  const post = candidate.post || { rawText: publication.rawSourceText || "" };
  const structuredFacts = buildStructuredFactsForEditorial(facts, post, {
    classification: candidate.classification?.classification || "breaking_news",
  });

  const concise = buildConciseStructuredFallback(structuredFacts, facts, { reorder: true });
  if (!concise.ok) {
    return { ok: false, reason: BLOCK_REASONS.EDITORIAL_FACTS_INSUFFICIENT };
  }

  const formatted = formatTelegramNewsMessage({
    template: "general",
    headline: concise.headline,
    summary: concise.summary,
    bullets: concise.bullets || [],
    impact: concise.impact || "",
  });

  const sanitized = sanitizeChannelArtifacts(formatted);
  if (!sanitized || sanitized.length < 40) {
    return { ok: false, reason: BLOCK_REASONS.EDITORIAL_FACTS_INSUFFICIENT };
  }

  return {
    ok: true,
    publication: {
      ...publication,
      title: concise.headline,
      body: sanitized,
      bodySource: "deterministic_repair",
    },
    editorial: {
      ...editorial,
      body: sanitized,
      title: concise.headline,
    },
    repairStrategy: "deterministic_general_formatter",
  };
}

function validateAndRepairPublicationSemantics(publication = {}, editorial = {}, options = {}) {
  const initial = validateSemanticPublication(publication, editorial);
  if (initial.ok) {
    return { ok: true, publication, editorial, validation: initial, repaired: false };
  }

  const importance = String(publication.importance || "").toUpperCase();
  const isImportant =
    importance === "HIGH" ||
    importance === "ULTRA" ||
    publication.publicationType === PUBLICATION_TYPES.RELEASE;

  if (!isImportant) {
    return {
      ok: false,
      blocked: true,
      reason: BLOCK_REASONS.SEMANTIC_PUBLICATION_INVALID,
      stage: "semantic_validation",
      validation: initial,
    };
  }

  if (options.allowRepair === false || options.repairAttempted === true) {
    const insufficientFacts = initial.issues.includes("missing_clear_primary_fact");
    return {
      ok: false,
      blocked: true,
      reason: insufficientFacts
        ? BLOCK_REASONS.EDITORIAL_FACTS_INSUFFICIENT
        : BLOCK_REASONS.SEMANTIC_PUBLICATION_INVALID,
      stage: "semantic_validation",
      validation: initial,
    };
  }

  const repaired = buildDeterministicGeneralPublication(publication, editorial);
  if (!repaired.ok) {
    return {
      ok: false,
      blocked: true,
      reason: repaired.reason || BLOCK_REASONS.EDITORIAL_FACTS_INSUFFICIENT,
      stage: "semantic_validation",
      validation: initial,
    };
  }

  const postRepair = validateSemanticPublication(repaired.publication, repaired.editorial);
  if (!postRepair.ok) {
    return {
      ok: false,
      blocked: true,
      reason: BLOCK_REASONS.EDITORIAL_FACTS_INSUFFICIENT,
      stage: "semantic_validation",
      validation: postRepair,
      preValidation: initial,
      repairStrategy: repaired.repairStrategy,
    };
  }

  return {
    ok: true,
    publication: repaired.publication,
    editorial: repaired.editorial,
    validation: postRepair,
    repaired: true,
    repairStrategy: repaired.repairStrategy,
    preValidation: initial,
  };
}

module.exports = {
  validateAndRepairPublicationSemantics,
  buildDeterministicGeneralPublication,
};
