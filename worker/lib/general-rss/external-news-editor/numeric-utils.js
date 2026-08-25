function normalizeNumericToken(token = "") {
  const raw = String(token || "")
    .replace(/,/g, "")
    .replace(/\u066B/g, ".")
    .replace(/[^\d.\-+kmb%$€£¥]/gi, "")
    .trim()
    .toUpperCase();
  if (!raw) return null;

  const percent = raw.endsWith("%");
  const cleaned = raw.replace(/[%$€£¥]/g, "");
  const suffix = cleaned.slice(-1);
  let multiplier = 1;
  let numericPart = cleaned;

  if (suffix === "K" || suffix === "M" || suffix === "B") {
    multiplier = suffix === "K" ? 1_000 : suffix === "M" ? 1_000_000 : 1_000_000_000;
    numericPart = cleaned.slice(0, -1);
  }

  const value = Number(numericPart);
  if (!Number.isFinite(value)) return null;
  const scaled = value * multiplier;
  return {
    raw: token,
    normalized: percent ? `${scaled}%` : String(scaled),
    value: scaled,
    isPercent: percent,
  };
}

function extractNumericTokens(text = "") {
  const matches =
    String(text || "").match(
      /(?:[$€£¥]\s*)?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:[%kmbKMB])?|-?\d+(?:\.\d+)?(?:[%kmbKMB])?/g
    ) || [];
  const seen = new Set();
  const out = [];
  for (const match of matches) {
    const parsed = normalizeNumericToken(match);
    if (!parsed || seen.has(parsed.normalized)) continue;
    seen.add(parsed.normalized);
    out.push(parsed);
  }
  return out;
}

function numericSetsEqual(sourceTokens = [], draftTokens = []) {
  const sourceSet = new Set(sourceTokens.map((t) => t.normalized));
  const draftSet = new Set(draftTokens.map((t) => t.normalized));
  if (sourceSet.size === 0) return { ok: true, missing: [], extra: [] };
  const missing = [...sourceSet].filter((token) => !draftSet.has(token));
  const extra = [...draftSet].filter((token) => !sourceSet.has(token));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

function findEquivalentSourceToken(outputToken, sourceTokens = []) {
  if (!outputToken) return null;
  const direct = sourceTokens.find((source) => source.normalized === outputToken.normalized);
  if (direct) return direct;

  for (const source of sourceTokens) {
    if (source.isPercent === outputToken.isPercent && source.value === outputToken.value) {
      return source;
    }
    if (
      !source.isPercent &&
      !outputToken.isPercent &&
      Number.isFinite(source.value) &&
      Number.isFinite(outputToken.value) &&
      Math.abs(source.value - outputToken.value) <= Math.max(1, Math.abs(source.value) * 0.0001)
    ) {
      return source;
    }
  }
  return null;
}

function validateOutputNumbersSubset(sourceTokens = [], outputTokens = []) {
  if (!outputTokens.length) {
    return { ok: true, extra: [], unsupported: [] };
  }

  const extra = [];
  for (const outputToken of outputTokens) {
    if (!findEquivalentSourceToken(outputToken, sourceTokens)) {
      extra.push(outputToken.normalized || outputToken.raw);
    }
  }

  return {
    ok: extra.length === 0,
    extra,
    unsupported: extra,
  };
}

module.exports = {
  normalizeNumericToken,
  extractNumericTokens,
  numericSetsEqual,
  findEquivalentSourceToken,
  validateOutputNumbersSubset,
};
