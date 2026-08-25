const { evaluateRssCuratorGate } = require("../rss-curator-gate");
const { buildAndValidateFinalRssPublication } = require("../final-publication-presentation");
const { buildCanonicalRssEvidence } = require("./canonical-evidence");
const { buildStructuredFactsV2 } = require("./structured-facts");
const { generateEditorV2Editorial } = require("./editorial-ai");
const { validateEditorV2FactGuard } = require("./fact-guard");
const { recordEditorV2ShadowOutcome } = require("./telemetry");
const { V2_REASON_CODES } = require("./reason-codes");
const { EDITOR_V2_MODE } = require("./telemetry");

const OFFICIAL_FOOTER = "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";

function formatEditorV2TelegramMessage(editorial = {}) {
  const headline = String(editorial.headline || "").trim();
  const body = String(editorial.body || "").trim();
  const headlineLine = headline.startsWith("🚨") ? headline : `🚨 ${headline}`;
  const core = body ? `${headlineLine}\n\n${body}` : headlineLine;
  return `${core}${OFFICIAL_FOOTER}`;
}

async function runEditorV2ShadowReview(input = {}, options = {}) {
  const startedAt = Date.now();
  const source = input.item?.sourceName || input.source || "unknown";

  const curator = evaluateRssCuratorGate(input.item || {});
  if (!curator.ok) {
    recordEditorV2ShadowOutcome(source, {
      curatorSkipped: true,
      failed: true,
      reasonCode: V2_REASON_CODES.V2_CURATOR_SKIPPED,
      latencyMs: Date.now() - startedAt,
    });
    return {
      mode: EDITOR_V2_MODE,
      ok: false,
      stage: "curator",
      reasonCode: V2_REASON_CODES.V2_CURATOR_SKIPPED,
      curatorOutcome: curator.outcome,
    };
  }

  const evidence = input.evidence || buildCanonicalRssEvidence(input.item || {}, source);
  const facts = input.facts || buildStructuredFactsV2(evidence);

  if ((facts.roleConflicts || []).length) {
    recordEditorV2ShadowOutcome(source, {
      failed: true,
      reasonCode: V2_REASON_CODES.V2_ENTITY_ROLE_CONFLICT,
      latencyMs: Date.now() - startedAt,
    });
    return {
      mode: EDITOR_V2_MODE,
      ok: false,
      stage: "role_conflict",
      reasonCode: V2_REASON_CODES.V2_ENTITY_ROLE_CONFLICT,
      roleConflicts: facts.roleConflicts,
    };
  }

  const editorial = input.editorial || (await generateEditorV2Editorial(evidence, facts, options));
  const aiCall = !options.disableAi && Boolean(options.openAiApiKey || process.env.OPENAI_API_KEY);

  if (editorial.timeout) {
    recordEditorV2ShadowOutcome(source, {
      failed: true,
      timeout: true,
      aiCall,
      reasonCode: V2_REASON_CODES.V2_EDITORIAL_TIMEOUT,
      latencyMs: Date.now() - startedAt,
    });
    return {
      mode: EDITOR_V2_MODE,
      ok: false,
      stage: "editorial_ai",
      reasonCode: V2_REASON_CODES.V2_EDITORIAL_TIMEOUT,
    };
  }

  if (editorial.insufficientEvidence) {
    recordEditorV2ShadowOutcome(source, {
      failed: true,
      insufficientEvidence: true,
      aiCall,
      reasonCode: V2_REASON_CODES.V2_INSUFFICIENT_EVIDENCE,
      latencyMs: Date.now() - startedAt,
    });
    return {
      mode: EDITOR_V2_MODE,
      ok: false,
      stage: "editorial_ai",
      reasonCode: V2_REASON_CODES.V2_INSUFFICIENT_EVIDENCE,
    };
  }

  const guard = validateEditorV2FactGuard({ evidence, facts, editorial });
  if (!guard.ok) {
    recordEditorV2ShadowOutcome(source, {
      failed: true,
      aiCall,
      reasonCode: guard.reasonCode,
      latencyMs: Date.now() - startedAt,
    });
    return {
      mode: EDITOR_V2_MODE,
      ok: false,
      stage: "fact_guard",
      reasonCode: guard.reasonCode,
      issues: guard.issues,
    };
  }

  const editorialMessage = formatEditorV2TelegramMessage(editorial);
  const finalPublication = buildAndValidateFinalRssPublication({
    sourceTitle: evidence.title,
    editorialMessage,
    imageTitle: editorial.headline,
  });

  if (!finalPublication.ok) {
    recordEditorV2ShadowOutcome(source, {
      failed: true,
      aiCall,
      reasonCode: V2_REASON_CODES.V2_LOW_INFORMATION,
      latencyMs: Date.now() - startedAt,
    });
    return {
      mode: EDITOR_V2_MODE,
      ok: false,
      stage: "minimum_information",
      reasonCode: V2_REASON_CODES.V2_LOW_INFORMATION,
      issue: finalPublication.issue,
    };
  }

  recordEditorV2ShadowOutcome(source, {
    passed: true,
    aiCall,
    latencyMs: Date.now() - startedAt,
  });

  return {
    mode: EDITOR_V2_MODE,
    ok: true,
    stage: "passed",
    evidence,
    facts,
    editorial,
    presentation: finalPublication.presentation,
    latencyMs: Date.now() - startedAt,
    aiCalls: aiCall ? 1 : 0,
  };
}

function scheduleEditorV2ShadowReview(input = {}, options = {}) {
  const timeoutMs = Math.max(250, Number(options.v2ShadowTimeoutMs || options.v2TimeoutMs || 12000));
  return Promise.race([
    runEditorV2ShadowReview(input, options),
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve({
            mode: EDITOR_V2_MODE,
            ok: false,
            stage: "timeout",
            reasonCode: V2_REASON_CODES.V2_EDITORIAL_TIMEOUT,
            skipped: true,
          }),
        timeoutMs
      );
    }),
  ]).catch((error) => ({
    mode: EDITOR_V2_MODE,
    ok: false,
    stage: "error",
    error: error.message,
  }));
}

module.exports = {
  EDITOR_V2_MODE,
  formatEditorV2TelegramMessage,
  runEditorV2ShadowReview,
  scheduleEditorV2ShadowReview,
};
