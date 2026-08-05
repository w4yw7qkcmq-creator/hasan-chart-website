#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fetchOkxTicker, DEFAULT_MAX_PRICE_AGE_MS } = require("../worker/lib/price-alert-market-price.js");

const originalFetch = global.fetch;
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: [{ last: "100", ts: String(Date.now() - DEFAULT_MAX_PRICE_AGE_MS - 1000) }],
  }),
});

(async () => {
  const stale = await fetchOkxTicker("BTCUSDT");
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "stale_price");

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ last: "100", ts: String(Date.now()) }] }),
  });
  const fresh = await fetchOkxTicker("BTCUSDT");
  assert.equal(fresh.ok, true);
  assert.equal(fresh.price, 100);

  global.fetch = originalFetch;
  console.log("price alert price freshness PASS");
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exit(1);
});
