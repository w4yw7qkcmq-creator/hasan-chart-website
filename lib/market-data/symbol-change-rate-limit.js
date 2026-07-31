import {
  SYMBOL_CHANGE_RATE_LIMIT,
  SYMBOL_CHANGE_RATE_WINDOW_MS,
} from "./dynamic-symbol-constants.js";

export const SYMBOL_CHANGE_RATE_LIMIT_MESSAGE =
  "تجاوزت الحد المسموح لتغيير العملة (10 تغييرات في الدقيقة). انتظر قليلًا ثم حاول مجددًا.";

export function createSymbolChangeRateLimiter({
  limit = SYMBOL_CHANGE_RATE_LIMIT,
  windowMs = SYMBOL_CHANGE_RATE_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  /** @type {Array<{ symbol: string; at: number }>} */
  const changes = [];

  function prune() {
    const cutoff = now() - windowMs;
    while (changes.length && changes[0].at <= cutoff) {
      changes.shift();
    }
  }

  function canChange(symbol) {
    const normalized = String(symbol || "").trim();
    if (!normalized) {
      return { allowed: false, duplicate: false, reason: "INVALID_SYMBOL" };
    }

    prune();

    if (changes.some((entry) => entry.symbol === normalized)) {
      return { allowed: true, duplicate: true };
    }

    if (changes.length >= limit) {
      return {
        allowed: false,
        duplicate: false,
        reason: "RATE_LIMIT",
        message: SYMBOL_CHANGE_RATE_LIMIT_MESSAGE,
      };
    }

    return { allowed: true, duplicate: false };
  }

  function recordChange(symbol) {
    const normalized = String(symbol || "").trim();
    if (!normalized) return;

    prune();
    if (changes.some((entry) => entry.symbol === normalized)) return;

    changes.push({ symbol: normalized, at: now() });
  }

  function getChangeCount() {
    prune();
    return changes.length;
  }

  function reset() {
    changes.length = 0;
  }

  return { canChange, recordChange, getChangeCount, reset };
}
