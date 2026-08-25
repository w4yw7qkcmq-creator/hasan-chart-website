#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const newsWorker = fs.readFileSync(path.join(root, "news-worker.js"), "utf8");
  const atomicPublish = fs.readFileSync(path.join(root, "lib/telegram-news/atomic-publish.js"), "utf8");
  const phase2Integration = fs.readFileSync(
    path.join(root, "lib/news-intelligence/economic-editorial/integration.js"),
    "utf8"
  );

  assert(newsWorker.includes("scheduleExternalNewsShadowReview"), "Shadow editor imported in news-worker");
  assert(
    /if \(!latestNews\.isTelegramSource\) \{[\s\S]*scheduleExternalNewsShadowReview/.test(newsWorker),
    "Shadow editor only invoked inside RSS guard"
  );
  assert(!newsWorker.includes("await reviewExternalNewsBeforePublish"), "Live editor no longer blocks RSS publish");
  assert(!atomicPublish.includes("external-news-editor"), "Telegram atomic publish isolated from editor module");
  assert(!phase2Integration.includes("external-news-editor"), "Phase2 integration isolated from editor");

  const shadowIndex = newsWorker.indexOf("void scheduleExternalNewsShadowReview(");
  const telegramAnalyzeGuard = newsWorker.indexOf("if (telegramItem?.isTelegramSource)");
  assert(telegramAnalyzeGuard > 0, "Telegram analyze guard exists");
  assert(shadowIndex > telegramAnalyzeGuard, "Shadow editor call appears after Telegram analyze short-circuit");

  console.log("rss-editor-telegram-isolation.test.cjs PASS");
}

run();
