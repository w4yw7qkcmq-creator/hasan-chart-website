const { logPhase2Event, PHASE2_EVENTS } = require("./observability-v2");
const { getFamilyMetadata } = require("./interpretation-registry");
const { getEventFamily } = require("../event-registry");
const { composeFamilyEditorial, composeSingleEditorial } = require("./economic-editor");

function buildAggregationKey(structuredEvent = {}) {
  const family = structuredEvent.eventFamily || getEventFamily(structuredEvent.eventType);
  if (!family) {
    return null;
  }
  return `${structuredEvent.country || "US"}|${family}|${structuredEvent.releaseTime || "unknown"}`;
}

function createFamilyAggregationCoordinator(options = {}) {
  const windows = new Map();
  const publishedFamilies = new Set();
  const defaultWindowMs = options.windowMs || 6000;

  function clearWindow(key) {
    const entry = windows.get(key);
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    windows.delete(key);
  }

  async function flushWindow(key) {
    const entry = windows.get(key);
    if (!entry) {
      return null;
    }
    clearWindow(key);

    if (publishedFamilies.has(key)) {
      return { ok: false, blocked: true, reason: "FAMILY_ALREADY_PUBLISHED", duplicate: true };
    }

    logPhase2Event(PHASE2_EVENTS.EVENT_FAMILY_WINDOW_EXPIRED, {
      family: entry.family,
      childCount: entry.children.length,
    });

    if (entry.children.length === 1) {
      const result = await composeSingleEditorial(entry.children[0], entry.options);
      if (result.ok) {
        publishedFamilies.add(key);
      }
      for (const waiter of entry.waiters) {
        waiter(result);
      }
      return result;
    }

    const result = await composeFamilyEditorial(entry.family, entry.children, entry.options);
    if (result.ok) {
      publishedFamilies.add(key);
      logPhase2Event(PHASE2_EVENTS.EVENT_FAMILY_MERGED, {
        family: entry.family,
        childCount: entry.children.length,
      });
    }
    for (const waiter of entry.waiters) {
      waiter(result);
    }
    return result;
  }

  function submitStructuredEvent(structuredEvent, runOptions = {}) {
    const family = structuredEvent.eventFamily || getEventFamily(structuredEvent.eventType);
    const key = buildAggregationKey({ ...structuredEvent, eventFamily: family });

    if (!family || !key) {
      return composeSingleEditorial(structuredEvent, runOptions);
    }

    if (publishedFamilies.has(key)) {
      return Promise.resolve({ ok: false, blocked: true, reason: "DUPLICATE_BLOCKED", duplicate: true });
    }

    const familyMeta = getFamilyMetadata(family);
    const windowMs = runOptions.windowMs || familyMeta?.aggregationWindowMs || defaultWindowMs;

    return new Promise((resolve) => {
      let entry = windows.get(key);
      if (!entry) {
        entry = {
          family,
          children: [],
          options: runOptions,
          waiters: [],
          timer: null,
        };
        windows.set(key, entry);
        logPhase2Event(PHASE2_EVENTS.EVENT_FAMILY_WAITING, { family, windowMs });
        entry.timer = setTimeout(() => {
          flushWindow(key);
        }, windowMs);
      }

      entry.waiters.push(resolve);
      entry.options = runOptions;

      const existingIndex = entry.children.findIndex((c) => c.eventType === structuredEvent.eventType);
      if (existingIndex >= 0) {
        entry.children[existingIndex] = structuredEvent;
      } else {
        entry.children.push(structuredEvent);
      }

      const expected = new Set(familyMeta?.expectedSiblings || []);
      const received = new Set(entry.children.map((c) => c.eventType));
      const allPresent = expected.size > 0 && [...expected].every((s) => received.has(s));

      if (allPresent) {
        clearTimeout(entry.timer);
        flushWindow(key);
      }
    });
  }

  function resetForTests() {
    for (const key of windows.keys()) {
      clearWindow(key);
    }
    publishedFamilies.clear();
  }

  return {
    submitStructuredEvent,
    flushWindow,
    resetForTests,
    _windows: windows,
    _publishedFamilies: publishedFamilies,
  };
}

module.exports = {
  buildAggregationKey,
  createFamilyAggregationCoordinator,
};
