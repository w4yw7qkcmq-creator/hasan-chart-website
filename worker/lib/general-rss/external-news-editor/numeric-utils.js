const WORD_MULTIPLIERS = Object.freeze({
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  trillion: 1_000_000_000_000,
});

function parseWordMultiplier(text = "", index = 0) {
  const tail = String(text || "")
    .slice(index, index + 24)
    .toLowerCase();
  for (const [word, multiplier] of Object.entries(WORD_MULTIPLIERS)) {
    if (tail.startsWith(word)) return multiplier;
  }
  return null;
}

function normalizeNumericToken(token = "") {
  const original = String(token || "").trim();
  const raw = original
    .replace(/,/g, "")
    .replace(/\u066B/g, ".")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
  if (!raw) return null;

  const percent = /%/.test(raw);
  const basisPoints = /\bBPS\b/.test(raw) || /BPS$/i.test(original);
  const cleaned = raw.replace(/[%$€£¥]/g, "").replace(/\bBPS\b/g, "");
  const suffix = cleaned.slice(-1);
  let multiplier = 1;
  let numericPart = cleaned;

  if (suffix === "K" || suffix === "M" || suffix === "B" || suffix === "T") {
    multiplier =
      suffix === "K"
        ? 1_000
        : suffix === "M"
          ? 1_000_000
          : suffix === "B"
            ? 1_000_000_000
            : 1_000_000_000_000;
    numericPart = cleaned.slice(0, -1);
  }

  const value = Number(numericPart);
  if (!Number.isFinite(value)) return null;
  const scaled = basisPoints ? value : value * multiplier;
  return {
    raw: original,
    normalized: percent ? `${scaled}%` : basisPoints ? `${scaled}bps` : String(scaled),
    value: scaled,
    isPercent: percent,
    isBasisPoints: basisPoints,
    isDateLike: !percent && !basisPoints && !/[$€£¥KMBT]/i.test(raw) && /^(19|20)\d{2}$/.test(numericPart),
  };
}

function extractNumericTokens(text = "") {
  const source = String(text || "");
  const matches =
    source.match(
      /(?:[$€£¥]\s*)?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s?(?:%|bps|K|M|B|T|k|m|b|t|million|billion|trillion))?|-?\d+(?:\.\d+)?(?:\s?(?:%|bps|K|M|B|T|k|m|b|t|million|billion|trillion))?/gi
    ) || [];
  const seen = new Set();
  const out = [];

  for (const match of matches) {
    const parsed = normalizeNumericToken(match);
    if (!parsed || seen.has(parsed.normalized)) continue;

    const wordMatch = source.slice(source.indexOf(match) + match.length).match(/^\s*(million|billion|trillion|thousand)/i);
    if (wordMatch) {
      const wordMultiplier = WORD_MULTIPLIERS[wordMatch[1].toLowerCase()];
      if (wordMultiplier && Number.isFinite(parsed.value)) {
        parsed.value = parsed.value * wordMultiplier;
        parsed.normalized = parsed.isPercent ? `${parsed.value}%` : String(parsed.value);
      }
    }

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
    if (outputToken.isPercent === source.isPercent && outputToken.isBasisPoints === source.isBasisPoints) {
      if (outputToken.value === source.value) return source;
    }

    if (
      !outputToken.isPercent &&
      !source.isPercent &&
      !outputToken.isBasisPoints &&
      !source.isBasisPoints &&
      Number.isFinite(source.value) &&
      Number.isFinite(outputToken.value)
    ) {
      const tolerance = Math.max(1, Math.abs(source.value) * 0.0001);
      if (Math.abs(source.value - outputToken.value) <= tolerance) {
        return source;
      }
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
    if (outputToken.isDateLike) continue;
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

function classifyNumericMismatch(sourceTokens = [], outputToken = {}) {
  if (findEquivalentSourceToken(outputToken, sourceTokens)) {
    return outputToken.isDateLike ? "D_DATE_EQUIVALENT" : "C_FORMAT_EQUIVALENT";
  }
  if (outputToken.isDateLike) return "D_DATE_UNSUPPORTED";
  return "A_UNSUPPORTED_AI_NUMBER";
}

module.exports = {
  normalizeNumericToken,
  extractNumericTokens,
  numericSetsEqual,
  findEquivalentSourceToken,
  validateOutputNumbersSubset,
  classifyNumericMismatch,
  WORD_MULTIPLIERS,
};
