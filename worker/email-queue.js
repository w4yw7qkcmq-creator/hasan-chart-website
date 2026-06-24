const MAX_EMAILS_PER_SECOND = 3;
const MIN_DELAY_MS = 350;
const RATE_LIMIT_RETRY_WAIT_MS = 10000;
const MAX_RETRIES = 3;

const { logWorkerEvent } = require("./alert-logger");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(result) {
  if (!result) return false;

  if (result.status === 429) {
    return true;
  }

  const errorText = String(result.error || "").toLowerCase();
  const resultName = String(result.result?.name || "").toLowerCase();
  const resultMessage = String(result.result?.message || "").toLowerCase();

  return (
    errorText.includes("rate_limit") ||
    errorText.includes("429") ||
    resultName.includes("rate_limit") ||
    resultMessage.includes("rate_limit") ||
    resultMessage.includes("429")
  );
}

class EmailRateLimiter {
  constructor(maxPerSecond = MAX_EMAILS_PER_SECOND, minDelayMs = MIN_DELAY_MS) {
    this.maxPerSecond = maxPerSecond;
    this.minDelayMs = minDelayMs;
    this.sentTimestamps = [];
    this.lastSendAt = 0;
  }

  async waitForSlot() {
    const now = Date.now();
    this.sentTimestamps = this.sentTimestamps.filter(
      (timestamp) => now - timestamp < 1000
    );

    if (this.sentTimestamps.length >= this.maxPerSecond) {
      const oldestTimestamp = this.sentTimestamps[0];
      const waitMs = 1000 - (now - oldestTimestamp);

      if (waitMs > 0) {
        await sleep(waitMs);
      }
    }

    const elapsedSinceLastSend = Date.now() - this.lastSendAt;

    if (this.lastSendAt > 0 && elapsedSinceLastSend < this.minDelayMs) {
      await sleep(this.minDelayMs - elapsedSinceLastSend);
    }
  }

  markSent() {
    const now = Date.now();
    this.sentTimestamps.push(now);
    this.lastSendAt = now;
  }
}

async function sendWithRetry(sendFn, { to, label, attempt = 0 }) {
  const result = await sendFn();

  if (result?.skipped) {
    return { status: "skipped", result };
  }

  if (result?.success !== false) {
    console.log("EMAIL_SEND_SUCCESS", {
      to,
      label,
      attempt,
      id: result?.id || null,
    });

    logWorkerEvent("EMAIL_SEND_SUCCESS", {
      to,
      label,
      attempt,
      id: result?.id || null,
    });

    return { status: "sent", result };
  }

  if (isRateLimitError(result) && attempt < MAX_RETRIES) {
    const nextAttempt = attempt + 1;

    logWorkerEvent("EMAIL_SEND_RETRY", {
      to,
      label,
      attempt: nextAttempt,
      maxRetries: MAX_RETRIES,
      waitMs: RATE_LIMIT_RETRY_WAIT_MS,
      status: result.status || 429,
      error: result.error || "rate_limit_exceeded",
    });

    await sleep(RATE_LIMIT_RETRY_WAIT_MS);

    return sendWithRetry(sendFn, { to, label, attempt: nextAttempt });
  }

  logWorkerEvent("EMAIL_SEND_FAILED", {
    to,
    label,
    attempt,
    status: result?.status || null,
    error: result?.error || "Email send failed",
  });

  return {
    status: "failed",
    error: result?.error || "Email send failed",
    result,
  };
}

async function processEmailQueue(items, options = {}) {
  const queueItems = Array.isArray(items) ? items : [];
  const label = options.label || "bulk-email";
  const limiter = new EmailRateLimiter(
    options.maxPerSecond || MAX_EMAILS_PER_SECOND,
    options.minDelayMs || MIN_DELAY_MS
  );

  const stats = {
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
    failedEmails: [],
  };

  logWorkerEvent("EMAIL_QUEUE_STARTED", {
    label,
    worker: options.worker || "worker/email-queue.js",
    total: queueItems.length,
    maxPerSecond: limiter.maxPerSecond,
    minDelayMs: limiter.minDelayMs,
  });

  for (const item of queueItems) {
    const to = String(item?.to || "").trim().toLowerCase();

    if (!to || typeof item?.send !== "function") {
      stats.skippedCount += 1;
      continue;
    }

    await limiter.waitForSlot();

    if (label === "price-alerts" || label === "price-alerts-real-path") {
      console.log("REAL_PRICE_ALERT_EMAIL_SENDER_FOUND", {
        file: "worker/email-queue.js",
        function: "processEmailQueue",
        label,
        to,
        alertId: item?.alertId || null,
      });
    }

    const outcome = await sendWithRetry(item.send, { to, label });

    limiter.markSent();

    if (outcome.status === "sent") {
      stats.sentCount += 1;
      continue;
    }

    if (outcome.status === "skipped") {
      stats.skippedCount += 1;
      continue;
    }

    stats.failedCount += 1;
    stats.failedEmails.push({
      email: to,
      error: outcome.error || "Email send failed",
    });
  }

  logWorkerEvent("EMAIL_QUEUE_FINISHED", {
    label,
    worker: options.worker || "worker/email-queue.js",
    ...stats,
  });

  return stats;
}

module.exports = {
  processEmailQueue,
};
