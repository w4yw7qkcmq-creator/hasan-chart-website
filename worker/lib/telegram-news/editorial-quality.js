const { isGenericTitle, normalizeTitleText } = require("./editorial-title");
const { sentenceOverlapRatio } = require("./editorial");

const CHANNEL_NAME_PATTERN = /forexbreakingnews|forexnewspaper/i;
const PROMO_URL_PATTERN = /https?:\/\/(?:one\.)?exness|t\.me\/(?:Forex|joinchat|\+)/i;

function validateFinalEditorialQuality(message, facts = {}, context = {}) {
  const text = String(message || "");
  const issues = [];
  const headlineMatch = text.match(/^🚨\s*(.+?)(?:\n|$)/);
  const headline = headlineMatch ? normalizeTitleText(headlineMatch[1]) : "";

  if (!headline || isGenericTitle(headline)) {
    issues.push("generic_title");
  }

  if (context.template === "general" && text.length > 600) {
    issues.push("character_limit_exceeded");
  }

  if (headline && text.includes(headline) && text.indexOf(headline) !== text.lastIndexOf(headline)) {
    issues.push("headline_repeated");
  }

  const bulletCount = (text.match(/^•\s+/gm) || []).length;
  if (bulletCount > 3) {
    issues.push("too_many_bullets");
  }

  if (context.sourceText && sentenceOverlapRatio(context.sourceText, text) >= 0.55) {
    issues.push("high_similarity");
  }

  if (CHANNEL_NAME_PATTERN.test(text)) {
    issues.push("channel_name_leak");
  }
  if (PROMO_URL_PATTERN.test(text)) {
    issues.push("promo_link_leak");
  }
  if (/🕒|2026\/|بتوقيت\s*سوريا/i.test(text)) {
    issues.push("timestamp_footer");
  }
  if (/غير\s*متوفر|not available|n\/a/i.test(text)) {
    issues.push("placeholder_text");
  }

  const factNumbers = [...(facts.numbers || []), ...(facts.rawNumbers || [])]
    .map((n) => String(n).replace(/[^\d.%\-]/g, ""))
    .filter((n) => n.length >= 2);
  const draftNumbers = (text.match(/-?\d+(?:\.\d+)?%?/g) || []).map((n) => n.replace(/[^\d.%\-]/g, ""));
  for (const num of draftNumbers) {
    if (num.length < 2 || /202[0-9]|201[0-9]/.test(num)) {
      continue;
    }
    const found = factNumbers.some((src) => src.includes(num) || num.includes(src));
    if (!found) {
      issues.push(`unknown_number:${num}`);
    }
  }

  if ((context.storyCount || 1) > 1) {
    issues.push("multi_story_in_one_message");
  }

  const impactSection = text.split("📊 التأثير المحتمل:")[1] || "";
  const summarySection = text.split("📊 التأثير المحتمل:")[0] || text;
  if (impactSection && summarySection && impactSection.trim().length > 20) {
    const overlap = sentenceOverlapRatio(summarySection, impactSection);
    if (overlap >= 0.45) {
      issues.push("impact_repeats_fact");
    }
  }

  if (!/[A-Za-z\u0600-\u06FF]{8,}/.test(text)) {
    issues.push("missing_clear_fact");
  }

  return {
    ok: issues.length === 0,
    issues,
    reason: issues[0] || null,
  };
}

module.exports = {
  validateFinalEditorialQuality,
};
