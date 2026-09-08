#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createNewsPublisherGateway } = require("../worker/lib/news-intelligence/publisher-gateway");
const { createInMemoryPublicationStore } = require("../worker/lib/news-intelligence/publication-store");
const {
  buildPrevalidatedRssGatewayPublication,
  buildRssPublicationEventKey,
  publishPrevalidatedRssViaGateway,
  retryPrevalidatedRssGatewayPublication,
  isPrevalidatedRssGeneralPublication,
  PREVALIDATED_RSS_CONTRACT,
} = require("../worker/lib/general-rss/gateway-adapter");
const { validateNumericEconomicSourcePolicy } = require("../worker/lib/news-intelligence/source-policy");
const { PUBLICATION_TYPES, SOURCE_TYPES } = require("../worker/lib/news-intelligence/publication-types");

const RSS_URL = "https://www.example.com/markets/oil-prices-rise-2026";
const RSS_URL_B = "https://www.example.com/markets/oil-prices-rise-2026?utm=feed";

function buildSamplePresentation() {
  const publicationMessage =
    "🚨 أسعار النفط ترتفع مع تصاعد التوترات\n\nسجل خام برنت ارتفاعًا ملحوظًا في الجلسة الأوروبية.\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";
  const siteTitle = "أسعار النفط ترتفع مع تصاعد التوترات";
  const siteContent =
    "سجل خام برنت ارتفاعًا ملحوظًا في الجلسة الأوروبية.\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";
  return {
    canonicalHeadline: siteTitle,
    imageTitle: siteTitle,
    telegramMessage: publicationMessage,
    siteTitle,
    siteContent,
    dedupeIdentity: `${siteTitle} ${siteContent}`,
  };
}

function buildSampleItem(link = RSS_URL) {
  return {
    link,
    title: "Oil prices rise on geopolitical tensions",
    sourceName: "ExampleFeed",
    feedUrl: "https://example.com/rss.xml",
    impactLevel: "HIGH",
    isTelegramSource: false,
  };
}

function createGateway(store) {
  return createNewsPublisherGateway({
    store,
    runtimeMode: "test",
    forceMemory: true,
  });
}

function createDeps(overrides = {}) {
  const calls = {
    telegram: 0,
    site: 0,
    notifications: 0,
    publishedNews: 0,
    publishedLink: 0,
  };

  const deps = {
    dryRun: false,
    deliverRssTelegramLeg: async () => {
      calls.telegram += 1;
      if (overrides.telegramError) {
        throw new Error(overrides.telegramError);
      }
      return { sent: true, mode: "photo" };
    },
    saveNewsPostToSupabase: async (post) => {
      calls.site += 1;
      if (overrides.siteFailOnAttempt && calls.site === overrides.siteFailOnAttempt) {
        return { error: "site_insert_failed" };
      }
      deps.lastSitePost = post;
      return { ok: true, id: "site-post-1" };
    },
    savePublishedNewsToSupabase: async () => {
      calls.publishedNews += 1;
      return { ok: true };
    },
    savePublishedNewsLink: () => {
      calls.publishedLink += 1;
    },
    dispatchMarketNewsNotifications: async () => {
      calls.notifications += 1;
    },
    ...overrides.extraDeps,
  };

  return { deps, calls };
}

async function testIdentityStableAcrossNormalization() {
  const keyA = buildRssPublicationEventKey(`${RSS_URL}/`);
  const keyB = buildRssPublicationEventKey(RSS_URL);
  assert.equal(keyA, keyB);
  assert.match(keyA, /^rss:https:\/\//);
}

async function testPublishOnce() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: "https://cdn.example.com/oil.jpg",
    sourceImageResult: { visualType: "photo" },
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: "oil+price_move",
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  const { deps, calls } = createDeps();
  const result = await publishPrevalidatedRssViaGateway(gateway, publication, deps);

  assert.equal(result.telegramSent, true);
  assert.equal(result.siteInserted, true);
  assert.equal(calls.telegram, 1);
  assert.equal(calls.site, 1);
  assert.equal(calls.notifications, 0);
  assert.equal(calls.publishedNews, 0);
  assert.equal(deps.lastSitePost.title, presentation.siteTitle);
  assert.equal(deps.lastSitePost.content, presentation.siteContent);
  assert.equal(deps.lastSitePost.source_link, RSS_URL);
}

