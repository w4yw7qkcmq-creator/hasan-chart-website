#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-intelligence");

const {
  buildCanonicalEventFromCandidate,
  resolveEventTypeFromAliases,
  getEventFamily,
  evaluateCopySimilarity,
  validateEditorialOutput,
  validateFactIntegrity,
  detectRawFallbackPattern,
  createNewsPublisherGateway,
  createPublicationStore,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
  DESTINATIONS,
  BLOCK_REASONS,
} = require(root);

const { buildTelegramPublicationRequest } = require(path.join(root, "adapters"));
const { formatEconomicReleaseMessage } = require(path.join(__dirname, "..", "lib", "economic-releases", "format"));
const { mergeProviderEvents } = require(path.join(__dirname, "..", "lib", "economic-releases", "normalize"));
const { CANONICAL_EVENT_DEFINITIONS } = require(path.join(__dirname, "..", "lib", "economic-releases", "canonical-events"));

const RELEASE_DATE = "2026-08-06T12:30:00.000Z";

const RAW_SOURCE_VARIANTS = [
  `🔴 Initial Jobless Claims
Previous: 197K
Forecast: 203K
Actual: 199K
@ForexBreakingNews
https://t.me/ForexBreakingNews/12345`,

  `Initial Claims US 🇺🇸
Prev 197K | Exp 203K | Act 199K`,

  `🚨 مطالبات البطالة الأمريكية
السابق: 197K
المتوقع: 203K
الحالي: 199K
اشترك في قناتنا t.me/joinchat/example`,

  `Initial Jobless Claims
Previous: 197K
Forecast: 203K
Actual: 199K
(duplicate delayed message)`,
];

function buildProfessionalReleaseMessage() {
  const event = mergeProviderEvents([
    {
      eventKey: "US_INITIAL_JOBLESS_CLAIMS",
      title: "Initial Jobless Claims",
      country: "US",
      scheduledAt: RELEASE_DATE,
      actual: "199K",
      forecast: "203K",
      previous: "197K",
      sourceName: "telegram",
      sourceTimestamp: RELEASE_DATE,
    },
  ]);
  return formatEconomicReleaseMessage(event, CANONICAL_EVENT_DEFINITIONS.US_INITIAL_JOBLESS_CLAIMS);
}

function buildPublication(body, overrides = {}) {
  return {
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: RELEASE_DATE,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: "طلبات إعانة البطالة الأمريكية",
    body,
    bodySource: "formatted",
    rawSourceText: overrides.rawSourceText || RAW_SOURCE_VARIANTS[0],
    destination: DESTINATIONS.BOTH,
    sourceLink: overrides.sourceLink || "telegram:ForexBreakingNews/12345",
    importance: "HIGH",
    facts: {
      actual: "199K",
      forecast: "203K",
      previous: "197K",
    },
    ...overrides,
  };
}

function testEventAliases() {
  assert.strictEqual(resolveEventTypeFromAliases("Initial Jobless Claims"), "US_INITIAL_JOBLESS_CLAIMS");
  assert.strictEqual(resolveEventTypeFromAliases("Initial Claims"), "US_INITIAL_JOBLESS_CLAIMS");
  assert.strictEqual(resolveEventTypeFromAliases("مطالبات البطالة"), "US_INITIAL_JOBLESS_CLAIMS");
  assert.strictEqual(resolveEventTypeFromAliases("Continuing Jobless Claims"), "US_CONTINUING_JOBLESS_CLAIMS");
  assert.strictEqual(getEventFamily("US_INITIAL_JOBLESS_CLAIMS"), "US_WEEKLY_LABOR_CLAIMS");
  assert.notStrictEqual(
    resolveEventTypeFromAliases("Initial Jobless Claims"),
    resolveEventTypeFromAliases("Continuing Jobless Claims")
  );
}

