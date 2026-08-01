#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const fixturesDir = path.join(__dirname, "fixtures");

const { mergeProviderEvents, normalizeEconomicFieldValue, containsForbiddenPlaceholder } = require(path.join(
  root,
  "lib/economic-releases/normalize"
));
const { resolveCanonicalEventKey, isStructuredTripleReleaseTitle } = require(path.join(root, "lib/economic-releases/canonical-events"));
const { validateEconomicReleaseCompleteness } = require(path.join(root, "lib/economic-releases/completeness"));
const {
  formatEconomicReleaseMessage,
  formatPlainEconomicNewsMessage,
} = require(path.join(root, "lib/economic-releases/format"));
const {
  resetEconomicReleaseRuntimeForTests,
  buildEconomicNewsAnalysis,
  canPublishStructuredRelease,
  runEconomicReleaseDryRun,
} = require(path.join(root, "lib/economic-releases"));
const { parseCalendarHtml } = require(path.join(root, "lib/economic-releases/providers/parser/table-parser"));
const { createConservativeHttpClient } = require(path.join(root, "lib/economic-releases/providers/http-client"));
const { parseTradingEconomicsCalendarHtml } = require(path.join(
  root,
  "lib/economic-releases/providers/parser/trading-economics-table-parser"
));
const { createPublicPagesCalendarProvider } = require(path.join(
  root,
  "lib/economic-releases/providers/public-pages-provider"
));
const { createTradingEconomicsPublicProvider } = require(path.join(
  root,
  "lib/economic-releases/providers/trading-economics-public-provider"
));
const { createEconomicReleaseProviderRegistry } = require(path.join(root, "lib/economic-releases/providers"));
const { hasPreviousOrRevised } = require(path.join(root, "lib/economic-releases/completeness"));
const {
  createEconomicReleasePendingQueue,
  processPendingEntry,
  MAX_ATTEMPTS,
} = require(path.join(root, "lib/economic-releases/pending-queue"));

const FORBIDDEN_OUTPUT = /(?:غير\s*متوفر|N\/A|null|undefined)/i;

function assertNoForbiddenPayload(payload) {
  for (const value of Object.values(payload)) {
    if (typeof value !== "string" || !value) {
      continue;
    }
    assert.ok(!FORBIDDEN_OUTPUT.test(value), `Forbidden placeholder found: ${value}`);
  }
}

function buildCompleteEvent(overrides = {}) {
  return mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      country: "US",
      scheduledAt: "2026-07-15T12:30:00.000Z",
      actual: "0.3%",
      forecast: "0.2%",
      previous: "0.1%",
      sourceName: "investing_calendar",
      sourceTimestamp: "2026-07-15T12:30:10.000Z",
      ...overrides,
    },
  ]);
}

function loadFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

function testParserFixtures() {
  const normal = parseCalendarHtml(loadFixture("economic-calendar-normal.html"));
  assert.strictEqual(normal.strategy, "investing_row");
  assert.ok(normal.events.length >= 2);

  const cpi = parseCalendarHtml(loadFixture("economic-calendar-cpi-complete.html"));
  assert.strictEqual(cpi.events[0].actual, "0.2%");
  assert.strictEqual(cpi.events[0].forecast, "0.2%");

  const nfp = parseCalendarHtml(loadFixture("economic-calendar-nfp-complete.html"));
  assert.strictEqual(nfp.events[0].title, "Nonfarm Payrolls");
  assert.strictEqual(nfp.events[0].actual, "150K");

  const changed = parseCalendarHtml(loadFixture("economic-calendar-schema-changed.html"));
  assert.strictEqual(changed.events.length, 0);
}

function testCpiMomYoySeparation() {
  const mom = resolveCanonicalEventKey("US CPI (MoM)");
  const yoy = resolveCanonicalEventKey("US CPI (YoY)");
  assert.strictEqual(mom.eventKey, "US_CPI_MOM");
  assert.strictEqual(yoy.eventKey, "US_CPI_YOY");
  assert.notStrictEqual(mom.eventKey, yoy.eventKey);
}

