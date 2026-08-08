const { evaluateCopySimilarity } = require("../news-intelligence/copy-similarity-guard");

const BLOCK_REASONS = {
  RSS_EDITORIAL_BLOCKED: "RSS_EDITORIAL_BLOCKED",
  RSS_BODY_TOO_SHORT: "RSS_BODY_TOO_SHORT",
  RSS_SOURCE_URL_PRESENT: "RSS_SOURCE_URL_PRESENT",
  RSS_COMPETITOR_CHANNEL_PRESENT: "RSS_COMPETITOR_CHANNEL_PRESENT",
  RSS_EXTERNAL_MENTION_PRESENT: "RSS_EXTERNAL_MENTION_PRESENT",
  RSS_RAW_SOURCE_FALLBACK: "RSS_RAW_SOURCE_FALLBACK",
  RSS_PLACEHOLDER_PRESENT: "RSS_PLACEHOLDER_PRESENT",
  RSS_COPY_SIMILARITY_TOO_HIGH: "RSS_COPY_SIMILARITY_TOO_HIGH",
};

const COMPETITOR_PATTERNS = [
  /forexbreakingnews/i,
  /forexnewspaper/i,
  /forexlive/i,
  /t\.me\//i,
  /telegram/i,
];

const PLACEHOLDER_PATTERNS = [/\bundefined\b/i, /\bnull\b/i, /\[object Object\]/i];

function fail(reason, detail = {}) {
  return { ok: false, reason, ...detail };
}

function buildRawSourceText(item = {}) {
  return [item.title, item.contentSnippet, item.content, item.summary]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n")
    .trim();
}

function validateGeneralRssEditorialOutput(input = {}) {
  const body = String(input.body || "").trim();
  const title = String(input.title || "").trim();
  const rawSourceText = String(input.rawSourceText || buildRawSourceText(input)).trim();

  if (!body || body.length < 40) {
    return fail(BLOCK_REASONS.RSS_BODY_TOO_SHORT);
  }

  if (!title) {
    return fail(BLOCK_REASONS.RSS_EDITORIAL_BLOCKED, { issue: "missing_title" });
  }

  if (/https?:\/\//i.test(body)) {
    return fail(BLOCK_REASONS.RSS_SOURCE_URL_PRESENT);
  }

  for (const pattern of COMPETITOR_PATTERNS) {
    if (pattern.test(body)) {
      return fail(BLOCK_REASONS.RSS_COMPETITOR_CHANNEL_PRESENT, { pattern: pattern.source });
    }
  }

  if (/@\w+/.test(body)) {
    return fail(BLOCK_REASONS.RSS_EXTERNAL_MENTION_PRESENT);
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(body)) {
      return fail(BLOCK_REASONS.RSS_PLACEHOLDER_PRESENT);
    }
  }

  if (rawSourceText) {
    const normalizedBody = body.replace(/\s+/g, " ").trim();
    const normalizedRaw = rawSourceText.replace(/\s+/g, " ").trim();
    if (normalizedBody === normalizedRaw || normalizedBody === normalizedRaw.slice(0, normalizedBody.length)) {
      return fail(BLOCK_REASONS.RSS_RAW_SOURCE_FALLBACK);
    }

    const copyCheck = evaluateCopySimilarity(body, rawSourceText, input.copyGuard);
    if (!copyCheck.ok) {
      return fail(BLOCK_REASONS.RSS_COPY_SIMILARITY_TOO_HIGH, {
        similarity: copyCheck.similarity,
        coverage: copyCheck.coverage,
      });
    }
  }

  return { ok: true, reason: null };
}

module.exports = {
  BLOCK_REASONS,
  buildRawSourceText,
  validateGeneralRssEditorialOutput,
};
