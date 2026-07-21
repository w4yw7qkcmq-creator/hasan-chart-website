import assert from "node:assert/strict";
import {
  ADMIN_ACTIVITY_FEED_LIMIT,
  maskActivityActorLabel,
  mergeActivityFeedEvents,
} from "../lib/admin-activity-feed.js";

function testMaskActorLabel() {
  assert.equal(maskActivityActorLabel({ username: "Hasan" }), "Ha***");
  assert.equal(maskActivityActorLabel({ email: "user@example.com" }), "us***@example.com");
  assert.equal(maskActivityActorLabel({}), "مستخدم");
}

function testMergeActivityFeedEvents() {
  const merged = mergeActivityFeedEvents(
    [
      { id: "a:1", occurredAt: "2026-07-20T10:00:00.000Z" },
      { id: "b:2", occurredAt: "2026-07-21T10:00:00.000Z" },
      { id: "a:1", occurredAt: "2026-07-19T10:00:00.000Z" },
      { id: "c:3", occurredAt: "2026-07-18T10:00:00.000Z" },
    ],
    2
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "b:2");
  assert.equal(merged[1].id, "a:1");
}

function testMergeRespectsLimitTwenty() {
  const input = Array.from({ length: 30 }, (_, index) => ({
    id: `event:${index}`,
    occurredAt: new Date(Date.now() - index * 60000).toISOString(),
  }));

  const merged = mergeActivityFeedEvents(input, ADMIN_ACTIVITY_FEED_LIMIT);
  assert.equal(merged.length, ADMIN_ACTIVITY_FEED_LIMIT);
}

const tests = [
  ["mask actor label", testMaskActorLabel],
  ["merge and dedupe events", testMergeActivityFeedEvents],
  ["merge limit twenty", testMergeRespectsLimitTwenty],
];

let passed = 0;

for (const [name, runner] of tests) {
  runner();
  passed += 1;
  console.log(`✅ ${name}`);
}

console.log(`\n${passed}/${tests.length} admin activity feed tests passed`);
