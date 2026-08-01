const { resolveCanonicalEventKey, buildIdempotencyKey, isPlainNewsEventType, isStructuredTripleReleaseTitle } = require("./canonical-events");
const { mergeProviderEvents } = require("./normalize");
const { validateEconomicReleaseCompleteness } = require("./completeness");
const { formatEconomicReleaseMessage, formatPlainEconomicNewsMessage } = require("./format");
const { createEconomicReleaseProviderRegistry } = require("./providers");
const { createEconomicReleasePendingQueue, processPendingEntry } = require("./pending-queue");
const { createEconomicReleaseCycleMetrics, mergeProviderMetricsIntoCycle, recordEconomicCycleDetection } = require("./metrics");
const { canPublishStructuredRelease, logEconomicReleaseDroppedIncomplete } = require("./publish-guard");

let providerRegistry = null;
let pendingQueue = null;

function getProviderRegistry(options = {}) {
  if (!providerRegistry) {
    providerRegistry = createEconomicReleaseProviderRegistry(options);
  }
  return providerRegistry;
}

function getPendingQueue() {
  if (!pendingQueue) {
    pendingQueue = createEconomicReleasePendingQueue();
  }
  return pendingQueue;
}

function resetEconomicReleaseRuntimeForTests() {
  providerRegistry = null;
  pendingQueue = null;
}

async function resolveStructuredEconomicRelease({ title, link, canonical, registry, forceRefresh = false }) {
  const resolvedCanonical = canonical || resolveCanonicalEventKey(title);
  const activeRegistry = registry || getProviderRegistry();

  if (!resolvedCanonical.eventKey || isPlainNewsEventType(resolvedCanonical.eventType)) {
    return {
      canonical: resolvedCanonical,
      merged: null,
      providerEvents: [],
      validation: validateEconomicReleaseCompleteness(null, resolvedCanonical),
      idempotencyKey: null,
    };
  }

  const providerEvents = await activeRegistry.collectMatchingReleases(resolvedCanonical, {
    forceRefresh,
    windowHours: 8,
  });

  const merged = mergeProviderEvents(
    providerEvents.map((event) => ({
      ...event,
      eventKey: resolvedCanonical.eventKey,
      title: event.title || title,
    }))
  );

  if (merged) {
    merged.title = merged.title || title;
    merged.sourceLink = link || null;
  }

  const validation = validateEconomicReleaseCompleteness(merged, resolvedCanonical);
  const idempotencyKey = buildIdempotencyKey({
    country: merged?.country || "US",
    eventKey: resolvedCanonical.eventKey,
    scheduledAt: merged?.scheduledAt,
  });

  return {
    canonical: resolvedCanonical,
    merged,
    providerEvents,
    validation,
    idempotencyKey,
  };
}

async function buildEconomicNewsAnalysis({ title, link, registry, queue, dryRun = false }) {
  const resolved = await resolveStructuredEconomicRelease({ title, link, registry });
  const activeQueue = queue || getPendingQueue();

  if (!resolved.canonical.eventKey) {
    return {
      handled: false,
      reason: "not_economic_event",
    };
  }

  if (isPlainNewsEventType(resolved.canonical.eventType)) {
    return {
      handled: true,
      skipPublish: false,
      usePlainTemplate: true,
      message: formatPlainEconomicNewsMessage(title, resolved.canonical.arabicName),
      imageTitle: resolved.canonical.arabicName,
      canonical: resolved.canonical,
      validation: resolved.validation,
      structuredRelease: null,
    };
  }

  if (!resolved.validation.complete) {
    if (!dryRun) {
      activeQueue.enqueue({
        title,
        link,
        canonical: resolved.canonical,
        scheduledAt: resolved.merged?.scheduledAt,
        validation: resolved.validation,
        idempotencyKey: resolved.idempotencyKey,
      });
    }

    return {
      handled: true,
      skipPublish: true,
      reason: resolved.validation.reason,
      missingFields: resolved.validation.missingFields,
      message: null,
      imageTitle: resolved.canonical.arabicName,
      canonical: resolved.canonical,
      validation: resolved.validation,
      structuredRelease: resolved.merged,
      idempotencyKey: resolved.idempotencyKey,
    };
  }

  const message = formatEconomicReleaseMessage(resolved.merged, resolved.canonical);
  const publishCheck = canPublishStructuredRelease(resolved.validation, message);
  if (!publishCheck.allowed) {
    if (!dryRun) {
      activeQueue.enqueue({
        title,
        link,
        canonical: resolved.canonical,
        scheduledAt: resolved.merged?.scheduledAt,
        validation: resolved.validation,
        idempotencyKey: resolved.idempotencyKey,
      });
    }

    return {
      handled: true,
      skipPublish: true,
      reason: publishCheck.reason,
      missingFields: publishCheck.missingFields,
      message: null,
      imageTitle: resolved.canonical.arabicName,
      canonical: resolved.canonical,
      validation: resolved.validation,
      structuredRelease: resolved.merged,
      idempotencyKey: resolved.idempotencyKey,
    };
  }

  return {
    handled: true,
    skipPublish: false,
    message,
    imageTitle: resolved.canonical.arabicName,
    canonical: resolved.canonical,
    validation: resolved.validation,
    structuredRelease: resolved.merged,
    idempotencyKey: resolved.idempotencyKey,
  };
}