async function testDuplicateUrlBlocked() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const baseInput = {
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  };

  const { deps: deps1, calls: calls1 } = createDeps();
  const first = await publishPrevalidatedRssViaGateway(
    gateway,
    buildPrevalidatedRssGatewayPublication(baseInput),
    deps1
  );
  assert.equal(first.siteInserted, true);

  const { deps: deps2, calls: calls2 } = createDeps();
  const second = await publishPrevalidatedRssViaGateway(
    gateway,
    buildPrevalidatedRssGatewayPublication(baseInput),
    deps2
  );

  assert.equal(second.blocked, true);
  assert.equal(second.reason, "DUPLICATE_BLOCKED");
  assert.equal(calls2.telegram, 0);
  assert.equal(calls2.site, 0);
}

async function testCrossFeedSameUrlBlocked() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const sharedLink = RSS_URL;

  const first = buildPrevalidatedRssGatewayPublication({
    latestNews: { ...buildSampleItem(sharedLink), sourceName: "FeedA" },
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  const second = buildPrevalidatedRssGatewayPublication({
    latestNews: { ...buildSampleItem(sharedLink), sourceName: "FeedB" },
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  assert.equal(first.eventKey, second.eventKey);

  const { deps: deps1 } = createDeps();
  await publishPrevalidatedRssViaGateway(gateway, first, deps1);

  const { deps: deps2, calls: calls2 } = createDeps();
  const blocked = await publishPrevalidatedRssViaGateway(gateway, second, deps2);
  assert.equal(blocked.blocked, true);
  assert.equal(calls2.telegram, 0);
}

async function testTelegramSuccessSiteFailThenRetrySiteOnly() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  const { deps, calls } = createDeps({ siteFailOnAttempt: 1 });
  const partial = await publishPrevalidatedRssViaGateway(gateway, publication, deps);
  assert.equal(partial.telegramSent, true);
  assert.equal(partial.siteInserted, false);
  assert.equal(partial.partial, true);
  assert.equal(calls.telegram, 1);
  assert.equal(calls.site, 1);

  const retried = await retryPrevalidatedRssGatewayPublication(
    gateway,
    partial.publicationRecord,
    { retryLeg: "site_only", skipTelegram: true },
    deps
  );
  assert.equal(retried.siteInserted, true);
  assert.equal(calls.telegram, 1);
  assert.equal(calls.site, 2);
}

async function testTelegramFailThenFullRetryCompletesBothLegs() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  let telegramAttempts = 0;
  const { deps, calls } = createDeps({
    extraDeps: {
      deliverRssTelegramLeg: async () => {
        telegramAttempts += 1;
        if (telegramAttempts === 1) {
          throw new Error("telegram_failed");
        }
        return { sent: true, mode: "text" };
      },
    },
  });

  const failed = await publishPrevalidatedRssViaGateway(gateway, publication, deps);
  assert.equal(failed.failed, true);
  assert.equal(failed.siteInserted, false);
  assert.equal(failed.telegramSent, false);
  assert.equal(calls.site, 0);
  assert.equal(telegramAttempts, 1);

  const retried = await retryPrevalidatedRssGatewayPublication(
    gateway,
    failed.publicationRecord,
    { retryLeg: "full" },
    deps
  );
  assert.equal(retried.telegramSent, true);
  assert.equal(retried.siteInserted, true);
  assert.equal(telegramAttempts, 2);
  assert.equal(calls.site, 1);
}

async function testRestartWithPartialState() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  const { deps, calls } = createDeps({ siteFailOnAttempt: 1 });
  const partial = await publishPrevalidatedRssViaGateway(gateway, publication, deps);
  assert.equal(partial.partial, true);

  const gateway2 = createGateway(store);
  const retried = await retryPrevalidatedRssGatewayPublication(
    gateway2,
    partial.publicationRecord,
    { retryLeg: "site_only", skipTelegram: true },
    deps
  );
  assert.equal(retried.siteInserted, true);
  assert.equal(calls.telegram, 1);
  assert.equal(calls.site, 2);
}

