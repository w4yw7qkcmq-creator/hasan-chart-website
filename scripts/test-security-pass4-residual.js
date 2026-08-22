#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentSecurityPolicy } from "../lib/security-headers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const policy = buildContentSecurityPolicy();

assert.doesNotMatch(policy, /unsafe-eval/, "unsafe-eval must be removed from production CSP");
assert.match(policy, /unsafe-inline/, "unsafe-inline retained for theme boot + TradingView");
assert.doesNotMatch(policy, /api\.openai\.com/, "OpenAI must not be in browser connect-src");
assert.doesNotMatch(policy, /api\.resend\.com/, "Resend must not be in browser connect-src");
assert.match(policy, /challenges\.cloudflare\.com/, "Turnstile must remain allowed");
assert.match(policy, /tradingview\.com/, "TradingView must remain allowed");

const protectedRoutes = [
  "app/api/partner/withdraw/route.js",
  "app/api/push/subscribe/route.js",
  "app/api/push/unsubscribe/route.js",
  "app/api/subscription-request/route.js",
  "app/api/subscription-request/finalize/route.js",
  "app/api/account-management/route.js",
  "app/api/alerts/route.js",
  "app/api/alerts/[id]/route.js",
];

for (const rel of protectedRoutes) {
  const source = fs.readFileSync(path.join(root, rel), "utf8");
  assert.match(
    source,
    /rejectCrossOriginBrowserRequest/,
    `${rel} must enforce browser same-origin`
  );
}

const edgeFunctions = [
  "supabase/functions/check-price-alerts/index.ts",
  "supabase/functions/send-price-alert/index.ts",
  "supabase/functions/send-price-alert-email/index.ts",
  "supabase/functions/price-alert-email/index.ts",
  "supabase/functions/send-analysis-email/index.ts",
];

for (const rel of edgeFunctions) {
  const source = fs.readFileSync(path.join(root, rel), "utf8");
  assert.doesNotMatch(source, /Access-Control-Allow-Origin/, `${rel} must not expose wildcard CORS`);
  assert.match(source, /respondLegacyEdgeDisabled/, `${rel} must use legacy disabled response`);
}

console.log("security pass4 residual tests passed");
