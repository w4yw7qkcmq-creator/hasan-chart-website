#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  summarizeHistoricalClassifications,
  CLASSIFICATION,
} = require("../worker/lib/news-historical-classifier.js");

const context = {
  postsByLink: new Map(),
  postsByCluster: new Map([["hormuz_iran_us", { source_link: "https://www.cnbc.com/a.html" }]]),
  postsByNormalizedTitle: [{ source_link: "https://www.cnbc.com/b.html", normalized_title: "gold rises sharply today" }],
  firstPostAt: "2026-05-30T12:19:45.637+00:00",
};

const rows = [
  {
    link: "scheduled-alert:us-market-open-5m-2026-08-05",
    title: "alert",
    published_at: "2026-08-05T13:25:38Z",
    _context: context,
  },
  {
    link: "https://www.cnbc.com/2026/08/05/oil-prices.html",
    title: "Oil prices fall on negotiations to manage ship traffic in Strait of Hormuz with enough content length",
    topic_cluster: "hormuz_iran_us",
    published_at: "2026-08-05T18:24:51Z",
    _context: context,
  },
  {
    link: "https://www.cnbc.com/2026/05/26/legacy.html",
    title: "Legacy article before site integration with sufficient content for classification testing",
    published_at: "2026-05-26T20:43:08Z",
    _context: context,
  },
];

const report = summarizeHistoricalClassifications(rows);
assert.equal(report.unknownCount, 0);
assert.equal(report.genuinelyMissing.length, 0);
assert.equal(report.summary[CLASSIFICATION.DEDUPE_MARKER].count, 1);
assert.equal(report.summary[CLASSIFICATION.LEGACY_PRE_SITE_INTEGRATION].count, 1);

console.log("news worker historical classifier UNKNOWN=0 PASS");
