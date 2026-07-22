import assert from "node:assert/strict";
import {
  simulateSharedBackgroundRefreshBurst,
  simulateVisibilityFocusRefreshBurst,
} from "../lib/admin-background-revalidation.js";

async function testTripleTriggerSharedGate() {
  const result = await simulateSharedBackgroundRefreshBurst({
    triggers: ["visibilitychange", "focus", "token_refreshed"],
    minIntervalMs: 60_000,
    taskDelayMs: 30,
  });

  console.log(
    `[verify] shared gate burst: triggers=${result.triggerCount}, refreshCount=${result.refreshCount}`
  );
  assert.equal(result.triggerCount, 3);
  assert.equal(result.refreshCount, 1, "expected exactly one refresh for triple trigger burst");
}

async function testVisibilityAndFocusSharedGate() {
  const result = await simulateVisibilityFocusRefreshBurst({
    minIntervalMs: 60_000,
    taskDelayMs: 30,
  });

  console.log(
    `[verify] visibility+focus burst: triggers=${result.triggerCount}, refreshCount=${result.refreshCount}`
  );
  assert.equal(result.triggerCount, 2);
  assert.equal(result.refreshCount, 1, "expected exactly one refresh for visibility+focus burst");
}

await testTripleTriggerSharedGate();
console.log("✓ triple trigger (visibility + focus + token) => refreshCount = 1");

await testVisibilityAndFocusSharedGate();
console.log("✓ visibility + focus => refreshCount = 1");

console.log("\n2/2 admin background refresh verification checks passed");
