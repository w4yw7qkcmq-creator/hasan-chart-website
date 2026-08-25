const { evaluateRssCuratorGate } = require("../rss-curator-gate");
const { buildAndValidateFinalRssPublication } = require("../final-publication-presentation");
const { buildCanonicalRssEvidence } = require("./canonical-evidence");
const { buildStructuredFactsV2 } = require("./structured-facts");
const { generateEditorV2Editorial } = require("./editorial-ai");
const { validateEditorV2FactGuard } = require("./fact-guard");
const {
  classifyEvidenceSufficiency,
  isEvidenceSufficientForEditorial,
} = require("./evidence-sufficiency");
const {
  recordEditorV2ShadowOutcome,
  recordEditorV2LiveOutcome,
} = require("./telemetry");
const { V2_REASON_CODES } = require("./reason-codes");
const {
  resolveEditorV2Mode,
  isEditorV2ShadowMode,
  isEditorV2Enabled,
  isEditorV2Off,
  isEditorV2LiveMode,
  EDITOR_V2_MODES,
  V2_OUTPUT_PATHS,
} = require("./mode");
const crypto = require("crypto");

const OFFICIAL_FOOTER = "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";

function formatEditorV2TelegramMessage(editorial = {}) {
  const headline = String(editorial.headline || "").trim();
  const body = String(editorial.body || "").trim();
  const headlineLine = headline.startsWith("🚨") ? headline : `🚨 ${headline}`;
  const core = body ? `${headlineLine}\n\n${body}` : headlineLine;
  return `${core}${OFFICIAL_FOOTER}`;
}

function buildSourceHash(sourceTitle = "", link = "") {
  return crypto
    .createHash("sha256")
    .update(`${String(sourceTitle || "").trim()}|${String(link || "").trim()}`)
    .digest("hex")
    .slice(0, 16);
}

async function runEditorV2Review(input = {}, options = {}) {
  const startedAt = Date.now();
  const source = input.item?.sourceName || input.source || "unknown";
  const mode = resolveEditorV2Mode(options.env);

  const curator = evaluateRssCuratorGate(input.item || {});
  if (!curator.ok) {
    return {
      mode,
      ok: false,
      stage: "curator",
      reasonCode: V2_REASON_CODES.V2_CURATOR_SKIPPED,
      curatorOutcome: curator.outcome,
      latencyMs: Date.now() - startedAt,
    };
  }

  const evidence = input.evidence || buildCanonicalRssEvidence(input.item || {}, source);
  const facts = input.facts || buildStructuredFactsV2(evidence);
  const evidenceSufficiency = input.evidenceSufficiency || classifyEvidenceSufficiency(evidence);
  const sourceHash = buildSourceHash(evidence.title, input.item?.link);

  if ((facts.roleConflicts || []).length) {
    return {
      mode,
      ok: false,
      stage: "role_conflict",
      reasonCode: V2_REASON_CODES.V2_ENTITY_ROLE_CONFLICT,
      roleConflicts: facts.roleConflicts,
      sourceTitle: evidence.title,
      sourceHash,
      latencyMs: Date.now() - startedAt,
    };
  }

  if (!isEvidenceSufficientForEditorial(evidenceSufficiency.level)) {
    return {
      mode,
      ok: false,
      stage: "evidence_sufficiency",
      reasonCode: V2_REASON_CODES.V2_INSUFFICIENT_EVIDENCE,
      evidenceSufficiency,
      sourceTitle: evidence.title,
      sourceHash,
      latencyMs: Date.now() - startedAt,
    };
  }

  const editorial =
    input.editorial ||
    (await generateEditorV2Editorial(evidence, facts, {
      ...options,
      evidenceSufficiencyLevel: evidenceSufficiency.level,
    }));
  const aiCall = !options.disableAi && Boolean(options.openAiApiKey || process.env.OPENAI_API_KEY);

  if (editorial.timeout) {
    return {
      mode,
      ok: false,
      stage: "editorial_ai",
      reasonCode: V2_REASON_CODES.V2_EDITORIAL_TIMEOUT,
      editorial,
      sourceTitle: evidence.title,
      sourceHash,
      latencyMs: Date.now() - startedAt,
      aiCalls: aiCall ? 1 : 0,
    };
  }

  if (editorial.insufficientEvidence) {
    return {
      mode,
      ok: false,
      stage: "editorial_ai",
      reasonCode: V2_REASON_CODES.V2_INSUFFICIENT_EVIDENCE,
      editorial,
      sourceTitle: evidence.title,
      sourceHash,
      latencyMs: Date.now() - startedAt,
      aiCalls: aiCall ? 1 : 0,
    };
  }

  const guard = validateEditorV2FactGuard({ evidence, facts, editorial });
  if (!guard.ok) {
    return {
      mode,
      ok: false,
      stage: "fact_guard",
      reasonCode: guard.reasonCode,
      issues: guard.issues,
      editorial,
      sourceTitle: evidence.title,
      sourceHash,
      latencyMs: Date.now() - startedAt,
      aiCalls: aiCall ? 1 : 0,
    };
  }

  const editorialMessage = formatEditorV2TelegramMessage(editorial);
  const finalPublication = buildAndValidateFinalRssPublication({
    sourceTitle: evidence.title,
    editorialMessage,
    imageTitle: editorial.headline,
    knownEntities: [
      ...(facts.organizations || []),
      ...(facts.people || []).map((person) => person.name).filter(Boolean),
      ...(facts.instruments || []),
    ],
    organizations: facts.organizations,
    people: facts.people,
    instruments: facts.instruments,
    structuredFacts: facts,
  });

  if (!finalPublication.ok) {
    return {
      mode,
      ok: false,
      stage: "minimum_information",
      reasonCode: V2_REASON_CODES.V2_LOW_INFORMATION,
      issue: finalPublication.issue,
      editorial,
      sourceTitle: evidence.title,
      sourceHash,
      latencyMs: Date.now() - startedAt,
      aiCalls: aiCall ? 1 : 0,
    };
  }

  return {
    mode,
    ok: true,
    stage: "passed",
    evidence,
    facts,
    evidenceSufficiency,
    editorial,
    usedFallback: Boolean(editorial.fallback),
    outputPath: editorial.outputPath,
    presentation: finalPublication.presentation,
    sourceTitle: evidence.title,
    sourceHash,
    latencyMs: Date.now() - startedAt,
    aiCalls: aiCall ? 1 : 0,
  };
}

