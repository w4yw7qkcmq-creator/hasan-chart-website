export async function register() {
  // Price alert emails run from worker/index.js (separate Railway worker service).
  // Next.js path disabled here to avoid duplicate emails.
  console.log("REAL_PRICE_ALERT_EMAIL_SENDER_FOUND", {
    file: "instrumentation.js",
    function: "register",
    action: "nextjs_price_alerts_disabled",
    note: "Use worker/index.js Railway service for price alert emails and push",
  });
}
