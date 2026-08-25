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

const ALLOWED_CHANNEL_URL_PATTERNS = [/^https?:\/\/t\.me\/EconomicNewsi\/?$/i];
const OFFICIAL_CHANNEL_FOOTER_PATTERN =
  /\n\n📢 قناة الأخبار الرسمية:\nhttps?:\/\/t\.me\/EconomicNewsi\/?\s*$/i;

function stripOfficialChannelFooter(body) {
  return String(body || "").replace(OFFICIAL_CHANNEL_FOOTER_PATTERN, "").trim();
}

function extractUrls(value) {
  return String(value || "").match(/https?:\/\/\S+/gi) || [];
}

function normalizeExtractedUrl(url) {
  return String(url || "")
    .replace(/[)\]},.!?]+$/g, "")
    .trim();
}

function isAllowedChannelUrl(url) {
  const normalized = normalizeExtractedUrl(url);
  return ALLOWED_CHANNEL_URL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findDisallowedUrls(body) {
  return extractUrls(body).filter((url) => !isAllowedChannelUrl(url));
}

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

  if (!title) {
    return fail(BLOCK_REASONS.RSS_EDITORIAL_BLOCKED, { issue: "missing_title" });
  }

  const editorialBody = stripOfficialChannelFooter(body);
  if (!editorialBody || editorialBody.length < 40) {
    return fail(BLOCK_REASONS.RSS_BODY_TOO_SHORT);
  }

  const disallowedUrls = findDisallowedUrls(body);
  if (disallowedUrls.length) {
    return fail(BLOCK_REASONS.RSS_SOURCE_URL_PRESENT, { url: disallowedUrls[0] });
  }

  for (const pattern of COMPETITOR_PATTERNS) {
    if (pattern.test(editorialBody)) {
      return fail(BLOCK_REASONS.RSS_COMPETITOR_CHANNEL_PRESENT, { pattern: pattern.source });
    }
  }

  if (/@\w+/.test(editorialBody)) {
    return fail(BLOCK_REASONS.RSS_EXTERNAL_MENTION_PRESENT);
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(editorialBody)) {
      return fail(BLOCK_REASONS.RSS_PLACEHOLDER_PRESENT);
    }
  }

  if (rawSourceText) {
    const normalizedBody = editorialBody.replace(/\s+/g, " ").trim();
    const normalizedRaw = rawSourceText.replace(/\s+/g, " ").trim();
    if (normalizedBody === normalizedRaw || normalizedBody === normalizedRaw.slice(0, normalizedBody.length)) {
      return fail(BLOCK_REASONS.RSS_RAW_SOURCE_FALLBACK);
    }

    const copyCheck = evaluateCopySimilarity(editorialBody, rawSourceText, input.copyGuard);
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
  ALLOWED_CHANNEL_URL_PATTERNS,
  buildRawSourceText,
  findDisallowedUrls,
  stripOfficialChannelFooter,
  validateGeneralRssEditorialOutput,
};
