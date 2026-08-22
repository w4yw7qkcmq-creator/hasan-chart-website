const crypto = require("crypto");

const { normalizeFingerprintText, normalizeEconomicFieldValue } = require("../economic-releases/text-normalization");

function extractNumbers(text) {
  return [...String(text || "").matchAll(/-?\d+(?:[.,]\d+)?%?|\d+(?:\.\d+)?[KMB]/gi)].map((m) => m[0]);
}

function buildScheduledBucket(scheduledAt) {
  if (!scheduledAt) {
    return "unknown";
  }

  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const bucketMs = 30 * 60 * 1000;
  const bucketTime = Math.floor(date.getTime() / bucketMs) * bucketMs;
  return new Date(bucketTime).toISOString().slice(0, 16);
}

function buildEconomicMergeKey(facts = {}) {
  const previous = normalizeEconomicFieldValue(facts.previous || facts.revisedPrevious);
  const forecast = normalizeEconomicFieldValue(facts.forecast);
  const actual = normalizeEconomicFieldValue(facts.actual);

  if (!previous || !forecast || !actual) {
    return null;
  }

  const payload = [
    normalizeFingerprintText(facts.country || "unknown"),
    facts.canonicalEventKey || "ECONOMIC_RELEASE",
    normalizeFingerprintText(facts.period || ""),
    buildScheduledBucket(facts.scheduledAt || facts.sourcePublishedAt),
    previous,
    forecast,
    actual,
    normalizeEconomicFieldValue(facts.unit || ""),
  ].join("|");

  return payload;
}

function normalizeEconomicField(value) {
  return normalizeEconomicFieldValue(value);
}

function buildEconomicTripleKey(facts = {}) {
  const previous = normalizeEconomicFieldValue(facts.previous || facts.revisedPrevious);
  const forecast = normalizeEconomicFieldValue(facts.forecast);
  const actual = normalizeEconomicFieldValue(facts.actual);

  if (!previous || !forecast || !actual) {
    return null;
  }

  const payload = [
    normalizeFingerprintText(facts.country || "unknown"),
    facts.canonicalEventKey || facts.eventType || "ECONOMIC_RELEASE",
    normalizeFingerprintText(facts.period || ""),
    buildScheduledBucket(facts.scheduledAt || facts.sourcePublishedAt),
    previous,
    forecast,
    actual,
    normalizeEconomicFieldValue(facts.unit || ""),
  ].join("|");

  return payload;
}

function buildExactFingerprint(post = {}) {
  const payload = [
    post.sourceChannel || "",
    post.sourceMessageId || "",
    post.sourceUrl || "",
    normalizeFingerprintText(post.rawText),
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function buildEventFingerprint(facts = {}) {
  const scheduled = facts.scheduledAt || facts.sourcePublishedAt || "unknown";
  const scheduledBucket =
    typeof scheduled === "string" && scheduled.length >= 10 ? scheduled.slice(0, 10) : scheduled;
  const payload = [
    facts.country || "unknown",
    facts.canonicalEventKey || "general",
    scheduledBucket,
    facts.period || "",
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function buildSemanticFingerprint(facts = {}) {
  const genericTitle = /^(?:صدر الآن|صدر الان|:+|\.+|🚨)$/i.test(String(facts.title || "").trim());
  const payload = [
    facts.canonicalEventKey || facts.eventType || "general",
    facts.country || "unknown",
    genericTitle ? "generic-title" : normalizeFingerprintText(facts.title),
    ...(facts.numbers || facts.rawNumbers || []).map((n) => String(n).trim()),
    ...(facts.entities || []).map((e) => normalizeFingerprintText(e)),
  ].join("|");

  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function buildTelegramNewsFingerprint(facts = {}) {
  return buildEconomicTripleKey(facts) || buildSemanticFingerprint(facts);
}

function buildFingerprintBundle(post, facts = {}) {
  const economicMerge = buildEconomicMergeKey(facts);
  const economicTriple = buildEconomicTripleKey(facts);

  return {
    exact: buildExactFingerprint(post),
    event: buildEventFingerprint({ ...facts, sourcePublishedAt: post.sourcePublishedAt }),
    semantic: buildSemanticFingerprint(facts),
    economicMerge,
    economicTriple,
    mergeKey: economicTriple || economicMerge || buildSemanticFingerprint(facts),
  };
}

function isSameNewsFingerprint(a, b) {
  if (!a || !b) {
    return false;
  }
  return a === b;
}

module.exports = {
  buildExactFingerprint,
  buildEventFingerprint,
  buildSemanticFingerprint,
  buildEconomicMergeKey,
  buildEconomicTripleKey,
  buildScheduledBucket,
  buildTelegramNewsFingerprint,
  buildFingerprintBundle,
  isSameNewsFingerprint,
  normalizeFingerprintText,
  normalizeEconomicField,
  extractNumbers,
};
