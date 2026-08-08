function stripEmoji(value) {
  return String(value || "").replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, " ");
}

function normalizeForCopyComparison(value) {
  return stripEmoji(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/t\.me\/\S+/gi, " ")
    .replace(/[\d.,]+(?:k|m|b|%)?/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBigrams(value) {
  const tokens = value.split(" ").filter(Boolean);
  const bigrams = new Set();
  if (tokens.length === 1) {
    bigrams.add(tokens[0]);
    return bigrams;
  }
  for (let i = 0; i < tokens.length - 1; i += 1) {
    bigrams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return bigrams;
}

function jaccardSimilarity(a, b) {
  if (!a || !b) {
    return 0;
  }
  const left = buildBigrams(a);
  const right = buildBigrams(b);
  if (!left.size || !right.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const DEFAULT_COPY_SIMILARITY_THRESHOLD = 0.72;

function tokenCoverageRatio(finalNormalized, rawNormalized) {
  const rawTokens = rawNormalized.split(" ").filter(Boolean);
  const finalTokens = new Set(finalNormalized.split(" ").filter(Boolean));
  if (!rawTokens.length) {
    return 0;
  }
  let covered = 0;
  for (const token of rawTokens) {
    if (finalTokens.has(token)) {
      covered += 1;
    }
  }
  return covered / rawTokens.length;
}

function evaluateCopySimilarity(finalText, rawSourceText, options = {}) {
  const threshold = options.threshold ?? DEFAULT_COPY_SIMILARITY_THRESHOLD;
  const normalizedFinal = normalizeForCopyComparison(finalText);
  const normalizedRaw = normalizeForCopyComparison(rawSourceText);

  if (!normalizedFinal || !normalizedRaw) {
    return { ok: true, similarity: 0, threshold };
  }

  const similarity = jaccardSimilarity(normalizedFinal, normalizedRaw);
  const coverage = tokenCoverageRatio(normalizedFinal, normalizedRaw);
  const nearCopy =
    similarity >= threshold ||
    (similarity >= 0.55 && coverage >= 0.78) ||
    (similarity >= 0.68 && coverage >= 0.65);

  if (nearCopy) {
    return {
      ok: false,
      reason: "SOURCE_COPY_SIMILARITY_TOO_HIGH",
      similarity,
      coverage,
      threshold,
    };
  }

  return { ok: true, similarity, coverage, threshold };
}

module.exports = {
  normalizeForCopyComparison,
  evaluateCopySimilarity,
  DEFAULT_COPY_SIMILARITY_THRESHOLD,
};
