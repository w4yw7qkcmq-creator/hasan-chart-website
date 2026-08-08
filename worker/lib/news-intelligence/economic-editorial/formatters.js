function formatTelegramBody(bodyOrStructured) {
  if (typeof bodyOrStructured === "string") {
    return bodyOrStructured.trim();
  }
  return String(bodyOrStructured?.body || "").trim();
}

function formatSiteFields(editorialResult = {}) {
  const structured = editorialResult.structured || {};
  return {
    title: structured.headline,
    content: editorialResult.body,
    headline: structured.headline,
    countryLine: structured.countryLine,
    factsBlock: structured.factsBlock,
    interpretation: structured.interpretation,
    marketImpact: structured.marketImpact,
    importance: structured.importance || "HIGH",
    editorialVersion: structured.editorialVersion || editorialResult.editorialVersion,
    imageUrl: editorialResult.imageUrl || editorialResult.imageMeta?.url || null,
  };
}

module.exports = {
  formatTelegramBody,
  formatSiteFields,
};
