#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { buildTelegramPublicationRequest } = require(path.join(root, "lib/news-intelligence/adapters"));
const { getEventFamily } = require(path.join(root, "lib/news-intelligence/event-registry"));
const {
  resetCheckpointStoreForTests,
  bootstrapTelegramChannel,
  markTelegramMessageSeen,
  markCheckpointsHydrated,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const {
  resetPublishStateForTests,
  configurePublishWindowForTests,
  isSourcePublishable,
} = require(path.join(root, "lib/telegram-news/publish-state"));
const { createTelegramMergeBuffer, resetTelegramMergeBufferForTests } = require(path.join(root, "lib/telegram-news/merge-buffer"));
const { validateSemanticPublication } = require(path.join(root, "lib/news-intelligence/semantic-publication-validation"));
const { validateAndRepairPublicationSemantics } = require(path.join(root, "lib/news-intelligence/editorial-repair"));
const { createNewsPublisherGateway } = require(path.join(root, "lib/news-intelligence/publisher-gateway"));
const { PUBLICATION_TYPES } = require(path.join(root, "lib/news-intelligence/publication-types"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function runPhillyFedFixtureTest() {
  const fixture = loadFixture("production-incident-philly-fed-20260820.json");
  const post = { ...fixture.post, sourceMessageId: "50001", rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);
  assert(facts.canonicalEventKey === fixture.expected.canonicalEventKey, "Philly Fed canonical event key");
  assert(facts.actual === fixture.expected.actual, "Philly Fed actual");
  assert(facts.forecast === fixture.expected.forecast, "Philly Fed forecast");
  assert(facts.previous === fixture.expected.previous, "Philly Fed previous");
  assert(facts.isStructuredTriple === true, "Philly Fed structured triple");
  assert(!/صدر الآن/.test(facts.title) || facts.title.length > 12, "Philly Fed title should not stay generic header-only");
}

function runJoblessClaimsFixtureTest() {
  const fixture = loadFixture("production-incident-jobless-claims-ar-20260820.json");
  const post = { ...fixture.post, sourceMessageId: "50001", rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);
  assert(facts.canonicalEventKey === fixture.expected.canonicalEventKey, "Jobless Claims canonical event key");
  assert(facts.actual === fixture.expected.actual, "Jobless Claims actual preserves K suffix");
  assert(facts.forecast === fixture.expected.forecast, "Jobless Claims forecast");
  assert(facts.previous === fixture.expected.previous, "Jobless Claims previous");
  assert(getEventFamily(facts.canonicalEventKey) === fixture.expected.eventFamily, "Jobless Claims family");

  const pub = buildTelegramPublicationRequest(
    { post, facts, newsType: "economic", formattedMessage: "placeholder", resolvedTitle: facts.title },
    { ok: true, sanitizedMessage: "placeholder", resolvedTitle: facts.title }
  );
  assert(pub.eventType === "US_INITIAL_JOBLESS_CLAIMS", "Jobless Claims publication eventType");
}

function runGoldMalformedEditorialTest() {
  const fixture = loadFixture("production-incident-gold-malformed-editorial-20260820.json");
  const publication = {
    ...fixture.publication,
    body: fixture.malformedBody,
  };
  const editorial = { body: fixture.malformedBody, title: publication.title };
  const validation = validateSemanticPublication(publication, editorial);
  assert(validation.ok === false, "Malformed gold editorial must fail semantic validation");
  assert(validation.issues.includes("duplicate_generic_primary_label"), "Duplicate generic primary label detected");
  assert(validation.issues.includes("contradictory_movement_language"), "Contradictory movement detected");

  const gateway = createNewsPublisherGateway({ runtimeMode: "test", forceMemory: true });
  return gateway.publish(publication, { dryRun: true }).then((result) => {
    assert(result.published === true, "Important gold candidate should publish after semantic repair");
    assert(
      !/الرقم الرئيسي:\s*4530[\s\S]*الرقم الرئيسي:\s*4532/.test(result.message || ""),
      "Malformed duplicate-label body must never reach gateway delivery"
    );
  });
}

async function runMergeBufferCheckpointRaceTest() {
  resetCheckpointStoreForTests();
  resetPublishStateForTests();
  resetTelegramMergeBufferForTests();
  markCheckpointsHydrated();
  configurePublishWindowForTests({ publishingEnabledAt: "2026-08-20T10:00:00.000Z" });

  const fixture = loadFixture("production-incident-jobless-claims-ar-20260820.json");
  const post = { ...fixture.post, sourceMessageId: "50001", rawText: fixture.sourceText };
  bootstrapTelegramChannel(post.sourceChannel, [post], { nowMs: Date.parse("2026-08-20T12:29:00.000Z") });

  assert(isSourcePublishable(post).ok === true, "Candidate publishable before processed mark");

  markTelegramMessageSeen(post.sourceChannel, post, { outcome: "processed" });
  assert(isSourcePublishable(post).ok === false, "Premature processed mark must block publish");

  resetCheckpointStoreForTests();
  markCheckpointsHydrated();
  configurePublishWindowForTests({ publishingEnabledAt: "2026-08-20T10:00:00.000Z" });
  bootstrapTelegramChannel(post.sourceChannel, [post], { nowMs: Date.parse("2026-08-20T12:29:00.000Z") });

  const mergeBuffer = createTelegramMergeBuffer({ disableAi: true });
  const submit = mergeBuffer.submit(post);
  assert(submit.action === "pending" || submit.action === "pending_dry_run", "Merge buffer accepts new economic candidate");
  assert(isSourcePublishable(post).ok === true, "Candidate stays publishable while pending merge flush");

  await mergeBuffer.flushAllSync({ disableAi: true });
  assert(isSourcePublishable(post).ok === true, "Flush path remains publishable when checkpoint is not prematurely marked");
}

async function runGoldRepairTest() {
  const fixture = loadFixture("production-incident-gold-malformed-editorial-20260820.json");
  const publication = { ...fixture.publication, body: fixture.malformedBody };
  const editorial = { body: fixture.malformedBody, title: publication.title };
  const repaired = validateAndRepairPublicationSemantics(publication, editorial, {});
  assert(repaired.ok === true, "Gold editorial repair should succeed for important factual candidate");
  assert(repaired.repaired === true, "Gold editorial should be repaired");
  const postRepair = validateSemanticPublication(repaired.publication, repaired.editorial);
  assert(postRepair.ok === true, "Repaired gold editorial must pass semantic validation");
  assert(!/الرقم الرئيسي:\s*4530[\s\S]*الرقم الرئيسي:\s*4532/.test(repaired.editorial.body), "Repaired body must not keep duplicate generic labels");
}

async function main() {
  runPhillyFedFixtureTest();
  runJoblessClaimsFixtureTest();
  await runGoldMalformedEditorialTest();
  await runMergeBufferCheckpointRaceTest();
  await runGoldRepairTest();
  console.log("production-incident-20260820.test.cjs PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