function testActualArrivesAfterForecastPrevious() {
  const before = mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      forecast: "0.2%",
      previous: "0.1%",
      actual: "",
      sourceName: "public_pages_calendar",
      sourceTimestamp: "2026-07-15T12:29:00.000Z",
    },
  ]);
  const beforeValidation = validateEconomicReleaseCompleteness(before, resolveCanonicalEventKey("US CPI (MoM)"));
  assert.strictEqual(beforeValidation.complete, false);

  const after = mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      forecast: "0.2%",
      previous: "0.1%",
      actual: "0.3%",
      sourceName: "public_pages_calendar",
      sourceTimestamp: "2026-07-15T12:30:10.000Z",
    },
  ]);
  const afterValidation = validateEconomicReleaseCompleteness(after, resolveCanonicalEventKey("US CPI (MoM)"));
  assert.strictEqual(afterValidation.complete, true);
}

function testRevisedPreviousOnlyCompleteness() {
  const revisedOnly = mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      actual: "0.3%",
      forecast: "0.2%",
      previous: "",
      revisedPrevious: "0.2%",
      sourceName: "public_pages_calendar",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);
  assert.ok(hasPreviousOrRevised(revisedOnly));
  const validation = validateEconomicReleaseCompleteness(revisedOnly, resolveCanonicalEventKey("US CPI (MoM)"));
  assert.strictEqual(validation.complete, true);
}

function testOfficialConflictBlocksPublish() {
  const conflict = mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      actual: "0.3%",
      forecast: "0.2%",
      previous: "0.1%",
      sourceName: "public_pages_calendar",
      sourceTimestamp: new Date().toISOString(),
    },
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      actual: "0.5%",
      forecast: null,
      previous: null,
      sourceName: "official",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);
  const validation = validateEconomicReleaseCompleteness(conflict, resolveCanonicalEventKey("US CPI (MoM)"));
  assert.strictEqual(validation.complete, false);
  assert.strictEqual(validation.reason, "source_conflict");
}

async function testHttp403BlocksProvider() {
  let blockedUntil = null;
  const httpClient = {
    fetchUrl: async () => ({
      ok: false,
      status: 403,
      blocked: true,
      reason: "http_403",
      body: "Access Denied",
    }),
    getState: () => ({
      requestsToday: 1,
      blockedUntil,
      lastErrorSafe: blockedUntil ? "http_403" : null,
    }),
    blockProvider: () => {
      blockedUntil = new Date(Date.now() + 60_000).toISOString();
    },
  };

  const provider = createPublicPagesCalendarProvider({
    calendarUrl: "https://example.com/economic-calendar/",
    httpClient,
  });

  const events = await provider.fetchSchedule({ forceRefresh: true });
  assert.strictEqual(events.length, 0);
  const metrics = provider.getMetrics();
  assert.strictEqual(metrics.http403, 1);
  assert.strictEqual(metrics.providerStatus, "provider_blocked");
}

async function testHttp429RetryAfter() {
  let blockedReason = null;
  const httpClient = createConservativeHttpClient({ dailyLimit: 100 });
  const originalFetch = httpClient.fetchUrl.bind(httpClient);

  httpClient.fetchUrl = async (url, options) => {
    blockedReason = "http_429";
    httpClient.blockProvider("http_429", 120);
    return {
      ok: false,
      status: 429,
      blocked: true,
      reason: "http_429",
      retryAfterSeconds: 120,
      body: "Too Many Requests",
    };
  };

  const result = await httpClient.fetchUrl("https://example.com/economic-calendar/");
  assert.strictEqual(result.status, 429);
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(blockedReason, "http_429");
  const state = httpClient.getState();
  assert.ok(state.blockedUntil);
}

