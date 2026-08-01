const { getEconomicReleaseImpactText } = require("../economic-releases/format");
const { validateEconomicReleaseCompleteness } = require("../economic-releases/completeness");
const { mergeProviderEvents } = require("../economic-releases/normalize");
const { validateFinalMessageAgainstFacts } = require("./invariants");
const { resolveImpactWithAi } = require("./ai-impact");
const {
  buildStructuredFactsForEditorial,
  buildEditorialDraft,
  buildRuleBasedEditorialDraft,
  validateEditorialDraft,
  createEditorialMetrics,
} = require("./editorial");
const {
  buildConciseStructuredFallback,
  buildMinimalStructuredFallback,
} = require("./concise-editorial");
const { formatTelegramNewsMessage } = require("./telegram-formatter");
const { sanitizeChannelArtifacts } = require("./channel-sanitizer");
const { validateFinalEditorialQuality } = require("./editorial-quality");

function buildDraftPayload(editorialDraft, facts, impactText) {
  if (editorialDraft.template === "economic") {
    return {
      template: "economic",
      headline: editorialDraft.headline,
      country: editorialDraft.country || facts.country || "الولايات المتحدة",
      previous: facts.previous || facts.revisedPrevious,
      forecast: facts.forecast,
      actual: facts.actual,
      impact: impactText,
    };
  }

  if (editorialDraft.template === "pre_event") {
    return {
      template: "pre_event",
      headline: editorialDraft.headline,
      summary: editorialDraft.summary,
      bullets: editorialDraft.bullets || [],
    };
  }

  return {
    template: "general",
    headline: editorialDraft.headline,
    summary: editorialDraft.summary,
    bullets: editorialDraft.bullets || [],
    impact: impactText,
  };
}

async function resolveFormattedDraftWithRetry({ structuredFacts, facts, post, options, templateType, metrics }) {
  const attempts = [
    () => buildRuleBasedEditorialDraft(structuredFacts, facts),
    () => buildConciseStructuredFallback(structuredFacts, facts, { reorder: true }),
    () => buildMinimalStructuredFallback(structuredFacts, facts),
  ];

  for (let index = 0; index < attempts.length; index += 1) {
    const draft = attempts[index]();
    if (!draft.ok) {
      continue;
    }

    let impactText = draft.impact || "";
    if (templateType === "economic") {
      if (options.disableAi !== true) {
        const impactResolved = await resolveImpactWithAi(facts, options);
        impactText = impactResolved.impactParagraph || impactText;
      }
      impactText = impactText || getEconomicReleaseImpactText(facts.title, facts.actual, facts.forecast);
    } else if (!impactText && options.disableAi !== true) {
      const impactResolved = await resolveImpactWithAi(facts, options);
      impactText = impactResolved.impactParagraph || impactText;
    }
    if (!impactText) {
      impactText = "قد تنعكس هذه التطورات على الدولار والذهب ومؤشرات الأسهم.";
    }

    const draftPayload = buildDraftPayload(draft, facts, impactText);
    const formatted = formatTelegramNewsMessage(draftPayload);
    const editorialCheck = validateEditorialDraft(
      formatted,
      post.rawText,
      facts,
      structuredFacts
    );

    if (editorialCheck.ok) {
      if (index === 0) {
        metrics.aiEditorialAccepted += 1;
      } else if (index === 1) {
        metrics.aiEditorialRetryAccepted += 1;
        metrics.structuredFallbackUsed += 1;
      } else {
        metrics.structuredFallbackUsed += 1;
      }

      return {
        formatted,
        draftPayload,
        editorialCheck,
        attempt: index,
        resolvedTitle: draft.headline,
        titleResult: draft.titleResult,
      };
    }

    if (editorialCheck.issues.includes("AI_EDITORIAL_DRAFT_TOO_SIMILAR")) {
      metrics.aiEditorialTooSimilar += 1;
    }
  }

  metrics.structuredFallbackRejected += 1;
  return { formatted: null, reason: "AI_EDITORIAL_DRAFT_TOO_SIMILAR" };
}

