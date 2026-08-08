const { parseEconomicNumber } = require("../../economic-releases/normalize");

const { getInterpretationMetadata } = require("./interpretation-registry");

const BLOCK_REASONS = {
  HALLUCINATED_NUMERIC_TOKEN: "HALLUCINATED_NUMERIC_TOKEN",
};

const STATIC_REFERENCE_NUMBERS = new Set(["50"]);

function extractNumericTokens(text) {
  return (
    String(text || "")
      .replace(/\u2066|\u2069/g, "")
      .toUpperCase()
      .match(/-?\d+(?:[.,]\d+)?(?:K|M|B|%)?/g) || []
  );
}

function normalizeTokenForCompare(token) {
  const raw = String(token || "").replace(/,/g, "").toUpperCase();
  const num = parseEconomicNumber(raw);
  if (num == null) {
    return raw;
  }
  if (Math.abs(num) >= 1_000_000) {
    return `${Math.round(num / 1_000_000)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${Math.round(num / 1_000)}K`;
  }
  return String(num);
}

function buildStaticAllowedTokens(structuredEvent = {}, options = {}) {
  const allowed = new Set(STATIC_REFERENCE_NUMBERS);
  const eventTypes = options.isFamily
    ? Object.keys(options.facts || {})
    : [structuredEvent.eventType].filter(Boolean);

  for (const eventType of eventTypes) {
    if (!eventType) continue;
    const meta = getInterpretationMetadata(eventType);
    if (meta.pmiThreshold != null) {
      allowed.add(normalizeTokenForCompare(String(meta.pmiThreshold)));
    }
  }
  return allowed;
}

function buildAllowedTokens(facts = {}, options = {}) {
  const allowed = new Set([...buildStaticAllowedTokens(options.structuredEvent || {}, options)]);
  const fields = options.isFamily ? Object.values(facts) : [facts];
  for (const factSet of fields) {
    for (const value of [factSet?.actual, factSet?.forecast, factSet?.previous]) {
      if (!value) continue;
      for (const token of extractNumericTokens(value)) {
        allowed.add(normalizeTokenForCompare(token));
      }
    }
  }
  return allowed;
}

function validateNumericTokenIntegrity(body, facts = {}, options = {}) {
  const allowed = buildAllowedTokens(facts, options);
  const found = extractNumericTokens(body);

  for (const token of found) {
    const normalized = normalizeTokenForCompare(token);
    if (!allowed.has(normalized)) {
      const alt = normalized.replace(/\.$/, "");
      if (!allowed.has(alt)) {
        return {
          ok: false,
          reason: BLOCK_REASONS.HALLUCINATED_NUMERIC_TOKEN,
          token,
          allowed: [...allowed],
        };
      }
    }
  }

  return { ok: true };
}

module.exports = {
  BLOCK_REASONS,
  extractNumericTokens,
  normalizeTokenForCompare,
  buildAllowedTokens,
  validateNumericTokenIntegrity,
};