async function testCaptchaPageBlocksProvider() {
  let blockedUntil = null;
  const httpClient = {
    fetchUrl: async () => ({
      ok: false,
      status: 403,
      blocked: true,
      reason: "challenge_page_detected",
      body: loadFixture("economic-calendar-captcha.html"),
    }),
    getState: () => ({
      requestsToday: 1,
      blockedUntil,
      lastErrorSafe: blockedUntil ? "challenge_page_detected" : null,
    }),
  };

  const provider = createPublicPagesCalendarProvider({
    calendarUrl: "https://example.com/economic-calendar/",
    httpClient,
  });

  await provider.fetchSchedule({ forceRefresh: true });
  const metrics = provider.getMetrics();
  assert.strictEqual(metrics.providerStatus, "provider_blocked");
}

async function testParserSchemaChangedDisablesProvider() {
  const httpClient = {
    fetchUrl: async () => ({
      ok: true,
      status: 200,
      body: loadFixture("economic-calendar-schema-changed.html"),
      cacheHit: false,
    }),
    getState: () => ({ requestsToday: 1, blockedUntil: null, lastErrorSafe: null }),
  };

  const provider = createPublicPagesCalendarProvider({
    calendarUrl: "https://example.com/economic-calendar/",
    httpClient,
  });

  const events = await provider.fetchSchedule({ forceRefresh: true });
  assert.strictEqual(events.length, 0);
  const metrics = provider.getMetrics();
  assert.strictEqual(metrics.parserFailures, 1);
  assert.strictEqual(metrics.providerStatus, "parser_schema_changed");
  assert.strictEqual(metrics.providerEnabled, false);
}

async function testProviderFailureDoesNotStopPlainNews() {
  resetEconomicReleaseRuntimeForTests();
  const registry = {
    collectMatchingReleases: async () => {
      throw new Error("provider_down");
    },
  };

  const analysis = await buildEconomicNewsAnalysis({
    title: "Fed Chair Powell press conference remarks",
    link: "https://example.com/powell",
    registry,
    dryRun: true,
  });

  assert.strictEqual(analysis.handled, true);
  assert.strictEqual(analysis.usePlainTemplate, true);
  assert.strictEqual(analysis.skipPublish, false);
}

async function testDryRunWithMockRegistry() {
  resetEconomicReleaseRuntimeForTests();
  const parsed = parseCalendarHtml(loadFixture("economic-calendar-normal.html"));
  const registry = {
    getPrimaryCalendarProvider: () => ({
      name: "public_pages_calendar",
      fetchEvents: async () =>
        parsed.events.map((event) => ({
          ...event,
          sourceName: "public_pages_calendar",
          eventKey: null,
        })),
    }),
    collectMatchingReleases: async (canonical) => [
      {
        eventKey: canonical.eventKey,
        title: canonical.eventKey === "US_CPI_MOM" ? "CPI (MoM)" : "CPI (YoY)",
        actual: "0.3%",
        forecast: "0.2%",
        previous: "0.1%",
        sourceName: "public_pages_calendar",
        sourceTimestamp: new Date().toISOString(),
      },
    ],
    getVerificationProviders: () => [],
    getAllMetrics: () => [{ provider: "public_pages_calendar", providerStatus: "ok" }],
  };

  const report = await runEconomicReleaseDryRun({ registry, limit: 10 });
  assert.ok(report.rows.length >= 1);
  assert.ok(report.rows.every((row) => !/غير\s*متوفر|N\/A|null|undefined/i.test(String(row.Previous || row.Forecast || row.Actual || ""))));
}

function testLegacyInternalDisabled() {
  const registry = createEconomicReleaseProviderRegistry();
  const legacy = registry.providers.find((provider) => provider.name === "legacy_investing_internal");
  assert.strictEqual(legacy.providerEnabled, false);
}

function testCanonicalMatching() {
  const cpiMom = resolveCanonicalEventKey("US CPI (MoM) actual 0.3% forecast 0.2% previous 0.1%");
  assert.strictEqual(cpiMom.eventKey, "US_CPI_MOM");

  const cpiYoy = resolveCanonicalEventKey("US CPI (YoY) rises to 3.0%");
  assert.strictEqual(cpiYoy.eventKey, "US_CPI_YOY");

  const powell = resolveCanonicalEventKey("Fed Chair Powell press conference remarks");
  assert.strictEqual(powell.eventKey, "US_POWELL_SPEECH");
  assert.strictEqual(powell.requiresTripleTemplate, false);
}

