#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const newsToml = read("worker/railway.news.toml");
const newsWorker = read("worker/news-worker.js");
const priceToml = read("worker/railway.toml");

assert.match(newsToml, /npm run start:news/);
assert.match(newsToml, /healthcheckPath = "\/health"/);
assert.doesNotMatch(newsToml, /subscription-maintenance/);
assert.doesNotMatch(newsToml, /worker\/index\.js/);
assert.match(newsWorker, /worker\/news-worker\.js/);
assert.match(newsWorker, /news_worker_startup_validated/);
assert.doesNotMatch(priceToml, /start:news/);

console.log("news worker railway config guard PASS");