async function runEditorV2ShadowReview(input = {}, options = {}) {
  const result = await runEditorV2Review(input, options);
  const source = input.item?.sourceName || input.source || "unknown";
  const telemetryPayload = {
    passed: result.ok,
    failed: !result.ok,
    aiCall: Boolean(result.aiCalls),
    latencyMs: result.latencyMs,
    reasonCode: result.reasonCode,
    editorial: result.editorial,
    sourceTitle: result.sourceTitle,
    headline: result.editorial?.headline,
    body: result.editorial?.body,
    outputPath: result.outputPath,
    sourceHash: result.sourceHash,
    curatorSkipped: result.reasonCode === V2_REASON_CODES.V2_CURATOR_SKIPPED,
    insufficientEvidence:
      result.reasonCode === V2_REASON_CODES.V2_INSUFFICIENT_EVIDENCE ||
      Boolean(result.editorial?.insufficientEvidence),
    timeout: result.reasonCode === V2_REASON_CODES.V2_EDITORIAL_TIMEOUT,
  };
  recordEditorV2ShadowOutcome(source, telemetryPayload);
  return result;
}

async function runEditorV2PublicationReview(input = {}, options = {}) {
  const result = await runEditorV2Review(input, options);
  const source = input.item?.sourceName || input.source || "unknown";
  recordEditorV2LiveOutcome(source, {
    passed: result.ok,
    aiCall: Boolean(result.aiCalls),
    latencyMs: result.latencyMs,
    reasonCode: result.reasonCode,
    editorial: result.editorial,
    sourceTitle: result.sourceTitle,
    headline: result.editorial?.headline,
    body: result.editorial?.body,
    outputPath: result.outputPath,
    sourceHash: result.sourceHash,
  });
  return result;
}

function scheduleEditorV2ShadowReview(input = {}, options = {}) {
  if (!isEditorV2Enabled(options.env) || !isEditorV2ShadowMode(options.env)) {
    return Promise.resolve({
      mode: resolveEditorV2Mode(options.env),
      ok: false,
      stage: "disabled",
      skipped: true,
    });
  }

  const timeoutMs = Math.max(250, Number(options.v2ShadowTimeoutMs || options.v2TimeoutMs || 12000));
  return Promise.race([
    runEditorV2ShadowReview(input, options),
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve({
            mode: resolveEditorV2Mode(options.env),
            ok: false,
            stage: "timeout",
            reasonCode: V2_REASON_CODES.V2_EDITORIAL_TIMEOUT,
            skipped: true,
          }),
        timeoutMs
      );
    }),
  ]).catch((error) => ({
    mode: resolveEditorV2Mode(options.env),
    ok: false,
    stage: "error",
    error: error.message,
  }));
}

module.exports = {
  resolveEditorV2Mode,
  isEditorV2Off,
  isEditorV2ShadowMode,
  isEditorV2LiveMode,
  isEditorV2Enabled,
  EDITOR_V2_MODES,
  V2_OUTPUT_PATHS,
  formatEditorV2TelegramMessage,
  runEditorV2Review,
  runEditorV2ShadowReview,
  runEditorV2PublicationReview,
  scheduleEditorV2ShadowReview,
};
