const axios = require("axios");
const {
  EVIDENCE_SUFFICIENCY,
  shouldOverrideAiInsufficientEvidence,
  isEvidenceSufficientForEditorial,
} = require("./evidence-sufficiency");
const {
  buildDeterministicArabicFallback,
  isPredominantlyArabic,
} = require("./deterministic-arabic-fallback");
const { V2_OUTPUT_PATHS } = require("./mode");
const { AI_DIRECT_FAILURE_REASONS } = require("./reason-codes");
const { extractActionFromEvidence } = require("./action-resolution");
const { resolvePrimarySubject } = require("./primary-subject");
const { extractAttributionHint } = require("./deterministic-arabic-fallback");

const DEFAULT_V2_TIMEOUT_MS = 12_000;
const DEFAULT_V2_MODEL = "gpt-4.1-nano";
const DEFAULT_V2_TEMPERATURE = 0.1;

const V2_EDITOR_JSON_SCHEMA = Object.freeze({
  name: "editor_v2_editorial",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      headline: { type: "string" },
      body: { type: "string" },
      insufficientEvidence: { type: "boolean" },
      confidence: { type: "number" },
      usedFacts: {
        type: "array",
        items: { type: "string" },
      },
      usedEntities: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["headline", "body", "insufficientEvidence", "confidence"],
  },
});

const V2_EDITOR_SYSTEM_PROMPT =
  "You are a source-grounded Arabic financial news editor. When evidenceSufficiency is SUFFICIENT_MINIMAL or SUFFICIENT_FULL you MUST set insufficientEvidence=false and write concise Arabic headline and body. Output Arabic script only in headline and body when insufficientEvidence is false. Preserve the primary subject, action direction, numbers with units, attribution specificity, roles, and uncertainty exactly. Never invert direction (hike vs fall), never swap the protagonist with a comparator, never map bank charter to unrelated sectors. Never invent people, roles, numbers, quotes, institutions, or causal claims. Write LESS not MORE when evidence is limited.";

function parseEditorialJson(content = "") {
  const trimmed = String(content || "").trim();
  if (!trimmed) return { parsed: null, failure: AI_DIRECT_FAILURE_REASONS.AI_DIRECT_MALFORMED_JSON };
  try {
    return { parsed: JSON.parse(trimmed), failure: null };
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return { parsed: null, failure: AI_DIRECT_FAILURE_REASONS.AI_DIRECT_MALFORMED_JSON };
    try {
      return { parsed: JSON.parse(match[0]), failure: null };
    } catch (_error) {
      return { parsed: null, failure: AI_DIRECT_FAILURE_REASONS.AI_DIRECT_MALFORMED_JSON };
    }
  }
}

function buildDeterministicEditorialOutput(evidence = {}, facts = {}) {
  return buildDeterministicArabicFallback(evidence, facts);
}

function finalizeEditorialResponse(parsed = {}, options = {}) {
  const sufficiencyLevel = options.evidenceSufficiencyLevel || EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL;
  const editorial = {
    headline: String(parsed.headline || "").trim(),
    body: String(parsed.body || "").trim(),
    usedFacts: Array.isArray(parsed.usedFacts) ? parsed.usedFacts : [],
    usedEntities: Array.isArray(parsed.usedEntities) ? parsed.usedEntities : [],
    confidence:
      typeof parsed.confidence === "number"
        ? `ai_${parsed.confidence.toFixed(2)}`
        : String(parsed.confidence || "ai"),
    insufficientEvidence: parsed.insufficientEvidence === true,
    aiDirectFailureReason: null,
  };

  if (!editorial.headline || !editorial.body) {
    editorial.insufficientEvidence = true;
    editorial.aiDirectFailureReason = AI_DIRECT_FAILURE_REASONS.AI_DIRECT_EMPTY_OUTPUT;
    return editorial;
  }

  if (
    editorial.insufficientEvidence &&
    shouldOverrideAiInsufficientEvidence(sufficiencyLevel, editorial)
  ) {
    editorial.insufficientEvidence = false;
    editorial.confidence = "ai_overridden_insufficient";
  }

  if (editorial.headline && editorial.body && !isPredominantlyArabic(`${editorial.headline} ${editorial.body}`)) {
    editorial.insufficientEvidence = true;
    editorial.confidence = "ai_non_arabic";
    editorial.aiDirectFailureReason = AI_DIRECT_FAILURE_REASONS.AI_DIRECT_NON_ARABIC;
  }

  if (editorial.insufficientEvidence && !editorial.aiDirectFailureReason) {
    editorial.aiDirectFailureReason = AI_DIRECT_FAILURE_REASONS.AI_DIRECT_INSUFFICIENT_EVIDENCE;
  }

  return editorial;
}

function buildSemanticContext(evidence = {}, facts = {}) {
  const action = extractActionFromEvidence(evidence);
  const primarySubject = resolvePrimarySubject(evidence, facts, action);
  const attribution = extractAttributionHint(evidence);
  return {
    actionClass: action.actionClass,
    actionArabic: action.actionArabic,
    primarySubject: primarySubject.label || null,
    primarySubjectArabic: primarySubject.arabic || null,
    comparators: (primarySubject.comparators || []).map((c) => c.label),
    attribution: attribution?.type || null,
    attributionArabic: attribution?.arabic || null,
  };
}

