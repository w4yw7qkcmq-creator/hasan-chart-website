const axios = require("axios");
const {
  EVIDENCE_SUFFICIENCY,
  shouldOverrideAiInsufficientEvidence,
} = require("./evidence-sufficiency");

const DEFAULT_V2_TIMEOUT_MS = 12_000;
const DEFAULT_V2_MODEL = "gpt-4.1-nano";

const V2_EDITOR_SYSTEM_PROMPT =
  "You are a source-grounded Arabic financial news editor. Write ONLY in Arabic script for headline and body. Never copy the English title verbatim. Use ONLY the provided canonical evidence and structured facts. Write concise professional Arabic. Preserve numbers, attribution, roles, and uncertainty exactly. Never invent people, roles, numbers, quotes, institutions, or causal claims. Do not refuse merely because evidence is short. If the source title and snippet contain one clear factual development, write only that development in Arabic and nothing more. If evidence is limited, shorten the story — do not invent context. Set insufficientEvidence=true ONLY when even one conservative factual Arabic sentence cannot be safely supported from the evidence. Return strict JSON only with keys: headline, body, usedFacts, usedEntities, confidence, insufficientEvidence. No markdown.";

function parseEditorialJson(content = "") {
  const trimmed = String(content || "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_) {
    return null;
  }
}

function buildDeterministicEditorialOutput(evidence = {}, facts = {}) {
  const title = String(evidence.title || "").trim();
  const snippet = String(evidence.description || evidence.contentEncoded || "").trim();
  if (!title || title.length < 12) {
    return {
      headline: "",
      body: "",
      usedFacts: [],
      usedEntities: [],
      confidence: "deterministic",
      insufficientEvidence: true,
    };
  }

  const primaryPerson = (facts.people || [])[0];
  const headline = primaryPerson?.arabicRole
    ? `${primaryPerson.arabicRole} ${primaryPerson.name}: ${title.slice(0, 90)}`
    : title.slice(0, 120);
  const bodySentence = snippet
    ? snippet.replace(/https?:\/\/\S+/g, "").slice(0, 220)
    : title;

  return {
    headline: headline.slice(0, 140),
    body: bodySentence,
    usedFacts: [title, snippet].filter(Boolean),
    usedEntities: (facts.people || []).map((person) => person.name),
    confidence: "deterministic",
    insufficientEvidence: false,
  };
}

function finalizeEditorialResponse(parsed = {}, options = {}) {
  const sufficiencyLevel = options.evidenceSufficiencyLevel || EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL;
  const editorial = {
    headline: String(parsed.headline || "").trim(),
    body: String(parsed.body || "").trim(),
    usedFacts: Array.isArray(parsed.usedFacts) ? parsed.usedFacts : [],
    usedEntities: Array.isArray(parsed.usedEntities) ? parsed.usedEntities : [],
    confidence: parsed.confidence || "ai",
    insufficientEvidence: parsed.insufficientEvidence === true,
  };

  if (
    editorial.insufficientEvidence &&
    shouldOverrideAiInsufficientEvidence(sufficiencyLevel, editorial)
  ) {
    editorial.insufficientEvidence = false;
    editorial.confidence = parsed.confidence || "ai_overridden_insufficient";
  }

  const arabicChars = (editorial.headline + editorial.body).match(/[\u0600-\u06FF]/g)?.length || 0;
  const latinChars = (editorial.headline + editorial.body).match(/[A-Za-z]/g)?.length || 0;
  if (editorial.headline && editorial.body && latinChars > arabicChars * 1.2) {
    editorial.insufficientEvidence = true;
    editorial.confidence = "ai_non_arabic";
  }

  return editorial;
}

async function generateEditorV2Editorial(evidence = {}, facts = {}, options = {}) {
  const apiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  if (options.disableAi === true || !apiKey) {
    return buildDeterministicEditorialOutput(evidence, facts);
  }

  const sufficiencyLevel = options.evidenceSufficiencyLevel || EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL;
  const timeoutMs = options.v2TimeoutMs || options.editorTimeoutMs || DEFAULT_V2_TIMEOUT_MS;
  const payload = {
    model: options.model || DEFAULT_V2_MODEL,
    temperature: 0.2,
    max_tokens: 450,
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
            doNotRefuseForShortEvidence: true,
            writeMinimalStoryWhenLimited: true,
            insufficientEvidenceOnlyWhenNoSafeSentencePossible: true,
            insufficientEvidenceMustBeFalseWhenEvidenceSufficiencyIsNotInsufficient: true,
            includePrimarySubjectFromFactsInArabic: true,
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
      return {
        headline: "",
        body: "",
        usedFacts: [],
        usedEntities: [],
        confidence: "ai_invalid",
        insufficientEvidence: true,
      };
    }
    return finalizeEditorialResponse(parsed, { evidenceSufficiencyLevel: sufficiencyLevel });
  } catch (error) {
    if (String(error.code || "").includes("ECONNABORTED") || /timeout/i.test(error.message || "")) {
      return {
        headline: "",
        body: "",
        usedFacts: [],
        usedEntities: [],
        confidence: "timeout",
        insufficientEvidence: true,
        timeout: true,
      };
    }
    return {
      headline: "",
      body: "",
      usedFacts: [],
      usedEntities: [],
      confidence: "ai_failed",
      insufficientEvidence: true,
    };
  }
}

module.exports = {
  DEFAULT_V2_TIMEOUT_MS,
  DEFAULT_V2_MODEL,
  V2_EDITOR_SYSTEM_PROMPT,
  generateEditorV2Editorial,
  buildDeterministicEditorialOutput,
  parseEditorialJson,
  finalizeEditorialResponse,
};