async function finalizeFormattedMessage({ facts, post, classification, options, templateType = "general" }) {
  const structuredFacts = buildStructuredFactsForEditorial(facts, post, classification);
  const metrics = options.editorialMetrics || createEditorialMetrics();

  const resolved = await resolveFormattedDraftWithRetry({
    structuredFacts,
    facts,
    post,
    options,
    templateType,
    metrics,
  });

  if (!resolved.formatted) {
    return {
      formatted: null,
      skipPublish: true,
      reason: resolved.reason || "GENERIC_TITLE_REJECTED",
      validation: { complete: false, reason: resolved.reason },
      editorialMetrics: metrics,
      originalTitle: facts.title,
      originalLength: String(post.rawText || "").length,
    };
  }

  const qualityCheck = validateFinalEditorialQuality(resolved.formatted, facts, {
    template: resolved.draftPayload.template,
    sourceText: post.rawText,
    storyCount: post._storyCount || 1,
  });

  const sanitizedFormatted = sanitizeChannelArtifacts(resolved.formatted);

  if (!qualityCheck.ok) {
    console.log(
      "FINAL_EDITORIAL_QUALITY_REJECTED",
      JSON.stringify({ reasons: qualityCheck.issues.slice(0, 5), sourceMessageId: post.sourceMessageId })
    );
    return {
      formatted: null,
      skipPublish: true,
      reason: "FINAL_EDITORIAL_QUALITY_REJECTED",
      validation: { complete: false, reason: qualityCheck.reason },
      editorialCheck: resolved.editorialCheck,
      qualityCheck,
      editorialMetrics: metrics,
      resolvedTitle: resolved.resolvedTitle,
      originalTitle: facts.title,
      originalLength: String(post.rawText || "").length,
      finalLength: resolved.formatted.length,
    };
  }

  const factCheck = validateFinalMessageAgainstFacts(sanitizedFormatted, facts);
  if (!factCheck.ok) {
    return {
      formatted: null,
      skipPublish: true,
      reason: factCheck.reason || "FINAL_MESSAGE_FACT_MISMATCH",
      validation: { complete: false, reason: factCheck.reason },
      editorialCheck: resolved.editorialCheck,
      qualityCheck,
      editorialMetrics: metrics,
      resolvedTitle: resolved.resolvedTitle,
      originalTitle: facts.title,
      originalLength: String(post.rawText || "").length,
      finalLength: sanitizedFormatted.length,
    };
  }

  return {
    formatted: sanitizedFormatted,
    skipPublish: false,
    editorialCheck: resolved.editorialCheck,
    qualityCheck,
    editorialMetrics: metrics,
    resolvedTitle: resolved.resolvedTitle,
    originalTitle: facts.title,
    titleResult: resolved.titleResult,
    originalLength: String(post.rawText || "").length,
    finalLength: sanitizedFormatted.length,
    aiResult: resolved.attempt === 0 ? "rule_based" : resolved.attempt === 1 ? "structured_retry" : "structured_minimal",
    usedFixedTemplate: true,
  };
}

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

  const result = await finalizeFormattedMessage({
    facts,
    post,
    classification,
    options,
    templateType: "economic",
  });

  return {
    ...result,
    validation,
    missingFields: [],
    aiImpactUsed: options.disableAi !== true,
  };
}

async function formatHasanChartGeneralNews({ facts, post, classification }, options = {}) {
  const result = await finalizeFormattedMessage({
    facts,
    post,
    classification,
    options,
    templateType: "general",
  });

  return {
    ...result,
    validation: result.skipPublish
      ? { complete: false, reason: result.reason }
      : { complete: true, reason: "plain_news" },
    missingFields: [],
    aiImpactUsed: false,
    reason: result.skipPublish ? result.reason : "plain_news",
  };
}

async function formatPreEventAlert({ facts, post, classification }, options = {}) {
  const structuredFacts = buildStructuredFactsForEditorial(facts, post, classification);
  const editorial = await buildEditorialDraft(structuredFacts, { ...options, facts, sourceText: post.rawText });

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
    resolvedTitle: editorial.draft.headline,
    originalTitle: facts.title,
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