function testEventKeyNormalization() {
  const fromEnglish = buildCanonicalEventFromCandidate({
    title: "Initial Jobless Claims",
    releaseDate: RELEASE_DATE,
    actual: "199K",
    forecast: "203K",
    previous: "197K",
  });
  const fromArabic = buildCanonicalEventFromCandidate({
    title: "مطالبات البطالة",
    rawText: "السابق 197K المتوقع 203K الحالي 199K",
    releaseDate: RELEASE_DATE,
    actual: "199K",
    forecast: "203K",
    previous: "197K",
  });

  assert.strictEqual(fromEnglish.eventType, "US_INITIAL_JOBLESS_CLAIMS");
  assert.strictEqual(fromArabic.eventType, "US_INITIAL_JOBLESS_CLAIMS");
  assert.strictEqual(fromEnglish.eventKey, fromArabic.eventKey);
  assert.match(fromEnglish.eventKey, /^US:US_INITIAL_JOBLESS_CLAIMS:/);
}

function testCopySimilarityGuard() {
  const raw = RAW_SOURCE_VARIANTS[0];
  const exactCopy = raw;
  assert.strictEqual(evaluateCopySimilarity(exactCopy, raw).ok, false);

  const emojiOnly = raw.replace("🔴", "🟢");
  assert.strictEqual(evaluateCopySimilarity(emojiOnly, raw).ok, false);

  const minorEdit = `${raw}\n\nتابعونا للمزيد`;
  assert.strictEqual(evaluateCopySimilarity(minorEdit, raw).ok, false);

  const professional = buildProfessionalReleaseMessage();
  assert.strictEqual(evaluateCopySimilarity(professional, raw).ok, true);
  assert.strictEqual(evaluateCopySimilarity(professional, RAW_SOURCE_VARIANTS[2]).ok, true);
}

function testRawFallbackBlocked() {
  const raw = RAW_SOURCE_VARIANTS[0];
  const editorial = validateEditorialOutput({
    title: "test",
    body: raw,
    rawSourceText: raw,
  });
  assert.strictEqual(editorial.ok, false);
  assert.strictEqual(editorial.reason, BLOCK_REASONS.RAW_TEXT_FALLBACK_FORBIDDEN);

  const pattern = detectRawFallbackPattern(raw, "", raw);
  assert.strictEqual(pattern.blocked, true);
}

function testFactIntegrity() {
  const ok = validateFactIntegrity(
    { actual: "199K", forecast: "203K", previous: "197K" },
    { actual: "199K", forecast: "203K", previous: "197K" }
  );
  assert.strictEqual(ok.ok, true);

  const bad = validateFactIntegrity(
    { actual: "209K", forecast: "203K", previous: "197K" },
    { actual: "199K", forecast: "203K", previous: "197K" }
  );
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, BLOCK_REASONS.FACT_INTEGRITY_FAILED);
}

async function testIdempotencyAndRace() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const body = buildProfessionalReleaseMessage();
  const publication = buildPublication(body);

  const first = await gateway.publish(publication, { dryRun: true });
  assert.strictEqual(first.published, true);

  const second = await gateway.publish(
    buildPublication(body, { sourceLink: "telegram:ForexBreakingNews/99999", rawSourceText: RAW_SOURCE_VARIANTS[1] }),
    { dryRun: true }
  );
  assert.strictEqual(second.blocked, true);
  assert.strictEqual(second.reason, "DUPLICATE_BLOCKED");

  const parallel = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      gateway.publish(
        buildPublication(body, {
          sourceLink: `telegram:ForexBreakingNews/parallel-${index}`,
          rawSourceText: RAW_SOURCE_VARIANTS[index % RAW_SOURCE_VARIANTS.length],
        }),
        { dryRun: true }
      )
    )
  );
  const allowed = parallel.filter((result) => result.published).length;
  const blocked = parallel.filter((result) => result.blocked).length;
  assert.strictEqual(allowed, 0);
  assert.strictEqual(blocked, 5);
}

async function testRssEconomicBlocked() {
  const gateway = createNewsPublisherGateway({ runtimeMode: "test", forceMemory: true });
  const body = buildProfessionalReleaseMessage();
  const result = await gateway.publish(
    buildPublication(body, { sourceType: SOURCE_TYPES.RSS_GENERAL, sourceLink: "https://rss.example/item" }),
    { dryRun: true }
  );
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.reason, BLOCK_REASONS.RSS_ECONOMIC_PUBLISH_FORBIDDEN);
}

