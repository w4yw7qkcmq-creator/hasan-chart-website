const ENGLISH_LINE_PATTERN = /[A-Za-z]{4,}/;
const UNCERTAINTY_IMPACT_PATTERN = /التأثير\s*:\s*(غير مؤكد|غير واضح|غير معروف|متباين)/i;
const IMPACT_LINE_PATTERN = /^\s*(?:📊\s*)?(?:التأثير|تأثير الخبر|النتيجة)\s*[:：]/i;

function sanitizeRssDraftAiText(aiText = "", options = {}) {
  const title = String(options.title || "");
  const isEconomicReleaseTitle = typeof options.isEconomicReleaseTitle === "function"
    ? options.isEconomicReleaseTitle(title)
    : Boolean(options.isEconomicReleaseTitle);

  const rawLines = String(aiText || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/رابط المصدر:?/gi, "")
    .replace(/المصدر:?/gi, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const removedEnglishLines = [];
  const keptLines = [];

  for (const line of rawLines) {
    if (ENGLISH_LINE_PATTERN.test(line)) {
      removedEnglishLines.push(line);
      continue;
    }
    if (UNCERTAINTY_IMPACT_PATTERN.test(line)) {
      continue;
    }
    if (!isEconomicReleaseTitle && IMPACT_LINE_PATTERN.test(line)) {
      continue;
    }
    keptLines.push(line);
  }

  const cleanedText = keptLines.join("\n").trim();
  const meaningfulLine = keptLines.find((line) => line.replace(/[^\u0600-\u06FFa-z0-9]/gi, "").length >= 12);

  if (!cleanedText || ENGLISH_LINE_PATTERN.test(cleanedText)) {
    return {
      ok: false,
      cleanedText: "",
      reason: "english_or_empty_output",
      removedEnglishLines,
    };
  }

  if (!meaningfulLine && removedEnglishLines.length > 0) {
    return {
      ok: false,
      cleanedText: "",
      reason: "english_filter_removed_all_meaningful_content",
      removedEnglishLines,
    };
  }

  return {
    ok: true,
    cleanedText,
    reason: null,
    removedEnglishLines,
  };
}

module.exports = {
  sanitizeRssDraftAiText,
};
