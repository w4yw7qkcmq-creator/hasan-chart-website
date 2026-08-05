#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { detectPostPublishAction, snapshotFacts } = require("../worker/lib/telegram-news/post-publish.js");
const { processPendingEntry } = require("../worker/lib/economic-releases/pending-queue.js");

const published = snapshotFacts({ previous: "1%", forecast: "2%", actual: "2%" }, "key-1");
const duplicate = detectPostPublishAction(published, { previous: "1%", forecast: "2%", actual: "2%" });
assert.equal(duplicate.action, "duplicate_skip");

const update = detectPostPublishAction(published, { previous: "1%", forecast: "2%", actual: "3%" });
assert.equal(update.isUpdate, true);

(async () => {
  const result = await processPendingEntry(
    {
      title: "Test",
      link: "https://example.com",
      canonical: { requiresTripleTemplate: true, arabicName: "Test", eventType: "structured_release" },
      attempt: 0,
    },
    {
      resolveRelease: async () => ({ merged: null }),
    }
  );
  assert.equal(result.action, "retry");
  console.log("news worker publish idempotency PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
