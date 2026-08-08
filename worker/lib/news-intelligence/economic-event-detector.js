const { buildCanonicalEventFromCandidate, isNumericEconomicRelease } = require("./event-normalizer");

function extractEconomicTriple(text) {
  const source = String(text || "");
  const pick = (patterns) => {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (match?.[1]) {
        return String(match[1]).trim();
      }
    }
    return null;
  };

  return {
    actual: pick([
      /\bactual\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
      /\bact\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
      /الحالي\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
    ]),
    forecast: pick([
      /\bforecast\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
      /\bexp(?:ected)?\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
      /المتوقع\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
    ]),
    previous: pick([
      /\bprevious\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
      /\bprev(?:ious)?\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
      /السابق\s*[:：]?\s*([0-9.,]+(?:k|m|b|%)?)/i,
    ]),
  };
}

function hasCompleteEconomicTriple(facts = {}) {
  return Boolean(facts.actual && facts.forecast && facts.previous);
}

function detectNumericEconomicReleaseCandidate(input = {}) {
  const title = input.title || "";
  const text = input.text || input.content || input.description || "";
  const combined = `${title}\n${text}`;
  const facts = {
    actual: input.actual || input.facts?.actual || extractEconomicTriple(combined).actual,
    forecast: input.forecast || input.facts?.forecast || extractEconomicTriple(combined).forecast,
    previous: input.previous || input.facts?.previous || extractEconomicTriple(combined).previous,
  };

  const canonical = buildCanonicalEventFromCandidate({
    title,
    rawText: combined,
    releaseDate: input.releaseDate || input.scheduledAt || input.pubDate || input.isoDate || null,
    actual: facts.actual,
    forecast: facts.forecast,
    previous: facts.previous,
    country: input.country || "US",
  });

  const numericEconomic = isNumericEconomicRelease(canonical.eventType);
  const completeTriple = hasCompleteEconomicTriple(facts);

  return {
    isNumericEconomicCandidate: numericEconomic && completeTriple,
    eventType: canonical.eventType,
    eventKey: canonical.eventKey,
    facts,
    canonical,
  };
}

module.exports = {
  extractEconomicTriple,
  hasCompleteEconomicTriple,
  detectNumericEconomicReleaseCandidate,
};
