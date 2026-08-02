const { OPENAI_MODEL, OPENAI_TIMEOUT_MS } = require("./constants");
const { formatPrice } = require("./utils");

const ALLOWED_EXPLANATION_FIELDS = new Set([
  "executiveSummary",
  "institutionalView",
  "classicTechnicalView",
  "whyThisDecision",
  "whatToWaitFor",
  "riskWarning",
]);

function extractJsonObject(value) {
  const text = String(value || "").trim();
  try {
    return JSON.parse(text);
  } catch (_error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("INVALID_AI_JSON");
  }
}

function sanitizeExplanationPayload(parsed, fallback) {
  const out = { ...fallback };

  for (const key of ALLOWED_EXPLANATION_FIELDS) {
    if (!(key in parsed)) continue;
    if (key === "whyThisDecision" || key === "whatToWaitFor") {
      out[key] = Array.isArray(parsed[key]) ? parsed[key].map(String) : fallback[key];
    } else if (typeof parsed[key] === "string" && parsed[key].trim()) {
      out[key] = parsed[key].trim();
    }
  }

  return out;
}

function buildDeterministicExplanation(result) {
  const d = result.decision;
  const m = result.market;
  const plan = result.tradePlan;

  return {
    executiveSummary: `${result.symbol} — القرار: ${d.state} (${d.opportunityGrade}, ثقة ${d.confidence}%).`,
    institutionalView: result.evidence
      .filter((e) => e.weight > 0.4)
      .map((e) => `${e.label}: ${e.description}`)
      .join(" · ") || "لا توجد أدلة مؤسسية قوية حالياً.",
    classicTechnicalView: `الاتجاه ${m.trend}، التقلب ${m.volatility}، توافق الأطر ${m.alignment}.`,
    whyThisDecision: [d.primaryReason, d.waitReason].filter(Boolean),
    whatToWaitFor: plan.isActionable
      ? [plan.trigger]
      : [d.waitReason || "تأكيد BOS/CHOCH وإعادة اختبار منطقة الهيكل"],
    riskWarning:
      "هذا تحليل تقني تعليمي وليس ضماناً للربح أو نصيحة مالية شخصية. التزم بإدارة المخاطر.",
  };
}

async function enrichWithOpenAiExplanation({ result, openaiApiKey, fetchImpl = fetch }) {
  const fallback = buildDeterministicExplanation(result);

  if (!openaiApiKey) {
    return { explanation: fallback, source: "deterministic", tokenUsage: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.25,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "أنت محلل مؤسساتي لمنصة HasaN CharT World. ممنوع تغيير أي رقم أو قرار. ممنوع ذكر مستويات سعرية رقمية جديدة. أعد JSON فقط بالحقول: executiveSummary, institutionalView, classicTechnicalView, whyThisDecision, whatToWaitFor, riskWarning.",
          },
          {
            role: "user",
            content: JSON.stringify({
              computedResult: {
                symbol: result.symbol,
                decision: { state: result.decision?.state, direction: result.decision?.direction },
                evidence: result.evidence,
              },
            }),
          },
        ],
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return { explanation: fallback, source: "fallback_openai_error", tokenUsage: data?.usage || null };
    }

    const content = data?.choices?.[0]?.message?.content;
    const parsed = extractJsonObject(content);

    return {
      explanation: sanitizeExplanationPayload(parsed, fallback),
      source: "openai",
      tokenUsage: data?.usage || null,
    };
  } catch (_error) {
    return { explanation: fallback, source: "fallback_openai_timeout", tokenUsage: null };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  ALLOWED_EXPLANATION_FIELDS,
  sanitizeExplanationPayload,
  buildDeterministicExplanation,
  enrichWithOpenAiExplanation,
};