async function processDuePendingReleases({ registry, queue, dryRun = false } = {}) {
  const activeRegistry = registry || getProviderRegistry();
  const activeQueue = queue || getPendingQueue();
  const dueEntries = activeQueue.getDueEntries();
  const results = [];

  for (const entry of dueEntries) {
    activeQueue.lock(entry.idempotencyKey);

    try {
      const outcome = await processPendingEntry(entry, {
        registry: activeRegistry,
        resolveRelease: resolveStructuredEconomicRelease,
      });

      if (outcome.action === "publish") {
        const publishCheck = canPublishStructuredRelease(outcome.validation, outcome.message);
        if (!publishCheck.allowed) {
          if (!dryRun) {
            activeQueue.enqueue({
              ...entry,
              validation: outcome.validation,
              attempt: entry.attempt + 1,
            });
          }
          results.push({
            action: "retry",
            idempotencyKey: entry.idempotencyKey,
            nextAttempt: entry.attempt + 1,
            validation: outcome.validation,
            reason: publishCheck.reason,
          });
          continue;
        }

        if (!dryRun) {
          activeQueue.markPublished(entry.idempotencyKey);
        }
        results.push({
          action: "publish",
          idempotencyKey: entry.idempotencyKey,
          message: outcome.message,
          imageTitle: outcome.imageTitle,
          validation: outcome.validation,
          sourceLink: entry.link,
        });
        continue;
      }

      if (outcome.action === "drop") {
        logEconomicReleaseDroppedIncomplete(entry, outcome.validation);
        if (!dryRun) {
          activeQueue.drop(entry.idempotencyKey, outcome.reason);
        }
        results.push({
          action: "drop",
          idempotencyKey: entry.idempotencyKey,
          reason: outcome.reason,
          validation: outcome.validation,
          title: entry.title,
          canonical: entry.canonical,
          attempt: entry.attempt,
        });
        continue;
      }

      if (!dryRun) {
        activeQueue.enqueue({
          ...entry,
          attempt: outcome.nextAttempt,
          validation: outcome.validation,
        });
      }

      results.push({
        action: "retry",
        idempotencyKey: entry.idempotencyKey,
        nextAttempt: outcome.nextAttempt,
        validation: outcome.validation,
      });
    } finally {
      activeQueue.unlock(entry.idempotencyKey);
    }
  }

  return results;
}

async function runEconomicReleaseDryRun({ limit = 50, registry } = {}) {
  const activeRegistry = registry || getProviderRegistry();
  const calendarProvider =
    activeRegistry.getPrimaryCalendarProvider?.() ||
    activeRegistry.providers.find((provider) => provider.name === "trading_economics_public") ||
    activeRegistry.providers.find((provider) => provider.name === "public_pages_calendar") ||
    activeRegistry.providers.find((provider) => typeof provider.fetchEvents === "function");

  const events = calendarProvider ? await calendarProvider.fetchEvents({ forceRefresh: true }) : [];

  const rows = [];

  for (const event of events.slice(0, limit)) {
    const canonical = resolveCanonicalEventKey(event.title);
    if (!canonical.eventKey || isPlainNewsEventType(canonical.eventType)) {
      continue;
    }

    const providerEvents = await activeRegistry.collectMatchingReleases(canonical, {
      forceRefresh: false,
      windowHours: 8,
    });

    const merged = mergeProviderEvents(
      (providerEvents.length ? providerEvents : [{ ...event, eventKey: canonical.eventKey }]).map((item) => ({
        ...item,
        eventKey: canonical.eventKey,
      }))
    );
    const validation = validateEconomicReleaseCompleteness(merged, canonical);

    let officialVerification = "not_applicable";
    if (merged?.actualSource === "official") {
      officialVerification = "verified";
    } else if (merged?.sourceAgreement === false) {
      officialVerification = "source_conflict";
    } else if (activeRegistry.getVerificationProviders?.().length) {
      officialVerification = "pending";
    }

    rows.push({
      Event: event.title,
      Country: merged?.country || event.country || null,
      ScheduledAt: merged?.scheduledAt || event.scheduledAt || null,
      Previous: merged?.previous?.display || merged?.revisedPrevious?.display || null,
      Forecast: merged?.forecast?.display || null,
      Actual: merged?.actual?.display || null,
      Unit: merged?.unit || event.unit || null,
      Importance: merged?.importance || event.importance || null,
      "Canonical Key": canonical.eventKey,
      Complete: validation.complete,
      Provider: merged?.providers?.join(", ") || event.sourceName || calendarProvider?.name,
      Action: validation.complete ? "publish-ready" : validation.reason,
      "Retry Count": 0,
      Missing: validation.missingFields,
    });
  }

  const providerMetrics = activeRegistry.getAllMetrics();
  const blocked = providerMetrics.some(
    (metric) => metric.providerStatus === "provider_blocked" || Boolean(metric.blockedUntil)
  );

  return {
    totalCalendarEvents: events.length,
    evaluated: rows.length,
    complete: rows.filter((row) => row.Complete).length,
    incomplete: rows.filter((row) => !row.Complete).length,
    economicProviderBlocked: blocked,
    rows,
    providerMetrics,
  };
}

module.exports = {
  resolveCanonicalEventKey,
  isStructuredTripleReleaseTitle,
  validateEconomicReleaseCompleteness,
  formatEconomicReleaseMessage,
  formatPlainEconomicNewsMessage,
  resolveStructuredEconomicRelease,
  buildEconomicNewsAnalysis,
  processDuePendingReleases,
  runEconomicReleaseDryRun,
  getProviderRegistry,
  getPendingQueue,
  resetEconomicReleaseRuntimeForTests,
  createEconomicReleaseCycleMetrics,
  mergeProviderMetricsIntoCycle,
  recordEconomicCycleDetection,
  canPublishStructuredRelease,
  logEconomicReleaseDroppedIncomplete,
};
