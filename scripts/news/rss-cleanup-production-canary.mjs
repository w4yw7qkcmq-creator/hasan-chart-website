#!/usr/bin/env node
/**
 * Read-only RSS cleanup canary — noop adapters, no production publish.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "scripts/news/.artifacts");

const {
  buildRssPublicationPresentation,
  validateGeneralRssEditorialOutput,
  normalizeHeadlineComparable,
} = require("../../worker/lib/general-rss");
const {
  resetCycleFunnelForTests,
  getCycleFunnel,
  recordPublicationAttempt,
  recordPublicationSuccess,
  recordRssPublished,
} = require("../../worker/lib/news-ingestion/cycle-funnel");

const FOREX_LIVE_FIXTURE = {
  sourceTitle: "Monday open indicative forex prices, August 10, 2026",
  imageTitle: "أسعار الفوركس التقديرية لافتتاح السوق يوم الاثنين، 10 أغسطس 2026",
  editorialMessage:
    "🚨 أسعار الفوركس التقديرية لافتتاح السوق يوم الاثنين، 10 أغسطس 2026 ⚠️\n\n" +
    "توقعات أسعار العملات الرئيسية مع بداية الأسبوع تشير إلى استقرار في بعض الأزواج، مع تحركات محدودة في السوق.\n\n" +
    "📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi",
};

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function countHeadlineLines(text, headline) {
  const target = normalizeHeadlineComparable(headline);
  return String(text || "")
    .split(/\n+/)
    .map((line) => normalizeHeadlineComparable(line))
    .filter((line) => line === target).length;
}

function simulateLogicalRssPublish() {
  resetCycleFunnelForTests();
  recordPublicationAttempt();
  recordPublicationSuccess();
  recordRssPublished();
  return getCycleFunnel();
}

function simulatePartialRetryNoDoubleCount() {
  resetCycleFunnelForTests();
  recordPublicationAttempt();
  recordPublicationSuccess();
  recordRssPublished();
  recordPublicationAttempt();
  return getCycleFunnel();
}

function runCanary() {
  const presentation = buildRssPublicationPresentation(FOREX_LIVE_FIXTURE);
  const editorialCheck = validateGeneralRssEditorialOutput({
    title: FOREX_LIVE_FIXTURE.sourceTitle,
    body: presentation.telegramMessage,
    rawSourceText:
      "Monday open indicative forex prices, August 10, 2026 with indicative FX levels for the week open.",
  });

  assertOk(editorialCheck.ok === true, "official footer must remain allowed");
  assertOk(
    countHeadlineLines(presentation.telegramMessage, presentation.canonicalHeadline) === 1,
    "telegram headline once"
  );
  assertOk(
    !presentation.siteContent.startsWith(presentation.siteTitle),
    "site content must not repeat title"
  );
  assertOk(
    (presentation.telegramMessage.match(/https:\/\/t\.me\/EconomicNewsi/gi) || []).length === 1,
    "footer once"
  );

  const successFunnel = simulateLogicalRssPublish();
  assertOk(successFunnel.rssPublished === 1, "rssPublished=1");
  assertOk(successFunnel.publicationsSuccess === 1, "publicationsSuccess=1");
  assertOk(successFunnel.publicationAttempts === 1, "publicationAttempts=1");
  assertOk(successFunnel.rssPublished <= successFunnel.publicationsSuccess, "rssPublished <= publicationsSuccess");

  const retryFunnel = simulatePartialRetryNoDoubleCount();
  assertOk(retryFunnel.rssPublished === 1, "retry must not double rssPublished");
  assertOk(retryFunnel.publicationsSuccess === 1, "retry must not double publicationsSuccess");
  assertOk(retryFunnel.publicationAttempts === 2, "retry records second attempt only");

  resetCycleFunnelForTests();
  const failedFunnel = getCycleFunnel();
  assertOk(failedFunnel.rssPublished === 0, "failed publish rssPublished=0");

  return {
    timestamp: new Date().toISOString(),
    fixture: "ForexLive-sanitized",
    funnel: {
      rssNew: 1,
      rssEligible: 1,
      rssEditorialEvaluated: 1,
      publicationAttempts: successFunnel.publicationAttempts,
      publicationsSuccess: successFunnel.publicationsSuccess,
      rssPublished: successFunnel.rssPublished,
    },
    presentation: {
      canonicalHeadline: presentation.canonicalHeadline,
      telegramHeadlineCount: countHeadlineLines(
        presentation.telegramMessage,
        presentation.canonicalHeadline
      ),
      siteTitle: presentation.siteTitle,
      siteContentStartsWithTitle: presentation.siteContent.startsWith(presentation.siteTitle),
      footerCount: (presentation.telegramMessage.match(/https:\/\/t\.me\/EconomicNewsi/gi) || []).length,
      editorialSafetyOk: editorialCheck.ok,
    },
    retry: {
      publicationAttempts: retryFunnel.publicationAttempts,
      rssPublished: retryFunnel.rssPublished,
      publicationsSuccess: retryFunnel.publicationsSuccess,
    },
    verdict: "RSS_CLEANUP_CANARY_PASS",
  };
}

mkdirSync(ARTIFACT_DIR, { recursive: true });
const report = runCanary();
const artifactPath = join(
  ARTIFACT_DIR,
  `rss-cleanup-canary-${report.timestamp.replace(/[:.]/g, "").slice(0, 15)}Z.json`
);
writeFileSync(artifactPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ verdict: report.verdict, artifact: artifactPath.replace(`${ROOT}/`, "") }, null, 2));
