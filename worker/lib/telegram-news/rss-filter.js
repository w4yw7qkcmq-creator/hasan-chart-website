const { extractField } = require("./extractor");

const STRUCTURED_FIELD_PATTERN =
  /(?:السابق|previous|المتوقع|forecast|consensus|expected|الحالي|actual)\s*[:：]/i;

function rssItemHasStructuredTripleFields(item = {}) {
  const text = `${item.title || ""}\n${item.contentSnippet || ""}\n${item.content || ""}\n${item.summary || ""}`;
  if (!STRUCTURED_FIELD_PATTERN.test(text)) {
    return false;
  }

  const previous = extractField(text, "previous");
  const forecast = extractField(text, "forecast");
  const actual = extractField(text, "actual");
  return Boolean(previous || forecast || actual);
}

function filterGeneralRssItems(items = []) {
  return items.filter((item) => !rssItemHasStructuredTripleFields(item));
}

function markRssItemsAsGeneralOnly(items = []) {
  return items.map((item) => ({
    ...item,
    isRssGeneralOnly: true,
    isTelegramSource: false,
  }));
}

module.exports = {
  rssItemHasStructuredTripleFields,
  filterGeneralRssItems,
  markRssItemsAsGeneralOnly,
};
