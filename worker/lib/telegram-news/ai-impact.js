async function buildAiImpactParagraph(facts, options = {}) {
  const openAiKey = options.openAiKey || process.env.OPENAI_API_KEY;
  const timeoutMs = options.aiTimeoutMs || 5000;

  if (!openAiKey || options.disableAi === true) {
    return {
      usedAi: false,
      title: facts.title,
      impactParagraph: null,
      fallback: true,
      aiResult: "fallback",
    };
  }

  const readOnlyFacts = {
    title: facts.title,
    country: facts.country,
    eventType: facts.eventType,
    previous: facts.previous,
    forecast: facts.forecast,
    actual: facts.actual,
    unit: facts.unit,
    factualSummary: facts.factualSummary,
  };

  try {
    const axios = require("axios");
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4.1-nano",
        messages: [
          {
            role: "system",
            content:
              "اكتب بالعربية فقط. لا تغيّر أي رقم أو اسم أو توقيت. اكتب عنوانًا عربيًا قصيرًا اختياريًا وفقرة تأثير واحدة تذكر الدولار والذهب والأسهم والعملات الرقمية.",
          },
          {
            role: "user",
            content: `حقائق للقراءة فقط:\n${JSON.stringify(readOnlyFacts, null, 2)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 180,
      },
      {
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim() || "";
    if (!content) {
      return {
        usedAi: true,
        rejected: true,
        title: facts.title,
        impactParagraph: null,
        fallback: true,
        aiResult: "fallback",
        reason: "empty_response",
      };
    }

    const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = lines[0]?.replace(/^🚨\s*/, "") || facts.title;
    const impactParagraph = lines.slice(1).join("\n") || lines[0];

    const { validateAiOutputAgainstFacts } = require("./invariants");
    const validation = validateAiOutputAgainstFacts({ title, impactParagraph }, facts);
    if (!validation.ok) {
      console.log(
        "AI_IMPACT_REJECTED_FACT_MISMATCH",
        JSON.stringify({ reason: validation.reason, field: validation.field })
      );
      return {
        usedAi: true,
        rejected: true,
        title: facts.title,
        impactParagraph: null,
        fallback: true,
        aiResult: "rejected_fact_mismatch",
        reason: validation.reason,
      };
    }

    return {
      usedAi: true,
      rejected: false,
      title,
      impactParagraph,
      fallback: false,
      aiResult: "accepted",
    };
  } catch (_error) {
    return {
      usedAi: true,
      rejected: true,
      title: facts.title,
      impactParagraph: null,
      fallback: true,
      aiResult: "fallback",
      reason: "ai_error",
    };
  }
}

function buildRuleBasedImpactParagraph(facts) {
  if (facts.isStructuredTriple && facts.actual && facts.forecast) {
    const { getEconomicReleaseImpactText } = require("../economic-releases/format");
    return getEconomicReleaseImpactText(facts.title, facts.actual, facts.forecast);
  }

  const value = `${facts.title || ""}\n${facts.factualSummary || ""}`.toLowerCase();
  const impacts = {
    dollar: "محايد",
    gold: "محايد",
    stocks: "محايد",
    crypto: "محايد",
  };

  if (/dollar|usd|الدولار|فائدة|fed|cpi|nfp|jobless|unemployment|inflation|التضخم|البطالة/i.test(value)) {
    impacts.dollar = /surge|jump|rally|positive|إيجاب|يرتفع|قوة/i.test(value)
      ? "إيجابي"
      : /fall|drop|decline|negative|سلبي|يهبط|ضعف/i.test(value)
        ? "سلبي"
        : "متباين";
    impacts.gold = impacts.dollar === "إيجابي" ? "سلبي" : impacts.dollar === "سلبي" ? "إيجابي" : "متباين";
  }

  if (/gold|الذهب|xau/i.test(value)) {
    impacts.gold = /surge|jump|rally|يرتفع|صعود/i.test(value) ? "إيجابي" : /fall|drop|decline|يهبط|تراجع/i.test(value) ? "سلبي" : "متباين";
  }

  if (/nasdaq|dow|s&p|stocks|أسهم|indices|مؤشر/i.test(value)) {
    impacts.stocks = /surge|jump|rally|يرتفع|صعود|green/i.test(value) ? "إيجابي" : /fall|drop|decline|plunge|sink|tumble|هبوط|تراجع/i.test(value) ? "سلبي" : "متباين";
  }

  if (/bitcoin|btc|crypto|ethereum|eth|كريبتو|بيتكوين/i.test(value)) {
    impacts.crypto = /surge|jump|rally|يرتفع|صعود/i.test(value) ? "إيجابي" : /fall|drop|decline|plunge|هبوط|تراجع|liquidation|تصفيات/i.test(value) ? "سلبي" : "متباين";
  }

  return [
    `• الدولار: ${impacts.dollar}`,
    `• الذهب: ${impacts.gold}`,
    `• الأسهم: ${impacts.stocks}`,
    `• العملات الرقمية: ${impacts.crypto}`,
  ].join("\n");
}

async function resolveImpactWithAi(facts, options = {}) {
  const aiBuilder = options.aiBuilder || buildAiImpactParagraph;
  const ai = await aiBuilder(facts, options);
  if (!ai.fallback && ai.impactParagraph) {
    return {
      title: ai.title || facts.title,
      impactParagraph: ai.impactParagraph,
      aiImpactUsed: true,
      aiResult: ai.aiResult || "accepted",
      usedFixedTemplate: false,
    };
  }

  return {
    title: facts.title,
    impactParagraph: buildRuleBasedImpactParagraph(facts),
    aiImpactUsed: ai.usedAi === true,
    aiResult: ai.aiResult || "fallback",
    usedFixedTemplate: true,
  };
}

module.exports = {
  buildAiImpactParagraph,
  buildRuleBasedImpactParagraph,
  resolveImpactWithAi,
};
