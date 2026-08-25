const axios = require("axios");

const DEFAULT_V2_TIMEOUT_MS = 12_000;
const DEFAULT_V2_MODEL = "gpt-4.1-nano";

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

async function generateEditorV2Editorial(evidence = {}, facts = {}, options = {}) {
  const apiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  if (options.disableAi === true || !apiKey) {
    return buildDeterministicEditorialOutput(evidence, facts);
  }

  const timeoutMs = options.v2TimeoutMs || options.editorTimeoutMs || DEFAULT_V2_TIMEOUT_MS;
  const payload = {
    model: options.model || DEFAULT_V2_MODEL,
    temperature: 0.2,
    max_tokens: 450,
    messages: [
      {
        role: "system",
        content:
          "You are a source-grounded Arabic financial news editor. Use ONLY the provided canonical evidence and structured facts. Write concise professional Arabic. Preserve numbers, attribution, roles, and uncertainty exactly. Never invent people, roles, numbers, quotes, institutions, or causal claims. Return strict JSON only with keys: headline, body, usedFacts, usedEntities, confidence, insufficientEvidence. No markdown.",
      },
      {
        role: "user",
        content: JSON.stringify({
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
    return {
      headline: String(parsed.headline || "").trim(),
      body: String(parsed.body || "").trim(),
      usedFacts: Array.isArray(parsed.usedFacts) ? parsed.usedFacts : [],
      usedEntities: Array.isArray(parsed.usedEntities) ? parsed.usedEntities : [],
      confidence: parsed.confidence || "ai",
      insufficientEvidence: parsed.insufficientEvidence === true,
    };
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
  generateEditorV2Editorial,
  buildDeterministicEditorialOutput,
  parseEditorialJson,
};