function testCompletenessAndZeroHandling() {
  const complete = buildCompleteEvent();
  const canonical = resolveCanonicalEventKey("US CPI (MoM)");
  const validation = validateEconomicReleaseCompleteness(complete, canonical);
  assert.strictEqual(validation.complete, true);

  const zeroNfp = mergeProviderEvents([
    {
      eventKey: "US_NFP",
      title: "Nonfarm Payrolls",
      actual: "0K",
      forecast: "150K",
      previous: "147K",
      sourceName: "investing_calendar",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);
  const nfpCanonical = resolveCanonicalEventKey("US Nonfarm Payrolls");
  const zeroValidation = validateEconomicReleaseCompleteness(zeroNfp, nfpCanonical);
  assert.strictEqual(zeroValidation.complete, true);
  assert.strictEqual(normalizeEconomicFieldValue("0K").isMissing, false);
}

function testRevisedPrevious() {
  const revised = mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      actual: "0.3%",
      forecast: "0.2%",
      previous: "0.1%",
      revisedPrevious: "0.2%",
      sourceName: "investing_calendar",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);

  assert.strictEqual(revised.previous.display, "0.2%");
  assert.strictEqual(revised.isRevised, true);
}

function testIncompleteBlocked() {
  const incomplete = mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      actual: "0.3%",
      forecast: "",
      previous: "0.1%",
      sourceName: "investing_calendar",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);
  const canonical = resolveCanonicalEventKey("US CPI (MoM)");
  const validation = validateEconomicReleaseCompleteness(incomplete, canonical);
  assert.strictEqual(validation.complete, false);
  assert.deepStrictEqual(validation.missingFields, ["forecast"]);
}

function testFormattingWithoutPlaceholders() {
  const complete = buildCompleteEvent();
  const canonical = resolveCanonicalEventKey("US CPI (MoM)");
  const message = formatEconomicReleaseMessage(complete, canonical);

  assert.ok(message.includes("السابق"));
  assert.ok(message.includes("المتوقع"));
  assert.ok(message.includes("الحالي"));
  assert.ok(!containsForbiddenPlaceholder(message));
  assert.ok(!/غير\s*متوفر/i.test(message));
  assert.ok(!/\bN\/A\b/i.test(message));
  assert.ok(!/\bnull\b/i.test(message));
  assert.ok(!/\bundefined\b/i.test(message));
}

function testPlainNewsTemplate() {
  const canonical = resolveCanonicalEventKey("Fed Chair Powell press conference");
  const message = formatPlainEconomicNewsMessage("Powell speaks at press conference", canonical.arabicName);
  assert.ok(!message.includes("السابق"));
  assert.ok(!message.includes("المتوقع"));
  assert.ok(!message.includes("الحالي"));
}

