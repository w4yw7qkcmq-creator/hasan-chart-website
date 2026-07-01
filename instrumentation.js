export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMarketStream } = await import("./lib/okx-market-stream.js");
    startMarketStream("instrumentation-register");
  }

  // Price alert emails: worker/index.js (PATH_A) or /api/check-price-alerts cron (PATH_B).
  console.log("REAL_PRICE_ALERT_EMAIL_SENDER_FOUND", {
    file: "instrumentation.js",
    function: "register",
    action: "nextjs_price_alerts_via_cron_or_worker",
    paths: {
      A: "worker/index.js::sendAlertEmailOnly",
      B: "lib/price-alerts-runner.js::sendTriggeredAlertEmail",
      C: "lib/email-queue.js::processEmailQueue",
    },
    note: "Search Railway/Vercel logs for PRICE_ALERT_EMAIL_PATH_A/B/C",
  });
}
