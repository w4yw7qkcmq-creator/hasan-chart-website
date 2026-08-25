const axios = require("axios");
const {
  EVIDENCE_SUFFICIENCY,
  shouldOverrideAiInsufficientEvidence,
} = require("./evidence-sufficiency");
const {
  buildDeterministicArabicFallback,
  isPredominantlyArabic,
} = require("./deterministic-arabic-fallback");
const { V2_OUTPUT_PATHS } = require("./mode");

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
  "You are a source-grounded Arabic financial news editor. Output Arabic script only in headline and body when insufficientEvidence is false. Keep proper nouns and standard transliterations where necessary. Never copy the English source title as the final headline. Use ONLY canonical evidence and structured facts. Preserve numbers, attribution, roles, and uncertainty exactly. Never invent people, roles, numbers, quotes, institutions, or causal claims. If evidence supports one factual sentence, set insufficientEvidence=false and write LESS not MORE. When evidence is minimal, shorten the story; do not invent context. Set insufficientEvidence=true ONLY when no conservative factual Arabic sentence can be safely supported.";

function parseEditorialJson(content = "") {
  const trimmed = String(content || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_error) {
      return null;
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
  };

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
  }

  return editorial;
}

function buildEditorialPayload(evidence = {}, facts = {}, options = {}) {
  const sufficiencyLevel = options.evidenceSufficiencyLevel || EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL;
  return {
    model: options.model || DEFAULT_V2_MODEL,
    temperature: options.temperature ?? DEFAULT_V2_TEMPERATURE,
    max_tokens: 450,
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
          editorialContract: {
            arabicOnlyWhenNotInsufficient: true,
            doNotRefuseForShortEvidence: true,
            writeMinimalStoryWhenLimited: true,
            insufficientEvidenceOnlyWhenNoSafeSentencePossible: true,
            insufficientEvidenceMustBeFalseWhenEvidenceSufficiencyIsNotInsufficient: true,
            includePrimarySubjectFromFactsInArabic: true,
            neverCopyEnglishTitleAsHeadline: true,
            example:
              "SOURCE: Bank of Korea expected to keep rates unchanged... VALID: يتوقع أن يُبقي بنك كوريا المركزي أسعار الفائدة دون تغيير...",
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
    const parsed = parseEditorialJson(response.data?.choices?.[0]?.message?.content);
    if (!parsed?.headline || !parsed?.body) {
      return withOutputPath(
        buildDeterministicArabicFallback(evidence, facts),
        V2_OUTPUT_PATHS.DETERMINISTIC_FALLBACK,
        true
      );
    }
    const finalized = finalizeEditorialResponse(parsed, { evidenceSufficiencyLevel: sufficiencyLevel });
    if (finalized.insufficientEvidence || !isPredominantlyArabic(`${finalized.headline} ${finalized.body}`)) {
      return withOutputPath(
        buildDeterministicArabicFallback(evidence, facts),
        V2_OUTPUT_PATHS.DETERMINISTIC_FALLBACK,
        true
      );
    }
    return withOutputPath(finalized, V2_OUTPUT_PATHS.AI_DIRECT, true);
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
        },
        V2_OUTPUT_PATHS.FAILED,
        true
      );
    }
    return withOutputPath(
      buildDeterministicArabicFallback(evidence, facts),
      V2_OUTPUT_PATHS.DETERMINISTIC_FALLBACK,
      true
    );
  }
}

module.exports = {
  DEFAULT_V2_TIMEOUT_MS,
  DEFAULT_V2_MODEL,
  DEFAULT_V2_TEMPERATURE,
  V2_EDITOR_SYSTEM_PROMPT,
  V2_EDITOR_JSON_SCHEMA,
  generateEditorV2Editorial,
  buildDeterministicEditorialOutput,
  buildEditorialPayload,
  parseEditorialJson,
  finalizeEditorialResponse,
};