async function testContractRejectsEconomicRelease() {
  assert.equal(isPrevalidatedRssGeneralPublication({ sourceType: SOURCE_TYPES.RSS_GENERAL, publicationType: PUBLICATION_TYPES.RELEASE, metadata: { prevalidatedRssContract: PREVALIDATED_RSS_CONTRACT } }), false);

  const policy = validateNumericEconomicSourcePolicy({
    eventType: "us_cpi",
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    sourceId: "ExampleFeed",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.equal(policy.ok, false);
}

async function testOutputParityFields() {
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: "https://cdn.example.com/oil.jpg",
    sourceImageResult: { visualType: "photo" },
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: "oil+price_move",
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  assert.equal(publication.body, presentation.telegramMessage);
  assert.equal(publication.metadata.siteContent, presentation.siteContent);
  assert.equal(publication.title, presentation.siteTitle);
  assert.equal(publication.sourceLink, RSS_URL);
  assert.equal(publication.deferPostPublishSideEffects, true);
}

async function testGatewayDefersPostPublishSideEffects() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });
  const { deps, calls } = createDeps();

  const result = await publishPrevalidatedRssViaGateway(gateway, publication, deps);
  assert.equal(result.published, true);
  assert.equal(calls.notifications, 0);
  assert.equal(calls.publishedNews, 0);
  assert.equal(calls.publishedLink, 0);
}

async function testSiteSuccessTelegramFailThenRetryTelegramOnly() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });

  let telegramAttempts = 0;
  const { deps, calls } = createDeps({
    extraDeps: {
      deliverRssTelegramLeg: async () => {
        telegramAttempts += 1;
        throw new Error("telegram_failed");
      },
    },
  });

  const partialRecord = {
    eventKey: publication.eventKey,
    publicationType: publication.publicationType,
    sourceType: publication.sourceType,
    sourceId: publication.sourceId,
    telegramLegStatus: "failed",
    siteLegStatus: "success",
    metadata: {
      ...publication.metadata,
      title: publication.title,
      body: publication.body,
      deferPostPublishSideEffects: true,
    },
  };

  const retried = await retryPrevalidatedRssGatewayPublication(
    gateway,
    partialRecord,
    { retryLeg: "telegram_only", skipSite: true },
    {
      ...deps,
      deliverRssTelegramLeg: async () => {
        telegramAttempts += 1;
        return { sent: true, mode: "text" };
      },
    }
  );

  assert.equal(retried.telegramSent, true);
  assert.equal(retried.siteInserted, true);
  assert.equal(telegramAttempts, 1);
  assert.equal(calls.site, 0);
}

async function testOverlappingPublishAttempts() {
  const store = createInMemoryPublicationStore();
  const gateway = createGateway(store);
  const presentation = buildSamplePresentation();
  const publication = buildPrevalidatedRssGatewayPublication({
    latestNews: buildSampleItem(),
    approvedRssPresentation: presentation,
    publicationMessage: presentation.telegramMessage,
    finalImage: null,
    sourceImageResult: null,
    imageTitle: presentation.imageTitle,
    combinedTopicCluster: null,
    combinedNewsIdentity: presentation.dedupeIdentity,
    normalizedDedupeTitle: presentation.siteTitle,
  });
  const { deps } = createDeps();

  const [first, second] = await Promise.all([
    publishPrevalidatedRssViaGateway(gateway, publication, deps),
    publishPrevalidatedRssViaGateway(gateway, publication, deps),
  ]);

  const outcomes = [first, second];
  const publishedCount = outcomes.filter((item) => item.published === true).length;
  const blockedCount = outcomes.filter((item) => item.blocked === true).length;
  assert.equal(publishedCount, 1);
  assert.equal(blockedCount, 1);
}

async function run() {
  await testIdentityStableAcrossNormalization();
  await testPublishOnce();
  await testDuplicateUrlBlocked();
  await testCrossFeedSameUrlBlocked();
  await testTelegramSuccessSiteFailThenRetrySiteOnly();
  await testTelegramFailThenFullRetryCompletesBothLegs();
  await testSiteSuccessTelegramFailThenRetryTelegramOnly();
  await testRestartWithPartialState();
  await testGatewayDefersPostPublishSideEffects();
  await testOverlappingPublishAttempts();
  await testContractRejectsEconomicRelease();
  await testOutputParityFields();
  console.log("rss gateway publish PASS");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
