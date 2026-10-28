#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..");
const {
  resetPublishStateForTests,
  initializeBaselinesFromPosts,
  completeBaselineFetch,
  isSourcePublishable,
  configurePublishWindowForTests,
  updateBaselineAfterPublish,
} = require(path.join(root, "lib/telegram-news/publish-state"));
const {
  resetCheckpointStoreForTests,
  hydrateFromDb,
  markTelegramMessageSeen,
  classifyTelegramMessage,
  reserveTelegramMessageInFlight,
  getTelegramState,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const { resetAtomicPublishForTests } = require(path.join(root, "lib/telegram-news/atomic-publish"));

function post(id, overrides = {}) {
  return {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: String(id),
    sourceUrl: `https://t.me/ForexBreakingNews/${id}`,
    sourcePublishedAt: new Date().toISOString(),
    priority: 1,
    rawText: "صدر الآن",
    ...overrides,
  };
}

function enablePublishState(baselineId = 43480) {
  resetPublishStateForTests();
  resetCheckpointStoreForTests();
  hydrateFromDb(null);
  resetAtomicPublishForTests();
  process.env.TELEGRAM_NEWS_PUBLISH_ENABLED = "1";
  const baselineTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  configurePublishWindowForTests({
    publishingEnabledAt: baselineTime,
    minimumPublishableSourceTime: baselineTime,
  });
  initializeBaselinesFromPosts([
    post(baselineId, { sourcePublishedAt: baselineTime }),
    post(baselineId, {
      sourceChannel: "ForexNewspaper",
      sourceUrl: `https://t.me/ForexNewspaper/${baselineId}`,
      sourcePublishedAt: baselineTime,
    }),
  ]);
  completeBaselineFetch();
}

function snapshotTelegramState(channel) {
  const state = getTelegramState(channel);
  return {
    highestMessageId: state.highestMessageId,
    recentSeenKeys: [...(state.recentSeenKeys || [])],
    bootstrapped: state.bootstrapped,
    bootstrappedAt: state.bootstrappedAt,
  };
}

function restoreTelegramState(channel, snapshot) {
  const state = getTelegramState(channel);
  state.highestMessageId = snapshot.highestMessageId;
  state.recentSeenKeys = [...snapshot.recentSeenKeys];
  state.bootstrapped = snapshot.bootstrapped;
  state.bootstrappedAt = snapshot.bootstrappedAt;
}

function testTwoValidReleasesSameMinute() {
  enablePublishState();
  const a = post(43490);
  const b = post(43491);
  reserveTelegramMessageInFlight(a.sourceChannel, a);
  reserveTelegramMessageInFlight(b.sourceChannel, b);
  assert.strictEqual(isSourcePublishable(a).ok, true);
  assert.strictEqual(isSourcePublishable(b).ok, true);
  updateBaselineAfterPublish(b);
  assert.strictEqual(isSourcePublishable(a).ok, true, "lower id must stay pending after higher id publishes");
  assert.strictEqual(isSourcePublishable(b).ok, false);
}

function testLowerIdPendingHigherIdProcessed() {
  enablePublishState();
  const a = post(43490);
  const b = post(43491);
  reserveTelegramMessageInFlight(a.sourceChannel, a);
  markTelegramMessageSeen(b.sourceChannel, b, { outcome: "processed" });
  assert.strictEqual(classifyTelegramMessage(a.sourceChannel, a).new, true);
  assert.strictEqual(isSourcePublishable(a).ok, true);
  assert.strictEqual(classifyTelegramMessage(b.sourceChannel, b).new, false);
  assert.ok(getTelegramState(a.sourceChannel).highestMessageId < 43490);
}

function testPromoProcessedBeforeOlderValid() {
  enablePublishState();
  const a = post(43490);
  const promo = post(43491);
  reserveTelegramMessageInFlight(a.sourceChannel, a);
  markTelegramMessageSeen(promo.sourceChannel, promo, { outcome: "processed" });
  assert.strictEqual(isSourcePublishable(a).ok, true);
  assert.strictEqual(isSourcePublishable(promo).ok, false);
  assert.strictEqual(isSourcePublishable(promo).reason, "OLD_SEEN_MESSAGE");
}

function testDuplicateMessages() {
  enablePublishState();
  const first = post(43490);
  updateBaselineAfterPublish(first);
  const dup = post(43490);
  assert.strictEqual(isSourcePublishable(dup).ok, false);
  assert.strictEqual(isSourcePublishable(dup).reason, "OLD_SEEN_MESSAGE");
}

function testWorkerRestartWithPendingMergeBuffer() {
  enablePublishState();
  const a = post(43490);
  const b = post(43491);
  reserveTelegramMessageInFlight(a.sourceChannel, a);
  markTelegramMessageSeen(b.sourceChannel, b, { outcome: "processed" });
  const persisted = snapshotTelegramState(a.sourceChannel);
  assert.ok(!persisted.recentSeenKeys.includes("msg:43490"));

  hydrateFromDb(null);
  restoreTelegramState(a.sourceChannel, persisted);

  assert.strictEqual(
    isSourcePublishable(a).ok,
    true,
    "pending A must survive restart when only B was marked processed"
  );
  assert.strictEqual(isSourcePublishable(b).ok, false);
}

function testFailedPublicationThenRetry() {
  enablePublishState();
  const a = post(43490);
  reserveTelegramMessageInFlight(a.sourceChannel, a);
  assert.strictEqual(isSourcePublishable(a).ok, true);
  assert.strictEqual(isSourcePublishable(a).ok, true, "failed attempt must not consume the checkpoint");
}

function testAlreadyPublishedEvent() {
  enablePublishState();
  const published = post(43490);
  updateBaselineAfterPublish(published);
  assert.strictEqual(classifyTelegramMessage(published.sourceChannel, published).new, false);
  const later = post(43491);
  assert.strictEqual(isSourcePublishable(later).ok, true);
}

function testPreviouslySkippedMessage() {
  enablePublishState();
  const skipped = post(43491);
  markTelegramMessageSeen(skipped.sourceChannel, skipped, { outcome: "processed" });
  assert.strictEqual(isSourcePublishable(skipped).ok, false);
  assert.strictEqual(isSourcePublishable(skipped).reason, "OLD_SEEN_MESSAGE");
}

function testMultipleWorkerCycles() {
  enablePublishState();
  const a = post(43490);
  const b = post(43491);
  reserveTelegramMessageInFlight(a.sourceChannel, a);
  markTelegramMessageSeen(b.sourceChannel, b, { outcome: "processed" });
  assert.strictEqual(isSourcePublishable(b).ok, false);
  assert.strictEqual(isSourcePublishable(a).ok, true);
  updateBaselineAfterPublish(a);
  assert.strictEqual(isSourcePublishable(a).ok, false);
  assert.strictEqual(isSourcePublishable(b).ok, false);
  const nextCycle = post(43492);
  assert.strictEqual(isSourcePublishable(nextCycle).ok, true);
}

function testHistoricalCheckpointCompatibility() {
  enablePublishState();
  const state = getTelegramState("ForexBreakingNews");
  state.highestMessageId = 43521;
  state.recentSeenKeys = ["msg:43520"];
  state.bootstrapped = true;

  assert.strictEqual(classifyTelegramMessage("ForexBreakingNews", post(43500)).new, false);
  assert.strictEqual(classifyTelegramMessage("ForexBreakingNews", post(43520)).new, false);
  assert.strictEqual(classifyTelegramMessage("ForexBreakingNews", post(43522)).new, true);
}

async function run() {
  const tests = [
    testTwoValidReleasesSameMinute,
    testLowerIdPendingHigherIdProcessed,
    testPromoProcessedBeforeOlderValid,
    testDuplicateMessages,
    testWorkerRestartWithPendingMergeBuffer,
    testFailedPublicationThenRetry,
    testAlreadyPublishedEvent,
    testPreviouslySkippedMessage,
    testMultipleWorkerCycles,
    testHistoricalCheckpointCompatibility,
  ];

  for (const testCase of tests) {
    testCase();
  }

  console.log("TELEGRAM_CHECKPOINT_ORDERING_TESTS_PASSED", JSON.stringify({ tests: tests.length }));
}

run().catch((error) => {
  console.error("TELEGRAM_CHECKPOINT_ORDERING_TESTS_FAILED", error.stack || error.message);
  process.exit(1);
});