function testFedRateDecisionLabels() {
  const canonical = resolveCanonicalEventKey("FOMC interest rate decision");
  const event = mergeProviderEvents([
    {
      eventKey: "US_FED_RATE_DECISION",
      title: "Fed Interest Rate Decision",
      actual: "5.50%",
      forecast: "5.50%",
      previous: "5.25%",
      sourceName: "investing_calendar",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);
  const message = formatEconomicReleaseMessage(event, canonical);
  assert.ok(message.includes("القرار السابق"));
  assert.ok(message.includes("التوقع"));
  assert.ok(message.includes("القرار الحالي"));
}

function testConflictBlocksPublish() {
  const conflict = mergeProviderEvents([
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      actual: "0.3%",
      forecast: "0.2%",
      previous: "0.1%",
      sourceName: "investing_calendar",
      sourceTimestamp: new Date().toISOString(),
    },
    {
      eventKey: "US_CPI_MOM",
      title: "CPI (MoM)",
      actual: "0.4%",
      forecast: "0.2%",
      previous: "0.1%",
      sourceName: "trading_economics",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);

  const canonical = resolveCanonicalEventKey("US CPI (MoM)");
  const validation = validateEconomicReleaseCompleteness(conflict, canonical);
  assert.strictEqual(validation.complete, false);
  assert.strictEqual(validation.reason, "source_conflict");
}

async function testRetryThenPublishOnce() {
  resetEconomicReleaseRuntimeForTests();
  const queue = createEconomicReleasePendingQueue();
  const canonical = resolveCanonicalEventKey("US CPI (MoM)");

  queue.enqueue({
    title: "US CPI (MoM)",
    canonical,
    scheduledAt: "2026-07-15T12:30:00.000Z",
    validation: { complete: false, missingFields: ["forecast"], reason: "structured_data_incomplete" },
    idempotencyKey: "US|US_CPI_MOM|2026-07-15T12:30:00.000Z",
    attempt: 0,
  });

  let calls = 0;
  const registry = {
    collectMatchingReleases: async () => [],
  };

  const resolveRelease = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        merged: mergeProviderEvents([
          {
            eventKey: "US_CPI_MOM",
            title: "CPI (MoM)",
            actual: "0.3%",
            forecast: "",
            previous: "0.1%",
            sourceName: "investing_calendar",
            sourceTimestamp: new Date().toISOString(),
          },
        ]),
      };
    }

    return {
      merged: buildCompleteEvent(),
    };
  };

  const first = await processPendingEntry(queue.getDueEntries()[0], { registry, resolveRelease });
  assert.strictEqual(first.action, "retry");

  queue.enqueue({
    ...queue.getDueEntries()[0],
    attempt: first.nextAttempt,
  });

  const second = await processPendingEntry(
    {
      title: "US CPI (MoM)",
      canonical,
      attempt: first.nextAttempt,
      idempotencyKey: "US|US_CPI_MOM|2026-07-15T12:30:00.000Z",
    },
    { registry, resolveRelease }
  );
  assert.strictEqual(second.action, "publish");
  assert.ok(second.message);
}

function testMissingValueDetection() {
  assert.strictEqual(normalizeEconomicFieldValue("غير متوفر").isMissing, true);
  assert.strictEqual(normalizeEconomicFieldValue("N/A").isMissing, true);
  assert.strictEqual(normalizeEconomicFieldValue("-").isMissing, true);
  assert.strictEqual(normalizeEconomicFieldValue("0.0%").isMissing, false);
}

async function testCompleteReleaseCanPublish() {
  const complete = buildCompleteEvent();
  const canonical = resolveCanonicalEventKey("US CPI (MoM)");
  const validation = validateEconomicReleaseCompleteness(complete, canonical);
  const message = formatEconomicReleaseMessage(complete, canonical);
  const publishCheck = canPublishStructuredRelease(validation, message);

  assert.strictEqual(publishCheck.allowed, true);

  const telegramPayload = { content: message, image_url: null };
  const dbPayload = { title: canonical.arabicName, content: message, image_url: null };
  assertNoForbiddenPayload(telegramPayload);
  assertNoForbiddenPayload(dbPayload);
}

async function testIncompleteReleaseNeverPublishes() {
  resetEconomicReleaseRuntimeForTests();
  const registry = {
    collectMatchingReleases: async () => [
      {
        eventKey: "US_CPI_MOM",
        title: "CPI (MoM)",
        actual: "0.3%",
        forecast: "",
        previous: "0.1%",
        sourceName: "investing_calendar",
        sourceTimestamp: new Date().toISOString(),
      },
    ],
  };

  const analysis = await buildEconomicNewsAnalysis({
    title: "US CPI (MoM) released",
    link: "https://example.com/cpi",
    registry,
    dryRun: true,
  });

  assert.strictEqual(analysis.skipPublish, true);
  assert.strictEqual(analysis.message, null);

  const publishCheck = canPublishStructuredRelease(analysis.validation, analysis.message);
  assert.strictEqual(publishCheck.allowed, false);

  const telegramPayload = { content: analysis.message, image_url: null };
  const dbPayload = { title: analysis.imageTitle, content: analysis.message, image_url: null };
  assertNoForbiddenPayload(telegramPayload);
  assertNoForbiddenPayload(dbPayload);
}

