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

  assert(newsWorker.includes("scheduleEditorV2ShadowReview"), "Editor V2 shadow imported");
  assert(newsWorker.includes("isEditorV2LiveMode"), "V2 live guard present");
  assert(newsWorker.includes("runEditorV2PublicationReview"), "V2 live review present");
  assert(!newsWorker.includes("await runEditorV2ShadowReview("), "V2 shadow must stay async");
  assert(!atomicPublish.includes("editor-v2"), "Telegram atomic publish isolated from V2");
  assert(!phase2Integration.includes("editor-v2"), "Phase2 integration isolated from V2");

  const v2Index = newsWorker.indexOf("void scheduleEditorV2ShadowReview(");
  const telegramAnalyzeGuard = newsWorker.indexOf("if (telegramItem?.isTelegramSource)");
  assert(v2Index > telegramAnalyzeGuard, "V2 shadow call appears after Telegram analyze short-circuit");

  console.log("editor-v2-telegram-isolation.test.cjs PASS");
}

run();
