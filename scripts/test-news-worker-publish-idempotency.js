#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  publishValidatedTelegramNewsCandidate,
  retryPublishLeg,
  resetAtomicPublishForTests,
  getPublishStateForFingerprint,
} = require("../worker/lib/telegram-news/atomic-publish.js");
const {
  resetPublishStateForTests,
  configurePublishWindowForTests,
  initializeBaselinesFromPosts,
  completeBaselineFetch,
} = require("../worker/lib/telegram-news/publish-state.js");
const { PUBLISH_STATES, createPublishLegState } = require("../worker/lib/news-publish-state.js");

function enablePublishStateForTests(baselineMessageId = "0") {
  resetPublishStateForTests();
  resetAtomicPublishForTests();
  process.env.TELEGRAM_NEWS_PUBLISH_ENABLED = "1";
  const baselineTime = "2026-08-01T12:00:00+00:00";
  configurePublishWindowForTests({
    publishingEnabledAt: baselineTime,
    minimumPublishableSourceTime: baselineTime,
  });
  initializeBaselinesFromPosts([
    {
      sourceChannel: "ForexBreakingNews",
      sourceMessageId: String(baselineMessageId),
      sourcePublishedAt: "2026-08-01T13:00:00+00:00",
      rawText: "baseline",
    },
    {
      sourceChannel: "ForexNewspaper",
      sourceMessageId: String(baselineMessageId),
      sourcePublishedAt: "2026-08-01T13:00:00+00:00",
      rawText: "baseline",
    },
  ]);
  completeBaselineFetch();
}

const candidate = {
  formattedMessage:
    "🚨 الذهب يسجل تحركًا ملحوظًا في الجلسة\n\nسجل الذهب ارتفاعًا بنسبة 1.8%.\n\n📊 التأثير المحتمل:\nقد ينعكس ذلك على الدولار والذهب.",
  resolvedTitle: "الذهب يسجل تحركًا ملحوظًا في الجلسة",
  newsType: "general",
  facts: {
    title: "الذهب يسجل تحركًا ملحوظًا في الجلسة",
    detailLines: ["Gold rises 1.8% after Powell comments"],
    numbers: ["1.8%"],
  },
  post: {
    sourceUrl: "https://example.com/gold-inflation",
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "999",
    sourcePublishedAt: "2026-08-01T15:00:00+00:00",
    rawText: "Gold rises after US inflation data",
  },
  skipPublish: false,
};

enablePublishStateForTests("0");

(async () => {
  let telegramCalls = 0;
  let siteCalls = 0;

  const deps = {
    dryRun: false,
    sendTelegramMessage: async () => {
      telegramCalls += 1;
      return { ok: true, message_id: 12345 };
    },
    savePublishedNewsToSupabase: async () => ({ ok: true }),
    saveNewsPostToSupabase: async () => {
      siteCalls += 1;
      if (siteCalls === 1) {
        return { error: "db_insert_failed" };
      }
      return { ok: true, id: "site-post-1" };
    },
    savePublishedNewsLink: () => {},
  };

  const partial = await publishValidatedTelegramNewsCandidate(candidate, {}, deps);
  assert.equal(partial.partial, true);
  assert.equal(partial.telegramSent, true);
  assert.equal(partial.dbInserted, false);
  assert.equal(partial.retryLeg, "site_only");
  assert.equal(telegramCalls, 1);
  assert.equal(siteCalls, 1);

  const legState = getPublishStateForFingerprint(partial.fingerprint);
  const retried = await retryPublishLeg(candidate, legState, {}, deps);
  assert.equal(retried.published, true);
  assert.equal(retried.retryLeg, "site_only");
  assert.equal(siteCalls, 2);
  assert.equal(telegramCalls, 1);

  const completed = createPublishLegState({
    state: PUBLISH_STATES.COMPLETED,
    fingerprint: "fp-complete",
    telegramSent: true,
    siteInserted: true,
  });
  const noRetry = await retryPublishLeg(candidate, completed, {}, deps);
  assert.equal(noRetry.skipped, true);

  console.log("news worker publish idempotency PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
