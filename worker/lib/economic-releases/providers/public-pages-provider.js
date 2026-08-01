const { calendarTitleMatchesCanonical } = require("../canonical-events");
const { createBaseProviderMetrics, normalizeProviderEvent, toLegacyProviderShape } = require("./provider-interface");
const { createConservativeHttpClient } = require("./http-client");
const { shouldFetchNow } = require("./polling-scheduler");
const { parseCalendarHtml } = require("./parser/table-parser");
const { fingerprintCalendarHtml, detectSchemaChange } = require("./parser/schema-fingerprint");

const DEFAULT_PUBLIC_CALENDAR_URL =
  process.env.ECONOMIC_PUBLIC_CALENDAR_URL || "https://www.investing.com/economic-calendar/";

function createPublicPagesCalendarProvider(options = {}) {
  const name = "public_pages_calendar";
  const metrics = createBaseProviderMetrics(name);
  const http = options.httpClient || createConservativeHttpClient(options.httpOptions);
  const calendarUrl = options.calendarUrl || DEFAULT_PUBLIC_CALENDAR_URL;

  let cache = {
    fetchedAt: 0,
    events: [],
    fingerprint: null,
    parserStrategy: null,
    robotsAllowed: null,
  };

  async function checkRobotsAllowed(originUrl) {
    if (cache.robotsAllowed != null) {
      return cache.robotsAllowed;
    }

    try {
      const origin = new URL(originUrl);
      const robotsUrl = `${origin.origin}/robots.txt`;
      const robotsResult = await http.fetchUrl(robotsUrl, {
        accept: "text/plain,*/*",
        cacheTtlMs: 6 * 60 * 60 * 1000,
      });

      if (!robotsResult.ok) {
        cache.robotsAllowed = true;
        return true;
      }

      const lines = String(robotsResult.body || "").split(/\r?\n/);
      let applies = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^User-agent:\s*\*/i.test(trimmed)) {
          applies = true;
          continue;
        }
        if (/^User-agent:/i.test(trimmed)) {
          applies = false;
          continue;
        }
        if (applies && /^Disallow:\s*(\S+)/i.test(trimmed)) {
          const path = trimmed.match(/^Disallow:\s*(\S+)/i)?.[1] || "";
          if (path && origin.pathname.startsWith(path.replace(/\*$/, ""))) {
            cache.robotsAllowed = false;
            metrics.providerStatus = "robots_disallowed";
            metrics.lastErrorSafe = "robots_txt_disallow";
            metrics.providerEnabled = false;
            return false;
          }
        }
      }

      cache.robotsAllowed = true;
      return true;
    } catch (_error) {
      cache.robotsAllowed = true;
      return true;
    }
  }

  async function fetchSchedule({ forceRefresh = false, scheduledAt = null } = {}) {
    metrics.lastFetchAt = new Date().toISOString();

    const httpState = http.getState();
    metrics.requestsToday = httpState.requestsToday;
    metrics.blockedUntil = httpState.blockedUntil;

    if (httpState.blockedUntil && Date.now() < new Date(httpState.blockedUntil).getTime()) {
      metrics.providerStatus = "provider_blocked";
      metrics.lastErrorSafe = httpState.lastErrorSafe;
      return cache.events;
    }

    if (!forceRefresh && cache.events.length && !shouldFetchNow({ lastFetchAt: cache.fetchedAt, scheduledAt })) {
      metrics.cacheHits += 1;
      return cache.events;
    }

    const robotsOk = await checkRobotsAllowed(calendarUrl);
    if (!robotsOk) {
      return [];
    }

    const response = await http.fetchUrl(calendarUrl, {
      accept: "text/html,application/xhtml+xml",
      cacheTtlMs: 10 * 60 * 1000,
    });

    if (response.cacheHit) {
      metrics.cacheHits += 1;
    }

    if (response.status === 304) {
      metrics.http304 += 1;
      cache.fetchedAt = Date.now();
      return cache.events;
    }

    if (response.status === 200) {
      metrics.http200 += 1;
    }
    if (response.status === 403) {
      metrics.http403 += 1;
    }
    if (response.status === 429) {
      metrics.http429 += 1;
    }

    if (!response.ok) {
      metrics.providerStatus = response.blocked ? "provider_blocked" : "fetch_failed";
      metrics.lastErrorSafe = response.reason || `http_${response.status || "error"}`;
      if (response.blocked) {
        metrics.blockedUntil = http.getState().blockedUntil;
      }
      return cache.events;
    }

    const parsed = parseCalendarHtml(response.body);
    if (!parsed.events.length) {
      metrics.parserFailures += 1;
      metrics.providerStatus = "parser_schema_changed";
      metrics.lastErrorSafe = "parser_schema_changed";
      metrics.schemaChanges += 1;
      metrics.providerEnabled = false;
      return [];
    }

    const nextFingerprint = fingerprintCalendarHtml(response.body);
    if (cache.fingerprint && detectSchemaChange(cache.fingerprint, nextFingerprint) && parsed.strategy !== cache.parserStrategy) {
      metrics.schemaChanges += 1;
      metrics.lastErrorSafe = "parser_schema_changed";
    }

    cache = {
      fetchedAt: Date.now(),
      events: parsed.events.map((event) =>
        normalizeProviderEvent({
          ...event,
          provider: name,
          sourceName: name,
          sourceTimestamp: new Date().toISOString(),
        })
      ),
      fingerprint: nextFingerprint,
      parserStrategy: parsed.strategy,
      robotsAllowed: cache.robotsAllowed,
    };

    metrics.eventsFetched += cache.events.length;
    metrics.lastSuccessAt = new Date().toISOString();
    metrics.providerStatus = "ok";
    metrics.lastErrorSafe = null;

    return cache.events;
  }

  async function fetchRelease(canonical, options = {}) {
    const events = await fetchSchedule(options);
    const windowHours = options.windowHours || 8;
    const windowMs = windowHours * 60 * 60 * 1000;
    const now = Date.now();

    const matched = events.filter((event) => {
      if (!calendarTitleMatchesCanonical(event.title, canonical)) {
        return false;
      }
      const scheduledAt = new Date(event.scheduledAt).getTime();
      return !Number.isNaN(scheduledAt) && Math.abs(now - scheduledAt) <= windowMs;
    });

    metrics.eventsMatched += matched.length;
    return matched;
  }

  async function healthCheck() {
    const state = http.getState();
    return {
      provider: name,
      enabled: metrics.providerEnabled,
      status: metrics.providerStatus,
      robotsAllowed: cache.robotsAllowed,
      blockedUntil: state.blockedUntil,
      requestsToday: state.requestsToday,
      cachedEvents: cache.events.length,
      parserStrategy: cache.parserStrategy,
      fingerprint: cache.fingerprint,
    };
  }

  function normalizeEvent(raw) {
    return normalizeProviderEvent({ ...raw, provider: name, sourceName: name });
  }

  async function findMatchingRelease(canonical, options = {}) {
    const matched = await fetchRelease(canonical, options);
    return matched.map((event) =>
      toLegacyProviderShape({
        ...event,
        canonicalEventKey: canonical.eventKey,
      })
    );
  }

  async function fetchEvents(options = {}) {
    const events = await fetchSchedule(options);
    return events.map((event) => toLegacyProviderShape(event));
  }

  return {
    name,
    priority: 1,
    providerEnabled: true,
    fetchSchedule,
    fetchRelease,
    fetchEvents,
    findMatchingRelease,
    healthCheck,
    normalizeEvent,
    getMetrics: () => ({ ...metrics }),
  };
}

module.exports = {
  createPublicPagesCalendarProvider,
  DEFAULT_PUBLIC_CALENDAR_URL,
};
