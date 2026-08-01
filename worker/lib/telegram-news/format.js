const { getEconomicReleaseImpactText } = require("../economic-releases/format");
const { validateEconomicReleaseCompleteness } = require("../economic-releases/completeness");
const { mergeProviderEvents } = require("../economic-releases/normalize");
const { validateFinalMessageAgainstFacts } = require("./invariants");
const { resolveImpactWithAi } = require("./ai-impact");

const SYRIA_TZ = "Asia/Damascus";

function formatSyriaTime(isoDate) {
  if (!isoDate) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("ar-SY", {
      timeZone: SYRIA_TZ,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoDate));
  } catch (_error) {
    return isoDate;
  }
}

function inferGeneralMarketImpact(text) {
  const value = String(text || "").toLowerCase();
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
    impacts.gold = /surge|jump|rally|يرتفع|صعود/i.test(value)
      ? "إيجابي"
      : /fall|drop|decline|يهبط|تراجع/i.test(value)
        ? "سلبي"
        : "متباين";
  }

  if (/nasdaq|dow|s&p|stocks|أسهم|indices|مؤشر/i.test(value)) {
    impacts.stocks = /surge|jump|rally|يرتفع|صعود|green/i.test(value)
      ? "إيجابي"
      : /fall|drop|decline|plunge|sink|tumble|هبوط|تراجع/i.test(value)
        ? "سلبي"
        : "متباين";
  }

  if (/bitcoin|btc|crypto|ethereum|eth|كريبتو|بيتكوين/i.test(value)) {
    impacts.crypto = /surge|jump|rally|يرتفع|صعود/i.test(value)
      ? "إيجابي"
      : /fall|drop|decline|plunge|هبوط|تراجع|liquidation|تصفيات/i.test(value)
        ? "سلبي"
        : "متباين";
  }

  return impacts;
}

function buildFixedEconomicTemplate({ facts, post, impactText }) {
  const syriaTime = formatSyriaTime(post.sourcePublishedAt);
  return [
    `🚨 ${facts.title}`,
    "",
    `🌍 ${facts.country || "الولايات المتحدة"}`,
    "",
    `السابق: ${facts.previous || facts.revisedPrevious}`,
    `المتوقع: ${facts.forecast}`,
    `الحالي: ${facts.actual}`,
    "",
    "📊 التأثير المحتمل على الأسواق:",
    impactText,
    "",
    syriaTime ? `🕒 توقيت الإصدار بتوقيت سوريا: ${syriaTime}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function formatHasanChartEconomicNews({ facts, post }, options = {}) {
  const merged = mergeProviderEvents([
    {
      eventKey: facts.canonicalEventKey,
      title: facts.title,
      country: facts.country || "US",
      previous: facts.previous,
      revisedPrevious: facts.revisedPrevious,
      forecast: facts.forecast,
      actual: facts.actual,
      sourceName: post.sourceChannel,
      sourceTimestamp: post.sourcePublishedAt,
    },
  ]);

  const validation = validateEconomicReleaseCompleteness(merged, facts.canonical);

  if (!validation.complete) {
    return {
      formatted: null,
      validation,
      skipPublish: true,
      reason: validation.reason || "ECONOMIC_RELEASE_DROPPED_INCOMPLETE",
      missingFields: validation.missingFields,
      aiImpactUsed: false,
      aiResult: "none",
    };
  }

  const impactResolved = await resolveImpactWithAi(facts, options);
  const formatted = buildFixedEconomicTemplate({
    facts: { ...facts, title: impactResolved.title || facts.title },
    post,
    impactText: impactResolved.impactParagraph,
  });

  const factCheck = validateFinalMessageAgainstFacts(formatted, facts);
  if (!factCheck.ok) {
    const fixedTemplate = buildFixedEconomicTemplate({
      facts,
      post,
      impactText: impactResolved.impactParagraph,
    });
    return {
      formatted: fixedTemplate,
      fixedTemplate,
      validation,
      skipPublish: false,
      reason: factCheck.reason,
      missingFields: [],
      aiImpactUsed: false,
      aiResult: "fallback",
      usedFixedTemplate: true,
    };
  }

  return {
    formatted,
    validation,
    skipPublish: false,
    reason: "complete",
    missingFields: [],
    aiImpactUsed: impactResolved.aiImpactUsed,
    aiResult: impactResolved.aiResult,
    usedFixedTemplate: impactResolved.usedFixedTemplate,
  };
}

async function formatHasanChartGeneralNews({ facts, post }, options = {}) {
  const headline = facts.title || facts.detailLines[0] || "خبر سوق";
  const whatHappened =
    facts.detailLines.find((line) => line.length > 20 && !/^🚨|^🟥|^🔴/.test(line)) ||
    facts.detailLines.slice(0, 2).join("\n") ||
    headline;
  const details = facts.detailLines
    .filter((line) => line !== headline && line !== whatHappened && !facts.exclusiveAnalysisDetected)
    .slice(0, 4)
    .join("\n");

  let impactsBlock;
  let aiImpactUsed = false;
  let aiResult = "fallback";

  if (options.disableAi !== true) {
    const impactResolved = await resolveImpactWithAi(facts, options);
    impactsBlock = impactResolved.impactParagraph;
    aiImpactUsed = impactResolved.aiImpactUsed;
    aiResult = impactResolved.aiResult;
  } else {
    const impacts = inferGeneralMarketImpact(`${headline}\n${facts.detailLines.join("\n")}`);
    impactsBlock = [
      `• الدولار: ${impacts.dollar}`,
      `• الذهب: ${impacts.gold}`,
      `• الأسهم: ${impacts.stocks}`,
      `• العملات الرقمية: ${impacts.crypto}`,
    ].join("\n");
  }

  const formatted = [
    `🚨 ${headline}`,
    "",
    "ما الذي حدث؟",
    whatHappened,
    "",
    details ? "أهم التفاصيل" : null,
    details || null,
    "",
    "📊 التأثير المحتمل على الأسواق:",
    impactsBlock,
    "",
    post.sourcePublishedAt ? `🕒 ${formatSyriaTime(post.sourcePublishedAt)}` : null,
  ]
    .filter((line) => line !== null && line !== "")
    .join("\n");

  return {
    formatted,
    validation: { complete: true, reason: "plain_news" },
    skipPublish: false,
    reason: "plain_news",
    missingFields: [],
    aiImpactUsed,
    aiResult,
    usedFixedTemplate: aiResult !== "accepted",
  };
}

async function formatTelegramPost(post, facts, options = {}) {
  if (facts.isPlainFedNews) {
    return formatHasanChartGeneralNews({ facts, post }, options);
  }

  if (facts.isStructuredTriple) {
    return formatHasanChartEconomicNews({ facts, post }, options);
  }

  return formatHasanChartGeneralNews({ facts, post }, options);
}

module.exports = {
  formatSyriaTime,
  formatHasanChartEconomicNews,
  formatHasanChartGeneralNews,
  formatTelegramPost,
  inferGeneralMarketImpact,
  buildFixedEconomicTemplate,
};
