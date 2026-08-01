const { getMergeWindowMs } = require("./merge-window");
const { buildFingerprintBundle } = require("./fingerprint");
const { extractFactsFromTelegramPost } = require("./extractor");
const { dedupeGroupEntries } = require("./dedupe");
const { detectPostPublishAction, snapshotFacts } = require("./post-publish");
const { formatTelegramPost } = require("./format");
const { validateFinalMessageAgainstFacts } = require("./invariants");

const DEFAULT_MAX_PENDING = Number(process.env.TELEGRAM_MERGE_BUFFER_MAX || 100);

function createEmptyMetrics() {
  return {
    peakSize: 0,
    submitted: 0,
    flushed: 0,
    duplicateExact: 0,
    duplicateSkip: 0,
    updatePending: 0,
    aiAccepted: 0,
    aiFallback: 0,
    aiRejectedFactMismatch: 0,
    promoOnlySkipped: 0,
    promoFootersRemoved: 0,
  };
}

function createTelegramMergeBuffer(options = {}) {
  const pending = new Map();
  const published = new Map();
  const seenExact = new Set();
  const activeTimers = new Map();
  const metrics = createEmptyMetrics();

  const maxPendingItems = options.maxPendingItems || DEFAULT_MAX_PENDING;
  const dryRun = options.dryRun === true;
  const setTimerFn = options.setTimerFn || setTimeout;
  const clearTimerFn = options.clearTimerFn || clearTimeout;
  const nowFn = options.nowFn || Date.now;
  const onReady = options.onReady || null;
  const onUpdatePending = options.onUpdatePending || null;

  function clearTimerFor(mergeKey) {
    const timer = activeTimers.get(mergeKey);
    if (timer) {
      clearTimerFn(timer);
      activeTimers.delete(mergeKey);
    }
  }

  function scheduleFlush(mergeKey, delayMs) {
    if (dryRun || activeTimers.has(mergeKey)) {
      return;
    }

    const timer = setTimerFn(() => {
      flush(mergeKey).catch((error) => {
        console.error("TELEGRAM_MERGE_BUFFER_FLUSH_ERROR", mergeKey, error.message);
      });
    }, delayMs);

    activeTimers.set(mergeKey, timer);
  }

  function buildCandidate(post, facts) {
    const fingerprints = buildFingerprintBundle(post, facts);
    return { post, facts, fingerprints };
  }

  function mergeCandidates(candidates) {
    return dedupeGroupEntries(candidates);
  }

  async function finalizeMergedItem(merged, formatOptions = {}) {
    if (!merged || merged.conflict?.hasConflict) {
      return {
        ...merged,
        skipPublish: true,
        reason: "source_conflict",
        aiResult: "none",
      };
    }

    const formatted = await formatTelegramPost(merged.post, merged.facts, formatOptions);
    const finalFactCheck =
      formatted.formatted && !formatted.skipPublish
        ? validateFinalMessageAgainstFacts(formatted.formatted, merged.facts)
        : { ok: true };

    if (formatted.aiResult === "accepted") {
      metrics.aiAccepted += 1;
    } else if (formatted.aiResult === "rejected_fact_mismatch") {
      metrics.aiRejectedFactMismatch += 1;
    } else if (formatted.aiResult) {
      metrics.aiFallback += 1;
    }

    return {
      ...merged,
      formattedMessage: formatted.formatted,
      skipPublish: formatted.skipPublish,
      validation: formatted.validation,
      reason: formatted.reason,
      newsType: merged.facts.isStructuredTriple ? "economic" : "general",
      finalFactCheck,
      aiImpactUsed: formatted.aiImpactUsed === true,
      aiResult: formatted.aiResult || "fallback",
      fingerprint: merged.fingerprints?.mergeKey || merged.mergeKey,
    };
  }

  async function flush(mergeKey, formatOptions = {}) {
    const entry = pending.get(mergeKey);
    if (!entry) {
      return null;
    }

    clearTimerFor(mergeKey);
    pending.delete(mergeKey);

    const merged = mergeCandidates(entry.candidates);
    if (!merged || merged.conflict?.hasConflict) {
      metrics.flushed += 1;
      if (onReady) {
        await onReady(
          {
            ...merged,
            skipPublish: true,
            reason: "source_conflict",
          },
          { mergeKey, metrics }
        );
      }
      return merged;
    }

    const payload = await finalizeMergedItem(merged, formatOptions);

    published.set(mergeKey, {
      ...snapshotFacts(payload.facts, mergeKey),
      publishedAt: nowFn(),
      sourceMessageIds: payload.metadata?.sourceMessageIds || [],
    });

    metrics.flushed += 1;

    if (onReady) {
      await onReady(payload, { mergeKey, metrics });
    }

    return payload;
  }

  function submit(post, factsInput = null, meta = {}) {
    metrics.submitted += 1;

    const exactKey = `${post.sourceChannel}:${post.sourceMessageId}`;
    if (seenExact.has(exactKey)) {
      metrics.duplicateExact += 1;
      return { action: "duplicate_exact", exactKey };
    }
    seenExact.add(exactKey);

    const facts = factsInput || extractFactsFromTelegramPost(post);
    const candidate = buildCandidate(post, facts);
    const mergeKey = candidate.fingerprints.mergeKey;

    const publishedSnapshot = published.get(mergeKey);
    if (publishedSnapshot) {
      const postPublish = detectPostPublishAction(publishedSnapshot, facts, {
        mergeKey,
        sourceMessageId: post.sourceMessageId,
      });

      if (postPublish.isUpdate) {
        metrics.updatePending += 1;
        if (onUpdatePending) {
          onUpdatePending(postPublish, { post, facts, mergeKey });
        }
        console.log("TELEGRAM_NEWS_UPDATE_PENDING", JSON.stringify(postPublish));
        return { action: "TELEGRAM_NEWS_UPDATE_PENDING", mergeKey, update: postPublish };
      }

      metrics.duplicateSkip += 1;
      return { action: "duplicate_skip", mergeKey };
    }

    let entry = pending.get(mergeKey);
    if (!entry) {
      if (pending.size >= maxPendingItems) {
        const oldestKey = pending.keys().next().value;
        if (oldestKey) {
          flush(oldestKey);
        }
      }

      const windowMs = getMergeWindowMs(facts);
      const now = nowFn();
      entry = {
        mergeKey,
        firstSeenAt: now,
        deadline: now + windowMs,
        candidates: [],
      };
      pending.set(mergeKey, entry);
      scheduleFlush(mergeKey, windowMs);
    }

    entry.candidates.push(candidate);
    metrics.peakSize = Math.max(metrics.peakSize, pending.size);

    if (dryRun) {
      return { action: "pending_dry_run", mergeKey, candidateCount: entry.candidates.length };
    }

    return { action: "pending", mergeKey, candidateCount: entry.candidates.length };
  }

  async function flushAllSync(formatOptions = {}) {
    const keys = [...pending.keys()];
    const results = [];
    for (const mergeKey of keys) {
      results.push(await flush(mergeKey, formatOptions));
    }
    return results.filter(Boolean);
  }

  function getActiveTimerCount() {
    return activeTimers.size;
  }

  function destroy() {
    for (const mergeKey of [...activeTimers.keys()]) {
      clearTimerFor(mergeKey);
    }
    pending.clear();
  }

  function resetForTests() {
    destroy();
    published.clear();
    seenExact.clear();
    Object.assign(metrics, createEmptyMetrics());
  }

  return {
    submit,
    flush,
    flushAllSync,
    getActiveTimerCount,
    destroy,
    resetForTests,
    metrics,
    pending,
    published,
    seenExact,
  };
}

let singletonBuffer = null;

function getTelegramMergeBuffer(options = {}) {
  if (!singletonBuffer) {
    singletonBuffer = createTelegramMergeBuffer(options);
  }
  return singletonBuffer;
}

function resetTelegramMergeBufferForTests() {
  if (singletonBuffer) {
    singletonBuffer.resetForTests();
  }
  singletonBuffer = null;
}

module.exports = {
  createTelegramMergeBuffer,
  getTelegramMergeBuffer,
  resetTelegramMergeBufferForTests,
  createEmptyMetrics,
};
