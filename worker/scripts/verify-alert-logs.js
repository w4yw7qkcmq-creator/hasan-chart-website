const { logWorkerEvent } = require("../alert-logger");

const tags = [
  "WORKER_BOOT",
  "ALERT_CHECK_STARTED",
  "ALERT_TRIGGERED",
  "ALERT_NOTIFICATION_CREATED",
  "ALERT_EMAIL_QUEUED",
  "ALERT_EMAIL_SEND_START",
  "ALERT_EMAIL_SENT",
  "EMAIL_QUEUE_STARTED",
  "EMAIL_QUEUE_FINISHED",
  "ALERT_CHECK_FINISHED",
];

console.log("=== verify-alert-logs: sample output ===");

for (const tag of tags) {
  logWorkerEvent(tag, {
    worker: "worker/index.js",
    sample: true,
    alertId: "sample-alert-id",
    email: "user@example.com",
    coin: "BTC-USDT",
    targetPrice: 65000,
    currentPrice: 65012.45,
  });
}

console.log("=== verify-alert-logs: done ===");
