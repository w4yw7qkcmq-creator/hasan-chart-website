const { buildIdempotencyKey } = require("./canonical-events");
const { validateEconomicReleaseCompleteness } = require("./completeness");
const { formatEconomicReleaseMessage } = require("./format");
const { canPublishStructuredRelease } = require("./publish-guard");

const RETRY_DELAYS_MS = [0, 10_000, 30_000, 60_000, 120_000, 300_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

function createEconomicReleasePendingQueue() {
  const pending = new Map();
  const publishedKeys = new Set();
  const locks = new Set();

  function enqueue(entry) {
    const idempotencyKey =
      entry.idempotencyKey ||
      buildIdempotencyKey({
        country: entry.country || "US",
        eventKey: entry.canonical?.eventKey,
        scheduledAt: entry.scheduledAt,
      });

    if (publishedKeys.has(idempotencyKey)) {
      return { queued: false, reason: "already_published", idempotencyKey };
    }

    const existing = pending.get(idempotencyKey);
    const attempt =
      typeof entry.attempt === "number"
        ? entry.attempt
        : existing
          ? existing.attempt + 1
          : 0;
    const nextRetryAt = Date.now() + (RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] || 0);

    pending.set(idempotencyKey, {
      ...entry,
      idempotencyKey,
      attempt,
      nextRetryAt,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return { queued: true, idempotencyKey, attempt, nextRetryAt };
  }

  function getDueEntries(now = Date.now()) {
    return [...pending.values()].filter((entry) => entry.nextRetryAt <= now && !locks.has(entry.idempotencyKey));
  }

  function markPublished(idempotencyKey) {
    publishedKeys.add(idempotencyKey);
    pending.delete(idempotencyKey);
    locks.delete(idempotencyKey);
  }

  function lock(idempotencyKey) {
    locks.add(idempotencyKey);
  }

  function unlock(idempotencyKey) {
    locks.delete(idempotencyKey);
  }

  function drop(idempotencyKey, reason = "dropped") {
    pending.delete(idempotencyKey);
    locks.delete(idempotencyKey);
    return { dropped: true, idempotencyKey, reason };
  }

  function getSnapshot() {
    return {
      pendingCount: pending.size,
      publishedCount: publishedKeys.size,
      items: [...pending.values()].map((entry) => ({
        idempotencyKey: entry.idempotencyKey,
        eventKey: entry.canonical?.eventKey,
        title: entry.title,
        attempt: entry.attempt,
        nextRetryAt: new Date(entry.nextRetryAt).toISOString(),
        missingFields: entry.validation?.missingFields || [],
        reason: entry.validation?.reason || null,
      })),
    };
  }

  return {
    enqueue,
    getDueEntries,
    markPublished,
    lock,
    unlock,
    drop,
    getSnapshot,
    RETRY_DELAYS_MS,
    MAX_ATTEMPTS,
  };
}

async function processPendingEntry(entry, { registry, resolveRelease }) {
  const result = await resolveRelease({
    title: entry.title,
    link: entry.link,
    canonical: entry.canonical,
    registry,
    forceRefresh: true,
  });

  const validation = validateEconomicReleaseCompleteness(result.merged, entry.canonical);

  if (!validation.complete) {
    const nextAttempt = entry.attempt + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      return {
        action: "drop",
        reason: validation.reason,
        validation,
        merged: result.merged,
      };
    }

    return {
      action: "retry",
      validation,
      merged: result.merged,
      nextAttempt,
    };
  }

  const message = formatEconomicReleaseMessage(result.merged, entry.canonical);
  const publishCheck = canPublishStructuredRelease(validation, message);
  if (!publishCheck.allowed) {
    const nextAttempt = entry.attempt + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      return {
        action: "drop",
        reason: publishCheck.reason,
        validation,
        merged: result.merged,
      };
    }

    return {
      action: "retry",
      validation,
      merged: result.merged,
      nextAttempt,
    };
  }

  return {
    action: "publish",
    message,
    imageTitle: entry.canonical.arabicName,
    merged: result.merged,
    validation,
  };
}

module.exports = {
  createEconomicReleasePendingQueue,
  processPendingEntry,
  RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
};
