export function scheduleAfterPaint(callback, delayMs = 1500) {
  if (typeof window === "undefined") {
    return () => {};
  }

  let cancelled = false;

  const run = () => {
    if (!cancelled) {
      callback();
    }
  };

  let idleId = null;
  let timerId = null;

  if (typeof window.requestIdleCallback === "function") {
    idleId = window.requestIdleCallback(run, { timeout: delayMs });
  } else {
    timerId = window.setTimeout(run, delayMs);
  }

  return () => {
    cancelled = true;

    if (idleId !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleId);
    }

    if (timerId !== null) {
      window.clearTimeout(timerId);
    }
  };
}
