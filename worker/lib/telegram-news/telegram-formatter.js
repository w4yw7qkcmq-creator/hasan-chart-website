const { removeSemanticRepetition } = require("./repetition");

const TIMESTAMP_FOOTER_PATTERN =
  /(?:🕒\s*)?(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}).*(?:ص|م|am|pm)?\s*$/i;

function collapseBlankLines(text) {
  return String(text || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTimestampFooter(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim());

  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (
      TIMESTAMP_FOOTER_PATTERN.test(last) ||
      /^🕒/.test(last) ||
      /بتوقيت\s*سوريا/i.test(last) ||
      /^توقيت\s*الإصدار/i.test(last)
    ) {
      lines.pop();
      continue;
    }
    break;
  }

  return collapseBlankLines(lines.join("\n"));
}

function trimToLimit(text, maxChars) {
  if (!maxChars || text.length <= maxChars) {
    return text;
  }
  const trimmed = text.slice(0, maxChars);
  const lastBreak = Math.max(trimmed.lastIndexOf("\n"), trimmed.lastIndexOf(". "));
  return (lastBreak > maxChars * 0.6 ? trimmed.slice(0, lastBreak) : trimmed).trim() + "…";
}

function formatTelegramNewsMessage({ template, headline, country, previous, forecast, actual, summary, bullets, impact }) {
  const cleaned = removeSemanticRepetition({ headline, summary, bullets, impact });

  if (template === "pre_event") {
    const body = [
      `⏳ ${cleaned.headline}`,
      "",
      cleaned.summary,
      "",
      "⚠️ قد تشهد الأسواق تقلبات مرتفعة، خصوصًا على:",
      ...cleaned.bullets.map((b) => `• ${b}`),
    ];
    return stripTimestampFooter(trimToLimit(collapseBlankLines(body.join("\n")), 650));
  }

  if (template === "economic") {
    const body = [
      `🚨 ${cleaned.headline}`,
      "",
      `🌍 ${country || "الولايات المتحدة"}`,
      "",
      previous ? `السابق: ${previous}` : null,
      forecast ? `المتوقع: ${forecast}` : null,
      actual ? `الحالي: ${actual}` : null,
      "",
      cleaned.impact ? "📊 التأثير المحتمل:" : null,
      cleaned.impact || null,
    ].filter((line) => line !== null);
    return stripTimestampFooter(trimToLimit(collapseBlankLines(body.join("\n")), 750));
  }

  const body = [
    `🚨 ${cleaned.headline}`,
    "",
    cleaned.summary || null,
    cleaned.bullets.length >= 2 ? "" : null,
    cleaned.bullets.length >= 2 ? "📌 أبرز التفاصيل:" : null,
    ...(cleaned.bullets.length >= 2 ? cleaned.bullets.map((b) => `• ${b}`) : []),
    cleaned.impact ? "" : null,
    cleaned.impact ? "📊 التأثير المحتمل:" : null,
    cleaned.impact || null,
  ].filter((line) => line !== null);

  return stripTimestampFooter(trimToLimit(collapseBlankLines(body.join("\n")), 1000));
}

module.exports = {
  formatTelegramNewsMessage,
  stripTimestampFooter,
  collapseBlankLines,
  trimToLimit,
};