async function testJoblessClaimsReplay() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const professionalBody = buildProfessionalReleaseMessage();

  const outcomes = {
    eventsIdentified: new Set(),
    releaseAllowed: 0,
    duplicatesBlocked: 0,
    rawBlocked: 0,
    factErrors: 0,
  };

  for (let index = 0; index < RAW_SOURCE_VARIANTS.length; index += 1) {
    const raw = RAW_SOURCE_VARIANTS[index];
    const normalized = buildCanonicalEventFromCandidate({
      title: index === 2 ? "مطالبات البطالة" : "Initial Jobless Claims",
      rawText: raw,
      releaseDate: RELEASE_DATE,
      actual: "199K",
      forecast: "203K",
      previous: "197K",
    });
    if (normalized.eventKey) {
      outcomes.eventsIdentified.add(normalized.eventKey);
    }

    const attemptBody = index === 0 ? professionalBody : raw;
    const result = await gateway.publish(
      buildPublication(attemptBody, {
        rawSourceText: raw,
        sourceLink: `telegram:ForexBreakingNews/replay-${index}`,
      }),
      { dryRun: true }
    );

    if (result.published) {
      outcomes.releaseAllowed += 1;
    } else if (result.reason === "DUPLICATE_BLOCKED") {
      outcomes.duplicatesBlocked += 1;
    } else if (result.reason === BLOCK_REASONS.RAW_TEXT_FALLBACK_FORBIDDEN) {
      outcomes.rawBlocked += 1;
    } else if (result.reason === BLOCK_REASONS.SOURCE_COPY_SIMILARITY_TOO_HIGH) {
      outcomes.rawBlocked += 1;
    } else if (result.reason === BLOCK_REASONS.FACT_INTEGRITY_FAILED) {
      outcomes.factErrors += 1;
    }
  }

  assert.strictEqual(outcomes.eventsIdentified.size, 1);
  assert.strictEqual(outcomes.releaseAllowed, 1);
  assert.ok(outcomes.duplicatesBlocked + outcomes.rawBlocked >= RAW_SOURCE_VARIANTS.length - 1);
  assert.strictEqual(outcomes.factErrors, 0);
  assert.ok(outcomes.rawBlocked >= 3);
}

async function testWorkerRestartSimulation() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const body = buildProfessionalReleaseMessage();
  const publication = buildPublication(body);

  await gateway.publish(publication, { dryRun: true });

  const gatewayAfterRestart = createNewsPublisherGateway({ store });
  const retry = await gatewayAfterRestart.publish(
    buildPublication(body, { sourceLink: "telegram:ForexBreakingNews/restart" }),
    { dryRun: true }
  );
  assert.strictEqual(retry.blocked, true);
  assert.strictEqual(retry.reason, "DUPLICATE_BLOCKED");
}

function testTelegramAdapterUsesFormattedOnly() {
  const candidate = {
    newsType: "economic",
    formattedMessage: buildProfessionalReleaseMessage(),
    post: {
      rawText: RAW_SOURCE_VARIANTS[0],
      sourceUrl: "telegram:test/1",
      sourceChannel: "test",
      sourceMessageId: "1",
      sourcePublishedAt: RELEASE_DATE,
    },
    facts: {
      title: "Initial Jobless Claims",
      canonical: { eventKey: "US_INITIAL_JOBLESS_CLAIMS", country: "US" },
      actual: "199K",
      forecast: "203K",
      previous: "197K",
    },
  };

  const publication = buildTelegramPublicationRequest(candidate, {
    ok: true,
    sanitizedMessage: candidate.formattedMessage,
    resolvedTitle: "طلبات إعانة البطالة الأمريكية",
  });

  assert.notStrictEqual(publication.body, candidate.post.rawText);
  assert.strictEqual(publication.bodySource, "formatted");
}

async function run() {
  testEventAliases();
  testEventKeyNormalization();
  testCopySimilarityGuard();
  testRawFallbackBlocked();
  testFactIntegrity();
  await testIdempotencyAndRace();
  await testRssEconomicBlocked();
  await testJoblessClaimsReplay();
  await testWorkerRestartSimulation();
  testTelegramAdapterUsesFormattedOnly();
  console.log("news-intelligence.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