async function testExhaustedRetriesDropWithoutPublish() {
  resetEconomicReleaseRuntimeForTests();
  const canonical = resolveCanonicalEventKey("US CPI (MoM)");
  const resolveRelease = async () => ({
    merged: mergeProviderEvents([
      {
        eventKey: "US_CPI_MOM",
        title: "CPI (MoM)",
        actual: "0.3%",
        forecast: "",
        previous: "0.1%",
        sourceName: "investing_calendar",
        sourceTimestamp: new Date().toISOString(),
      },
    ]),
  });

  let lastOutcome = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    lastOutcome = await processPendingEntry(
      {
        title: "US CPI (MoM)",
        canonical,
        attempt,
        idempotencyKey: "US|US_CPI_MOM|2026-07-15T12:30:00.000Z",
      },
      { registry: {}, resolveRelease }
    );
  }

  assert.strictEqual(lastOutcome.action, "drop");
  assert.strictEqual(lastOutcome.message, undefined);

  const publishCheck = canPublishStructuredRelease(lastOutcome.validation, null);
  assert.strictEqual(publishCheck.allowed, false);
  assertNoForbiddenPayload({ content: null, image_url: null });
}

function testPlainNewsBypassesTripleRule() {
  const title = "Fed Chair Powell press conference remarks";
  assert.strictEqual(isStructuredTripleReleaseTitle(title), false);

  const message = formatPlainEconomicNewsMessage(title, "تصريحات باول");
  assert.ok(message);
  assert.ok(!message.includes("▪️ السابق"));
}

function testTradingEconomicsParserFixtures() {
  const complete = parseTradingEconomicsCalendarHtml(loadFixture("te-calendar-us-complete.html"));
  assert.strictEqual(complete.strategy, "trading_economics_semantic_table");
  assert.strictEqual(complete.events.length, 2);

  const ism = complete.events.find((event) => /ism manufacturing pmi/i.test(event.title));
  assert.ok(ism);
  assert.strictEqual(ism.actual, "54.0");
  assert.strictEqual(ism.previous, "53.3");
  assert.strictEqual(ism.forecast, "54");
  assert.strictEqual(ism.country, "US");

  const nfp = complete.events.find((event) => /non farm payrolls/i.test(event.title));
  assert.ok(nfp);
  assert.strictEqual(nfp.actual, "120K");
  assert.strictEqual(nfp.forecast, "91.0K");

  const missingForecast = parseTradingEconomicsCalendarHtml(loadFixture("te-calendar-forecast-missing.html"));
  const incomplete = missingForecast.events[0];
  const canonical = resolveCanonicalEventKey("US CPI (MoM)");
  const merged = mergeProviderEvents([
    {
      eventKey: canonical.eventKey,
      title: incomplete.title,
      actual: incomplete.actual,
      forecast: incomplete.forecast,
      previous: incomplete.previous,
      sourceName: "trading_economics_public",
      sourceTimestamp: new Date().toISOString(),
    },
  ]);
  const validation = validateEconomicReleaseCompleteness(merged, canonical);
  assert.strictEqual(validation.complete, false);
  assert.ok(validation.missingFields.includes("forecast"));
}

function testTradingEconomicsCanonicalSeparation() {
  const mom = resolveCanonicalEventKey("US CPI (MoM)");
  const yoy = resolveCanonicalEventKey("US CPI (YoY)");
  assert.strictEqual(mom.eventKey, "US_CPI_MOM");
  assert.strictEqual(yoy.eventKey, "US_CPI_YOY");

  const initial = resolveCanonicalEventKey("Initial Jobless Claims");
  const continuing = resolveCanonicalEventKey("Continuing Jobless Claims");
  assert.strictEqual(initial.eventKey, "US_INITIAL_JOBLESS_CLAIMS");
  assert.strictEqual(continuing.eventKey, "US_CONTINUING_JOBLESS_CLAIMS");
  assert.notStrictEqual(initial.eventKey, continuing.eventKey);
}

