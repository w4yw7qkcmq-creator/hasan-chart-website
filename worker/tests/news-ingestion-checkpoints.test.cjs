#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const {
  resetCheckpointStoreForTests,
  hydrateFromDb,
  isRssItemNew,
  markRssItemSeen,
  bootstrapRssSource,
  classifyTelegramMessage,
  markTelegramMessageSeen,
  bootstrapTelegramChannel,
  getRssState,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const { processGeneralRssItems, resetRssObservationStateForTests } = require(path.join(root, "lib/general-rss"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function item(title, link, isoDate, sourceName = "CNBC") {
  return {
    title,
    link,
    isoDate,
    pubDate: isoDate,
    feedUrl: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    sourceName,
  };
}

function runRestartReplayTest() {
  resetCheckpointStoreForTests();
  resetRssObservationStateForTests();

  const now = Date.now();
  const feedA = item("Story A", "https://example.com/a", new Date(now - 60 * 60_000).toISOString());
  const feedB = item("Story B", "https://example.com/b", new Date(now - 30 * 60_000).toISOString());
  const feedC = item("Story C", "https://example.com/c", new Date(now - 10 * 60_000).toISOString());

  bootstrapRssSource("CNBC", [feedA, feedB], {
    nowMs: now,
    maxAgeHours: 24,
    publishedLinks: new Set(["https://example.com/a"]),
  });

  assert(isRssItemNew("CNBC", feedA) === false, "published bootstrap item should be seen");
  assert(isRssItemNew("CNBC", feedB) === true, "recent non-published bootstrap item stays new for evaluation");
  assert(isRssItemNew("CNBC", feedC) === true, "recent unseen item should remain new");

  markRssItemSeen("CNBC", feedB, { outcome: "duplicate_skipped" });
  markRssItemSeen("CNBC", feedC, { outcome: "duplicate_skipped" });

  resetRssObservationStateForTests();
  hydrateFromDb(null);

  const state = getRssState("CNBC");
  state.recentSeenKeys = ["link:https://example.com/a", "link:https://example.com/b", "link:https://example.com/c"];
  state.bootstrapped = true;

  const restartFeed = [
    feedA,
    feedB,
    feedC,
    item("Story D", "https://example.com/d", new Date(now - 5 * 60_000).toISOString()),
    item("Story E", "https://example.com/e", new Date(now - 2 * 60_000).toISOString()),
  ];

  const pipeline = processGeneralRssItems(restartFeed, {
    publishedItems: [],
    publishStats: { postsLastHour: 0 },
    dryRun: false,
    skipCheckpointCheck: false,
    nowMs: now,
  });

  assert(pipeline.diagnostics.oldSeenSkipped >= 3, "A/B/C should be old seen after restart");
  assert(pipeline.diagnostics.newItems >= 2, "D/E should be evaluated as new");
}

function runTelegramCursorTest() {
  resetCheckpointStoreForTests();
  bootstrapTelegramChannel("ForexBreakingNews", [], { nowMs: Date.now(), maxAgeHours: 24, publishedKeys: new Set() });
  markTelegramMessageSeen("ForexBreakingNews", { sourceMessageId: "41636" }, { outcome: "bootstrap" });

  const oldPinned = classifyTelegramMessage("ForexBreakingNews", {
    sourceMessageId: "41636",
    isPinned: true,
  });
  assert(oldPinned.classification === "PINNED_OLD_MESSAGE", "pinned old message classified correctly");
  assert(oldPinned.new === false, "pinned old is not new");

  const newer = classifyTelegramMessage("ForexBreakingNews", { sourceMessageId: "41638" });
  assert(newer.new === true, "41638 should be new when cursor is 41636");
}

function runBootstrapPolicyTest() {
  resetCheckpointStoreForTests();
  const now = Date.now();
  const oldItem = item("Old", "https://example.com/old", new Date(now - 30 * 60 * 60_000).toISOString());
  const recentItem = item(
    "Saudi Aramco fire after Houthis claim responsibility",
    "https://example.com/saudi",
    new Date(now - 2 * 60 * 60_000).toISOString()
  );

  const result = bootstrapRssSource("CNBC", [oldItem, recentItem], {
    nowMs: now,
    maxAgeHours: 24,
    publishedLinks: new Set(),
  });

  assert(result.marked >= 1, "old item marked seen on bootstrap");
  assert(isRssItemNew("CNBC", recentItem) === true, "recent eligible item stays new on first boot");
}

function run() {
  runRestartReplayTest();
  runTelegramCursorTest();
  runBootstrapPolicyTest();
  console.log("news-ingestion-checkpoints.test.cjs PASS");
}

run();
