#!/usr/bin/env node

const path = require("path");

const root = path.join(__dirname, "..");

const {
  resolveEditorV2Mode,
  isEditorV2Off,
  isEditorV2ShadowMode,
  isEditorV2LiveMode,
  isEditorV2Enabled,
  EDITOR_V2_MODES,
} = require(path.join(root, "lib/general-rss/editor-v2/mode"));
const {
  runEditorV2ShadowReview,
  runEditorV2PublicationReview,
  scheduleEditorV2ShadowReview,
} = require(path.join(root, "lib/general-rss/editor-v2"));
const {
  getEditorV2TelemetrySnapshot,
  resetEditorV2TelemetryForTests,
} = require(path.join(root, "lib/general-rss/editor-v2/telemetry"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const MATERIAL_ITEM = {
  title: "Bank of Korea rate call a coin toss as economists split on August hike",
  contentSnippet:
    "The near-even split among economists underlines how finely balanced this decision is, with the case for a hike resting on above-target inflation.",
  sourceName: "ForexLive",
  link: "https://example.com/bok-rate-call",
};

function testModeResolver() {
  assert(resolveEditorV2Mode({ EDITOR_V2_MODE: "OFF" }) === EDITOR_V2_MODES.OFF, "OFF");
  assert(resolveEditorV2Mode({ EDITOR_V2_MODE: "SHADOW" }) === EDITOR_V2_MODES.SHADOW, "SHADOW");
  assert(resolveEditorV2Mode({ EDITOR_V2_MODE: "LIVE" }) === EDITOR_V2_MODES.LIVE, "LIVE");
  assert(resolveEditorV2Mode({ EDITOR_V2_MODE: "bogus" }) === EDITOR_V2_MODES.SHADOW, "invalid→SHADOW");
  assert(resolveEditorV2Mode({}) === EDITOR_V2_MODES.SHADOW, "default SHADOW");
  assert(isEditorV2Off({ EDITOR_V2_MODE: "OFF" }), "is off");
  assert(isEditorV2ShadowMode({ EDITOR_V2_MODE: "SHADOW" }), "is shadow");
  assert(isEditorV2LiveMode({ EDITOR_V2_MODE: "LIVE" }), "is live");
  assert(isEditorV2Enabled({ EDITOR_V2_MODE: "SHADOW" }), "shadow enabled");
  assert(!isEditorV2Enabled({ EDITOR_V2_MODE: "OFF" }), "off disabled");
}

async function testOffSkipsShadow() {
  resetEditorV2TelemetryForTests();
  const scheduled = await scheduleEditorV2ShadowReview(
    { item: MATERIAL_ITEM },
    { disableAi: true, env: { EDITOR_V2_MODE: "OFF" } }
  );
  assert(scheduled.skipped === true, "OFF must skip shadow scheduling");
  const snap = getEditorV2TelemetrySnapshot();
  assert(snap.global.shadowAttempted === 0, "OFF must not increment shadow attempted");
}

async function testShadowRecordsPathTelemetry() {
  resetEditorV2TelemetryForTests();
  const result = await runEditorV2ShadowReview(
    { item: MATERIAL_ITEM },
    { disableAi: true, env: { EDITOR_V2_MODE: "SHADOW" } }
  );
  assert(result.ok, `shadow must pass (${result.reasonCode || result.stage})`);
  const snap = getEditorV2TelemetrySnapshot();
  assert(snap.global.shadowAttempted === 1, "shadow attempted");
  assert(snap.global.shadowPassed === 1, "shadow passed");
  assert(snap.global.finalPassed === 1, "final passed");
  assert(snap.global.fallbackAttempted >= 1, "fallback attempted with disableAi");
  assert(Array.isArray(snap.samples) && snap.samples.length === 1, "sample persisted");
  assert(snap.samples[0].verdict === "WOULD_PASS", "shadow sample verdict");
  assert(snap.samples[0].outputPath === "DETERMINISTIC_FALLBACK", "disableAi uses fallback");
}

async function testLivePublicationReview() {
  resetEditorV2TelemetryForTests();
  const result = await runEditorV2PublicationReview(
    { item: MATERIAL_ITEM },
    { disableAi: true, env: { EDITOR_V2_MODE: "LIVE" } }
  );
  assert(result.ok, `live review must pass (${result.reasonCode || result.stage})`);
  const snap = getEditorV2TelemetrySnapshot();
  assert(snap.global.liveAttempted === 1, "live attempted");
  assert(snap.global.livePassed === 1, "live passed");
  assert(snap.samples[0].verdict === "LIVE_PASS", "live sample verdict");
  assert(result.presentation?.telegramMessage, "live presentation returned");
}

function testNewsWorkerWiring() {
  const fs = require("fs");
  const newsWorker = fs.readFileSync(path.join(root, "news-worker.js"), "utf8");
  assert(newsWorker.includes("resolveEditorV2Mode"), "health exposes v2 mode");
  assert(newsWorker.includes("isEditorV2LiveMode"), "live guard wired");
  assert(newsWorker.includes("runEditorV2PublicationReview"), "live review imported");
  assert(newsWorker.includes("isEditorV2ShadowMode()"), "shadow guard wired");
  assert(newsWorker.includes("scheduleEditorV2ShadowReview"), "shadow scheduler wired");
}

async function run() {
  testModeResolver();
  await testOffSkipsShadow();
  await testShadowRecordsPathTelemetry();
  await testLivePublicationReview();
  testNewsWorkerWiring();
  console.log("editor-v2-mode-switch.test.cjs PASS");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