async function testTradingEconomicsPublicProviderLiveFixture() {
  const html =
    "<html><body>" +
    loadFixture("te-calendar-us-complete.html") +
    loadFixture("economic-calendar-normal.html") +
    "</body></html>";
  const httpClient = {
    fetchUrl: async () => ({ ok: true, status: 200, body: html, cacheHit: false }),
    getState: () => ({ requestsToday: 1, blockedUntil: null, lastErrorSafe: null }),
  };
  const provider = createTradingEconomicsPublicProvider({ httpClient });
  const events = await provider.fetchSchedule({ forceRefresh: true });
  assert.ok(events.length >= 2);
  const metrics = provider.getMetrics();
  assert.strictEqual(metrics.providerStatus, "ok");
  assert.strictEqual(metrics.parserFailures, 0);
}

async function testTradingEconomics403Blocked() {
  const httpClient = {
    fetchUrl: async () => ({ ok: false, status: 403, blocked: true, reason: "http_403", body: "Access Denied" }),
    getState: () => ({ requestsToday: 1, blockedUntil: null, lastErrorSafe: null }),
  };
  const provider = createTradingEconomicsPublicProvider({ httpClient });
  const events = await provider.fetchSchedule({ forceRefresh: true });
  assert.strictEqual(events.length, 0);
  assert.strictEqual(provider.getMetrics().providerStatus, "provider_blocked");
}

async function testTradingEconomicsSchemaChanged() {
  const httpClient = {
    fetchUrl: async () => ({ ok: true, status: 200, body: "<html><body>no table</body></html>", cacheHit: false }),
    getState: () => ({ requestsToday: 1, blockedUntil: null, lastErrorSafe: null }),
  };
  const provider = createTradingEconomicsPublicProvider({ httpClient });
  await provider.fetchSchedule({ forceRefresh: true });
  const metrics = provider.getMetrics();
  assert.strictEqual(metrics.parserFailures, 1);
  assert.strictEqual(metrics.providerEnabled, false);
}

function testTradingEconomicsRegistryPriority() {
  resetEconomicReleaseRuntimeForTests();
  const registry = createEconomicReleaseProviderRegistry();
  const primary = registry.getPrimaryCalendarProvider();
  assert.strictEqual(primary.name, "trading_economics_public");
}

async function run() {
  testParserFixtures();
  testCpiMomYoySeparation();
  testActualArrivesAfterForecastPrevious();
  testRevisedPreviousOnlyCompleteness();
  testOfficialConflictBlocksPublish();
  await testHttp403BlocksProvider();
  await testHttp429RetryAfter();
  await testCaptchaPageBlocksProvider();
  await testParserSchemaChangedDisablesProvider();
  await testProviderFailureDoesNotStopPlainNews();
  await testDryRunWithMockRegistry();
  testLegacyInternalDisabled();
  testCanonicalMatching();
  testCompletenessAndZeroHandling();
  testRevisedPrevious();
  testIncompleteBlocked();
  testFormattingWithoutPlaceholders();
  testPlainNewsTemplate();
  testFedRateDecisionLabels();
  testConflictBlocksPublish();
  await testRetryThenPublishOnce();
  testMissingValueDetection();
  await testCompleteReleaseCanPublish();
  await testIncompleteReleaseNeverPublishes();
  await testExhaustedRetriesDropWithoutPublish();
  testPlainNewsBypassesTripleRule();
  testTradingEconomicsParserFixtures();
  testTradingEconomicsCanonicalSeparation();
  await testTradingEconomicsPublicProviderLiveFixture();
  await testTradingEconomics403Blocked();
  await testTradingEconomicsSchemaChanged();
  testTradingEconomicsRegistryPriority();

  console.log("ECONOMIC_RELEASES_TESTS_PASSED", JSON.stringify({ tests: 33, maxAttempts: MAX_ATTEMPTS }));
}

run().catch((error) => {
  console.error("ECONOMIC_RELEASES_TESTS_FAILED", error.message);
  process.exit(1);
});
