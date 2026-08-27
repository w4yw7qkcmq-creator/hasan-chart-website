const { buildScheduledBucket } = require("../telegram-news/fingerprint");

function normalizePeriod(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  return normalized || null;
}

function parseEconomicReleaseEventKey(eventKey) {
  if (!eventKey || typeof eventKey !== "string") {
    return null;
  }

  const parts = eventKey.split(":");
  if (parts.length < 3) {
    return null;
  }

  const country = parts[0];
  const eventType = parts[1];
  const remainder = parts.slice(2).join(":");

  const bucketPeriodMatch = remainder.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::([A-Z0-9]+))?$/);
  if (bucketPeriodMatch) {
    const periodToken = bucketPeriodMatch[2];
    const period =
      periodToken && !/^\d/.test(periodToken) ? normalizePeriod(periodToken) : null;
    if (periodToken && !period) {
      return null;
    }
    return {
      country,
      eventType,
      bucket: bucketPeriodMatch[1],
      period,
    };
  }

  const releaseInstant = new Date(remainder);
  if (!Number.isNaN(releaseInstant.getTime())) {
    const bucket = buildScheduledBucket(releaseInstant.toISOString());
    if (!bucket || bucket === "unknown") {
      return null;
    }
    return { country, eventType, bucket, period: null };
  }

  return null;
}

function buildReleaseBucketIdentity(input = {}) {
  if (input.eventKey) {
    const parsed = parseEconomicReleaseEventKey(input.eventKey);
    if (parsed) {
      return parsed;
    }
  }

  const bucket = buildScheduledBucket(input.releaseDate);
  if (!input.country || !input.eventType || !bucket || bucket === "unknown") {
    return null;
  }

  return {
    country: input.country,
    eventType: input.eventType,
    bucket,
    period: input.period ? normalizePeriod(input.period) : null,
  };
}

function releaseBucketIdentitiesMatch(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.country === right.country &&
    left.eventType === right.eventType &&
    left.bucket === right.bucket &&
    (left.period || null) === (right.period || null)
  );
}

function legacyEventKeyMatchesReleaseBucket(legacyEventKey, targetIdentity) {
  const parsedLegacy = parseEconomicReleaseEventKey(legacyEventKey);
  return releaseBucketIdentitiesMatch(parsedLegacy, targetIdentity);
}

module.exports = {
  normalizePeriod,
  parseEconomicReleaseEventKey,
  buildReleaseBucketIdentity,
  releaseBucketIdentitiesMatch,
  legacyEventKeyMatchesReleaseBucket,
};
