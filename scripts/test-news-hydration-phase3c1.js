#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function testPageShellComposition() {
  const pageSource = read("app/(public)/news/page.js");
  assert.match(pageSource, /NewsPageShell/);
  assert.match(pageSource, /middleSlot=\{<TelegramChannelCTA/);
  assert.match(pageSource, /initialNews=\{initialNews\}/);
  assert.doesNotMatch(pageSource, /"use client"/);
}

function testNewsPageShellServer() {
  const shellSource = read("app/(public)/news/NewsPageShell.js");
  assert.doesNotMatch(shellSource, /"use client"/);
  assert.match(shellSource, /Breadcrumbs/);
  assert.match(shellSource, /NewsHubLinks/);
  assert.match(shellSource, /<h1 className="news-page-hero__title"/);
  assert.match(shellSource, /NewsHeroRefresh/);
}

function testNewsListClientSlimmed() {
  const clientSource = read("app/(public)/news/NewsListClient.js");
  assert.match(clientSource, /NewsListProvider/);
  assert.match(clientSource, /middleSlot/);
  assert.match(clientSource, /\{children\}/);
  assert.doesNotMatch(clientSource, /Breadcrumbs/);
  assert.doesNotMatch(clientSource, /NewsHubLinks/);
  assert.doesNotMatch(clientSource, /TelegramChannelCTA/);
  assert.doesNotMatch(clientSource, /news-page-hero__title/);
  assert.match(clientSource, /runNewsDeltaRefresh/);
  assert.match(clientSource, /fetchNewsDeltaPage/);
  assert.match(clientSource, /fetchFullNews/);
  assert.match(clientSource, /runBackgroundFill/);
  assert.match(clientSource, /offset: NEWS_SSR_INITIAL_SIZE/);
  assert.match(clientSource, /useVisibilityRefresh\(\(\) => runNewsDeltaRefresh\(\)/);
  assert.match(clientSource, /if \(deltaItems\.length === 0\)/);
}

function testNewsHubLinksServerFile() {
  const hubSource = read("app/components/news/NewsHubLinks.js");
  assert.doesNotMatch(hubSource, /"use client"/);
}

function testNewsCardMemoized() {
  const uiSource = read("app/components/news/NewsListUi.js");
  assert.match(uiSource, /memo\(function NewsCard/);
  assert.match(uiSource, /export const NewsCard = memo/);
}

function testNewsCoverImageUntouched() {
  const coverSource = read("app/components/news/NewsCoverImage.js");
  assert.match(coverSource, /"use client"/);
  assert.match(coverSource, /onError/);
  assert.match(coverSource, /useState\(false\)/);
}

function testMainAndH1Uniqueness() {
  const pageSource = read("app/(public)/news/page.js");
  const shellSource = read("app/(public)/news/NewsPageShell.js");
  const clientSource = read("app/(public)/news/NewsListClient.js");

  assert.equal((clientSource.match(/<main/g) || []).length, 1);
  assert.equal((shellSource.match(/<h1/g) || []).length, 1);
  assert.doesNotMatch(clientSource, /<h1/);
  assert.doesNotMatch(pageSource, /<main/);
}

function testTelegramServerSafe() {
  const telegramSource = read("app/components/news/TelegramChannelCTA.js");
  assert.doesNotMatch(telegramSource, /"use client"/);
  assert.match(telegramSource, /t\.me/);
}

function testHeroRefreshClientIsland() {
  const refreshSource = read("app/(public)/news/NewsHeroRefresh.js");
  assert.match(refreshSource, /"use client"/);
  assert.match(refreshSource, /useNewsListControls/);
  assert.match(refreshSource, /news-page-hero__refresh/);
}

function run() {
  testPageShellComposition();
  testNewsPageShellServer();
  testNewsListClientSlimmed();
  testNewsHubLinksServerFile();
  testNewsCardMemoized();
  testNewsCoverImageUntouched();
  testMainAndH1Uniqueness();
  testTelegramServerSafe();
  testHeroRefreshClientIsland();
  console.log("test-news-hydration-phase3c1: PASS");
}

run();
