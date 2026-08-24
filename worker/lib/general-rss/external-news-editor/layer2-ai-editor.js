const axios = require("axios");
const { validateExternalNewsDraftIntegrity } = require("./layer1-integrity");
const { EDITOR_REASON_CODES } = require("./reason-codes");

const DEFAULT_EDITOR_TIMEOUT_MS = 10_000;
const DEFAULT_MODEL = "gpt-4.1-nano";

function parseEditorJson(content = "") {
  const trimmed = String(content || "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (_) {
    return null;
  }
}

async function reviewExternalNewsWithAi(input = {}, options = {}) {
  const apiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
  if (options.disableAi === true || !apiKey) {
    const l1 = validateExternalNewsDraftIntegrity(input);
    if (l1.ok) {
      return { verdict: "APPROVE", issues: [], confidence: 70, source: "deterministic_only" };
    }
    const repairable = l1.issues.every((issue) => issue.repairable || issue.severity !== "error");
    return {
      verdict: repairable ? "REPAIR" : "BLOCK",
      issues: l1.issues.map((issue) => issue.code),
      confidence: 60,
      source: "deterministic_only",
    };
  }

  const timeoutMs = options.editorTimeoutMs || DEFAULT_EDITOR_TIMEOUT_MS;
  const payload = {
    model: options.model || DEFAULT_MODEL,
    temperature: 0.1,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "You are the RSS external-news Editor-in-Chief. Review Arabic draft against structured source facts. Return JSON only with keys: verdict (APPROVE|REPAIR|BLOCK), issues (array of codes), repairedHeadline, repairedBody, confidence (0-100). Never add numbers, people, roles, quotes, or causal claims not supported by facts. Never upgrade uncertainty.",
      },
      {
        role: "user",
        content: JSON.stringify({
          evidenceSummary: {
            source: input.evidence?.source,
            sourceTitle: input.evidence?.sourceTitle,
            sourceSnippet: input.evidence?.sourceSnippet,
            uncertaintyPresent: input.facts?.uncertaintyPresent,
          },
          facts: input.facts,
          draft: {
            headline: input.draft?.headline,
            body: input.draft?.body,
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
    const parsed = parseEditorJson(response.data?.choices?.[0]?.message?.content);
    if (!parsed?.verdict) {
      return { verdict: "BLOCK", issues: ["invalid_editor_response"], confidence: 0, source: "ai" };
    }
    return { ...parsed, source: "ai" };
  } catch (error) {
    if (String(error.code || "").includes("ECONNABORTED") || /timeout/i.test(error.message || "")) {
      return { verdict: "TIMEOUT", issues: [EDITOR_REASON_CODES.EDITOR_TIMEOUT], confidence: 0, source: "ai" };
    }
    return { verdict: "BLOCK", issues: ["editor_ai_failed"], confidence: 0, source: "ai" };
  }
}

module.exports = {
  DEFAULT_EDITOR_TIMEOUT_MS,
  DEFAULT_MODEL,
  reviewExternalNewsWithAi,
};
