#!/usr/bin/env node
/**
 * One-shot news pipeline diagnostic (dry run).
 * Fetches real sources, runs eligibility checks, no Telegram/DB writes.
 */

const path = require("path");

process.env.NEWS_DRY_RUN = "1";
process.env.NEWS_WORKER_NO_BOOT = "1";

process.chdir(path.join(__dirname, "..", "worker"));
require(path.join(__dirname, "..", "worker", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", ".env.local"),
});
require(path.join(__dirname, "..", "worker", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "worker", ".env"),
});

const { runNewsCycleDiagnostic } = require(path.join(__dirname, "..", "worker", "news-worker.js"));

runNewsCycleDiagnostic()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report?.eligible ? 0 : 2);
  })
  .catch((error) => {
    console.error("NEWS_DRY_RUN_FAILED", error.message);
    process.exit(1);
  });