function buildEditorialPayload(evidence = {}, facts = {}, options = {}) {
  const sufficiencyLevel = options.evidenceSufficiencyLevel || EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL;
  const semanticContext = buildSemanticContext(evidence, facts);
  return {
    model: options.model || DEFAULT_V2_MODEL,
    temperature: options.temperature ?? DEFAULT_V2_TEMPERATURE,
    max_tokens: 500,
    response_format: {
      type: "json_schema",
      json_schema: V2_EDITOR_JSON_SCHEMA,
    },
    messages: [
      {
        role: "system",
        content: V2_EDITOR_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify({
          evidenceSufficiency: sufficiencyLevel,
          mustWriteArabic: isEvidenceSufficientForEditorial(sufficiencyLevel),
          semanticContext,
          editorialContract: {
            arabicOnlyWhenNotInsufficient: true,
            doNotRefuseForShortEvidence: true,
            writeMinimalStoryWhenLimited: true,
            insufficientEvidenceOnlyWhenNoSafeSentencePossible: true,
            insufficientEvidenceMustBeFalseWhenEvidenceSufficiencyIsNotInsufficient: true,
            preservePrimarySubject: semanticContext.primarySubject,
            preserveActionClass: semanticContext.actionClass,
            preserveAttributionSpecificity: true,
            neverCopyEnglishTitleAsHeadline: true,
            example:
              "SOURCE: BOJ seen hiking to 1.25pct in September... VALID headline: بنك اليابان: توقعات برفع الفائدة إلى 1.25% في سبتمبر",
          },
          evidence,
          facts: {
            people: facts.people,
            organizations: facts.organizations,
            instruments: facts.instruments,
            numbers: (facts.numbers || []).slice(0, 8).map((entry) => entry.raw || entry),
            quotes: facts.quotes,
            attributions: facts.attributions,
            uncertaintyPresent: facts.uncertaintyPresent,
          },
          format: {
            language: "ar",
            headlineMaxChars: 140,
            bodySentences: "1-3",
            noGenericBreaking: true,
          },
        }),
      },
    ],
  };
}

function withOutputPath(editorial = {}, outputPath = V2_OUTPUT_PATHS.FAILED, aiDirectAttempted = false) {
  return {
    ...editorial,
    outputPath,
    aiDirectAttempted,
  };
}

function fallbackFromAiFailure(evidence, facts, aiDirectFailureReason) {
  const fallback = buildDeterministicArabicFallback(evidence, facts);
  return withOutputPath(
    { ...fallback, aiDirectFailureReason },
    V2_OUTPUT_PATHS.DETERMINISTIC_FALLBACK,
    true
  );
}

async function generateEditorV2Editorial(evidence = {}, facts = {}, options = {}) {
  const apiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  const sufficiencyLevel = options.evidenceSufficiencyLevel || EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL;

  if (options.disableAi === true || !apiKey) {
    return withOutputPath(
      buildDeterministicArabicFallback(evidence, facts),
      V2_OUTPUT_PATHS.DETERMINISTIC_FALLBACK,
      false
    );
  }

  const timeoutMs = options.v2TimeoutMs || options.editorTimeoutMs || DEFAULT_V2_TIMEOUT_MS;
  const payload = buildEditorialPayload(evidence, facts, options);

  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", payload, {
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const { parsed, failure: parseFailure } = parseEditorialJson(response.data?.choices?.[0]?.message?.content);
    if (!parsed?.headline || !parsed?.body) {
      return fallbackFromAiFailure(
        evidence,
        facts,
        parseFailure || AI_DIRECT_FAILURE_REASONS.AI_DIRECT_EMPTY_OUTPUT
      );
    }
    const finalized = finalizeEditorialResponse(parsed, { evidenceSufficiencyLevel: sufficiencyLevel });
    if (finalized.insufficientEvidence || !isPredominantlyArabic(`${finalized.headline} ${finalized.body}`)) {
      return fallbackFromAiFailure(
        evidence,
        facts,
        finalized.aiDirectFailureReason || AI_DIRECT_FAILURE_REASONS.AI_DIRECT_INSUFFICIENT_EVIDENCE
      );
    }
    return withOutputPath(
      { ...finalized, aiDirectFailureReason: null },
      V2_OUTPUT_PATHS.AI_DIRECT,
      true
    );
  } catch (error) {
    if (String(error.code || "").includes("ECONNABORTED") || /timeout/i.test(error.message || "")) {
      return withOutputPath(
        {
          headline: "",
          body: "",
          usedFacts: [],
          usedEntities: [],
          confidence: "timeout",
          insufficientEvidence: true,
          timeout: true,
          aiDirectFailureReason: AI_DIRECT_FAILURE_REASONS.AI_DIRECT_TIMEOUT,
        },
        V2_OUTPUT_PATHS.FAILED,
        true
      );
    }
    const apiReason = error.response?.status === 400
      ? AI_DIRECT_FAILURE_REASONS.AI_DIRECT_SCHEMA_INVALID
      : AI_DIRECT_FAILURE_REASONS.AI_DIRECT_API_ERROR;
    return fallbackFromAiFailure(evidence, facts, apiReason);
  }
}

module.exports = {
  DEFAULT_V2_TIMEOUT_MS,
  DEFAULT_V2_MODEL,
  DEFAULT_V2_TEMPERATURE,
  V2_EDITOR_SYSTEM_PROMPT,
  V2_EDITOR_JSON_SCHEMA,
  AI_DIRECT_FAILURE_REASONS,
  generateEditorV2Editorial,
  buildDeterministicEditorialOutput,
  buildEditorialPayload,
  buildSemanticContext,
  parseEditorialJson,
  finalizeEditorialResponse,
};
