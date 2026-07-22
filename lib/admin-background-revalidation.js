export const DEFAULT_BACKGROUND_REVALIDATION_MS = 60_000;

export function shouldRunBackgroundRevalidation(lastRunAtMs, nowMs = Date.now(), minIntervalMs = DEFAULT_BACKGROUND_REVALIDATION_MS) {
  if (!lastRunAtMs) return true;
  return nowMs - lastRunAtMs >= minIntervalMs;
}

export function createSingleFlightRunner() {
  let inFlight = false;

  return {
    isInFlight() {
      return inFlight;
    },
    async run(task) {
      if (inFlight) {
        return { skipped: true, reason: "in_flight" };
      }

      inFlight = true;
      try {
        const result = await task();
        return { skipped: false, result };
      } finally {
        inFlight = false;
      }
    },
  };
}

export function createBackgroundRevalidationController({
  minIntervalMs = DEFAULT_BACKGROUND_REVALIDATION_MS,
  now = Date.now,
} = {}) {
  let lastRunAtMs = 0;
  const singleFlight = createSingleFlightRunner();

  return {
    getLastRunAtMs() {
      return lastRunAtMs;
    },
    async revalidate(task) {
      const currentNow = now();
      if (!shouldRunBackgroundRevalidation(lastRunAtMs, currentNow, minIntervalMs)) {
        return { skipped: true, reason: "throttled" };
      }

      const runResult = await singleFlight.run(task);
      if (!runResult.skipped) {
        lastRunAtMs = currentNow;
      }

      return runResult;
    },
  };
}

/**
 * Simulates multiple refresh triggers (visibility/focus/token) hitting one shared gate.
 * Used by verification tests to prove refreshCount stays at 1.
 */
export async function simulateSharedBackgroundRefreshBurst({
  triggers = ["visibilitychange", "focus", "token_refreshed"],
  minIntervalMs = DEFAULT_BACKGROUND_REVALIDATION_MS,
  now = () => 1_000,
  taskDelayMs = 25,
} = {}) {
  const controller = createBackgroundRevalidationController({ minIntervalMs, now });
  let refreshCount = 0;

  const runRefresh = () =>
    controller.revalidate(async () => {
      refreshCount += 1;
      if (taskDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, taskDelayMs));
      }
    });

  await Promise.all(triggers.map(() => runRefresh()));

  return {
    refreshCount,
    triggerCount: triggers.length,
  };
}

/**
 * Mirrors useVisibilityRefresh + shared revalidation gate:
 * visibilitychange and focus both call the same runner in the same tick burst.
 */
export async function simulateVisibilityFocusRefreshBurst({
  minIntervalMs = DEFAULT_BACKGROUND_REVALIDATION_MS,
  now = () => 1_000,
  taskDelayMs = 25,
} = {}) {
  let refreshCount = 0;
  let inFlight = false;
  let lastRunAtMs = 0;
  const controller = createBackgroundRevalidationController({ minIntervalMs, now });

  const runHookRefresh = async () => {
    const currentNow = now();
    if (minIntervalMs > 0 && lastRunAtMs && currentNow - lastRunAtMs < minIntervalMs) {
      return;
    }
    if (inFlight) return;

    inFlight = true;
    lastRunAtMs = currentNow;
    try {
      await controller.revalidate(async () => {
        refreshCount += 1;
        if (taskDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, taskDelayMs));
        }
      });
    } finally {
      inFlight = false;
    }
  };

  await Promise.all([runHookRefresh(), runHookRefresh()]);

  return {
    refreshCount,
    triggerCount: 2,
  };
}
