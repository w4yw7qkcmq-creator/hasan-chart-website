const AI_BUDGET_MS = 2500;

function isDeterministicComplete(structured = {}) {
  return Boolean(
    structured.headline &&
      structured.factsBlock &&
      structured.interpretation &&
      structured.marketImpact &&
      structured.interpretation.length >= 20
  );
}

function isFamilyDeterministicComplete(structured = {}) {
  return Boolean(
    structured.headline &&
      Array.isArray(structured.children) &&
      structured.children.length > 0 &&
      structured.interpretation &&
      structured.marketImpact
  );
}

async function maybeEnhanceWithAi(structured, deterministic, structuredEvent, options = {}) {
  const startedAt = Date.now();
  const forceAi = options.forceAi === true;
  const disableAi = options.disableAi === true || !options.openAiClient;

  if (disableAi && !forceAi) {
    return {
      aiUsed: false,
      aiReason: options.disableAi ? "ai_disabled" : "openai_unconfigured",
      deterministicMs: Date.now() - startedAt,
      aiMs: 0,
    };
  }

  const familyMode = Boolean(structuredEvent.eventFamily && structuredEvent.children);
  const complete = familyMode ? isFamilyDeterministicComplete(structured) : isDeterministicComplete(structured);

  if (complete && !forceAi) {
    return {
      aiUsed: false,
      aiReason: "deterministic_sufficient",
      deterministicMs: Date.now() - startedAt,
      aiMs: 0,
    };
  }

  if (!options.openAiClient) {
    return {
      aiUsed: false,
      aiReason: "openai_unconfigured",
      deterministicMs: Date.now() - startedAt,
      aiMs: 0,
    };
  }

  try {
    const aiStarted = Date.now();
    const prompt = buildAiPrompt(structured, deterministic, structuredEvent);
    const response = await Promise.race([
      options.openAiClient.complete(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ai_timeout")), AI_BUDGET_MS)),
    ]);

    const parsed = parseAiResponse(response);
    if (!parsed.ok) {
      return {
        aiUsed: false,
        aiReason: parsed.reason || "ai_schema_invalid",
        deterministicMs: aiStarted - startedAt,
        aiMs: Date.now() - aiStarted,
      };
    }

    return {
      aiUsed: true,
      aiReason: "editorial_enhancement",
      enhancements: {
        interpretation: parsed.interpretationText || structured.interpretation,
        marketImpact: parsed.impactText || structured.marketImpact,
      },
      deterministicMs: aiStarted - startedAt,
      aiMs: Date.now() - aiStarted,
    };
  } catch (error) {
    return {
      aiUsed: false,
      aiReason: error.message === "ai_timeout" ? "ai_timeout" : "ai_failed",
      deterministicMs: Date.now() - startedAt,
      aiMs: 0,
    };
  }
}

function buildAiPrompt(structured, deterministic, structuredEvent) {
  return JSON.stringify({
    role: "editor_only",
    rules: [
      "Do not change numbers",
      "Do not invent market moves",
      "Return JSON only with interpretationText and impactText",
    ],
    headline: structured.headline,
    facts: structured.factsBlock || structuredEvent,
    deterministicInterpretation: structured.interpretation,
    deterministicImpact: structured.marketImpact,
    usdBias: deterministic.familyUsdBias || deterministic.usdBias,
  });
}

function parseAiResponse(response) {
  if (!response) {
    return { ok: false, reason: "empty_ai_response" };
  }
  let parsed;
  try {
    parsed = typeof response === "string" ? JSON.parse(response) : response;
  } catch {
    return { ok: false, reason: "ai_json_parse_failed" };
  }
  if (!parsed.interpretationText && !parsed.impactText) {
    return { ok: false, reason: "ai_schema_missing_fields" };
  }
  return {
    ok: true,
    interpretationText: String(parsed.interpretationText || "").trim(),
    impactText: String(parsed.impactText || "").trim(),
  };
}

module.exports = {
  maybeEnhanceWithAi,
  AI_BUDGET_MS,
  isDeterministicComplete,
};
