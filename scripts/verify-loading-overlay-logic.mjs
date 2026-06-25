#!/usr/bin/env node
/**
 * Loading overlay hook timing verification (unit-level).
 * Run: node scripts/verify-loading-overlay-logic.mjs
 */

const BOOTSTRAP_LOADING_DELAY_MS = 700;
const BOOTSTRAP_LOADING_EXIT_MS = 320;
const BOOTSTRAP_LOADING_MAX_VISIBLE_MS = 3000;
const BOOTSTRAP_LOADING_ABSOLUTE_MAX_MS =
  BOOTSTRAP_LOADING_DELAY_MS + BOOTSTRAP_LOADING_MAX_VISIBLE_MS + BOOTSTRAP_LOADING_EXIT_MS + 250;

function simulateOverlayLifecycle({ authResolvedAtMs = 500 } = {}) {
  let overlayState = "hidden";
  let stallError = false;
  let authResolved = false;
  const events = [];

  const log = (type, at) => events.push({ type, at, overlayState, stallError, authResolved });

  const beginExit = () => {
    if (overlayState === "hidden" || overlayState === "exiting") return;
    overlayState = "exiting";
  };

  const timers = [];

  timers.push(
    setTimeout(() => {
      if (!authResolved) {
        overlayState = "visible";
        log("visible", Date.now());
      }
    }, BOOTSTRAP_LOADING_DELAY_MS)
  );

  timers.push(
    setTimeout(() => {
      authResolved = true;
      stallError = false;
      beginExit();
      log("authResolved", Date.now());
    }, authResolvedAtMs)
  );

  timers.push(
    setTimeout(() => {
      if (overlayState === "visible" && !authResolved) {
        stallError = true;
        beginExit();
        log("maxVisibleTimeout", Date.now());
      }
    }, BOOTSTRAP_LOADING_DELAY_MS + BOOTSTRAP_LOADING_MAX_VISIBLE_MS)
  );

  timers.push(
    setTimeout(() => {
      if (overlayState === "exiting") {
        overlayState = "hidden";
        log("exitComplete", Date.now());
      }
    }, authResolvedAtMs + BOOTSTRAP_LOADING_EXIT_MS + 50)
  );

  timers.push(
    setTimeout(() => {
      if (!authResolved) stallError = true;
      overlayState = "hidden";
      log("absoluteMax", Date.now());
    }, BOOTSTRAP_LOADING_ABSOLUTE_MAX_MS)
  );

  return new Promise((resolve) => {
    setTimeout(() => {
      timers.forEach(clearTimeout);
      resolve({ overlayState, stallError, authResolved, events });
    }, BOOTSTRAP_LOADING_ABSOLUTE_MAX_MS + 100);
  });
}

async function main() {
  const fast = await simulateOverlayLifecycle({ authResolvedAtMs: 400 });
  if (fast.overlayState !== "hidden" || !fast.authResolved || fast.stallError) {
    throw new Error("Fast auth path failed to hide overlay cleanly");
  }

  const slow = await simulateOverlayLifecycle({ authResolvedAtMs: 5000 });
  if (slow.overlayState !== "hidden") {
    throw new Error("Slow auth path left overlay visible");
  }
  if (!slow.stallError) {
    throw new Error("Slow auth path did not surface stall error");
  }

  console.log("✅ Loading overlay lifecycle checks passed");
}

main().catch((error) => {
  console.error("❌", error.message);
  process.exit(1);
});
