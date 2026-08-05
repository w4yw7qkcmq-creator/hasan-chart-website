#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPublishFingerprintBundle } = require("../worker/lib/telegram-news/semantic-fingerprints.js");
const { evaluateRssDuplicate } = require("../worker/lib/general-rss/dedup.js");

const candidate = {
  post: { sourceUrl: "https://example.com/a", rawText: "Fed raises rates" },
  facts: { title: "Fed raises rates", previous: "5.0%", forecast: "5.25%", actual: "5.25%" },
  formattedMessage: "🚨 Fed raises rates\n\nline\n\nline\n\nline\n\nline\n\nline",
  newsType: "economic",
};

const bundle = buildPublishFingerprintBundle(candidate);
assert.ok(bundle.composite);

const dup = evaluateRssDuplicate(
  { title: "Fed raises rates today", link: "https://example.com/a" },
  [{ normalizedTitle: "fed raises rates", link: "https://example.com/a" }]
);
assert.equal(dup.duplicate, true);
assert.equal(dup.reason, "same_source_link");

console.log("news worker dedupe PASS");
