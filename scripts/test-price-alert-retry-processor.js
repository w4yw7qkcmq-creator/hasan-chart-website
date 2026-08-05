#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const retry = require("../worker/lib/price-alert-retry-processor.js");

assert.ok(retry.computeNextAttemptAt(1));
assert.ok(retry.computeNextAttemptAt(3));

(async () => {
  const state = new Map();
  const supabase = {
    from(table) {
      assert.equal(table, "price_alert_delivery_attempts");
      return {
        select() {
          return {
            in() {
              return {
                or() {
                  return {
                    order() {
                      return {
                        limit: async () => ({
                          data: [
                            {
                              id: "a1",
                              alert_id: 10,
                              channel: "push",
                              status: "retryable_failed",
                              attempt_count: 1,
                              max_attempts: 5,
                            },
                          ],
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
    rpc(name, args) {
      if (name === "claim_price_alert_delivery_attempt") {
        return Promise.resolve({ data: { claimed: true, attemptId: args.p_attempt_id }, error: null });
      }
      if (name === "release_price_alert_delivery_attempt_claim") {
        return Promise.resolve({ data: { released: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  const result = await retry.processRetryableDeliveries(supabase, {
    deliverChannel: async () => ({ sent: true }),
    limit: 5,
  });

  assert.equal(result.ok, true);
  assert.equal(result.stats.retried, 1);
  console.log("price alert retry processor PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
