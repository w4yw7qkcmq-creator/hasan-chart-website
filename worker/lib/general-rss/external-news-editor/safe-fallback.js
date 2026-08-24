const { splitEditorialSections } = require("../publication-format");

const OFFICIAL_CHANNEL_FOOTER = "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";

function buildDeterministicSafeFallback({ evidence = {}, facts = {} } = {}) {
  const headline = String(evidence.sourceTitle || "").trim();
  const snippet = String(evidence.sourceSnippet || evidence.contentEncodedText || "").trim();
  if (!headline) {
    return { ok: false, reason: "missing_headline" };
  }

  const bodySentence = snippet
    ? snippet.replace(/https?:\/\/\S+/g, "").slice(0, 220)
    : headline;

  const body = `🚨 ${headline}\n\n${bodySentence}${OFFICIAL_CHANNEL_FOOTER}`;

  if (body.length < 40) {
    return { ok: false, reason: "fallback_too_short" };
  }

  return {
    ok: true,
    headline,
    body,
    bodySource: "deterministic_safe_fallback",
    factsUsed: {
      numbers: (facts.numbers || []).slice(0, 5).map((entry) => entry.normalized),
      people: (facts.people || []).slice(0, 3).map((entry) => entry.name),
    },
  };
}

function rebuildPresentationFromBody(body = "", headline = "") {
  const sections = splitEditorialSections(body);
  const canonicalHeadline = headline || sections.headlineLine.replace(/^🚨\s*/u, "").trim();
  return {
    message: body,
    headline: canonicalHeadline,
    imageTitle: canonicalHeadline,
  };
}

module.exports = {
  buildDeterministicSafeFallback,
  rebuildPresentationFromBody,
};
