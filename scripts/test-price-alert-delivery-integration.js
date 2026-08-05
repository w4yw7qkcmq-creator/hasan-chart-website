#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { beginChannelDelivery, finalizeChannelDelivery } = require("../worker/lib/price-alert-delivery-state.js");
const { evaluatePriceAlertCondition } = require("../worker/lib/price-alert-condition.js");
const { claimActivePriceAlert } = require("../worker/lib/price-alert-atomic-claim.js");

assert.equal(
  evaluatePriceAlertCondition({ condition: "above", targetPrice: 100, currentPrice: 101 }).triggered,
  true
);

function createStore() {
  const rows = new Map();
  return {
    client: {
      from(table) {
        if (table === "price_alert_delivery_attempts") {
          return {
            select() {
              return {
                eq(_a, alertId) {
                  return {
                    eq(_b, channel) {
                      return {
                        maybeSingle: async () => ({
                          data: rows.get(`${alertId}:${channel}`) || null,
                          error: null,
                        }),
                      };
                    },
                  };
                },
              };
            },
            insert(row) {
              rows.set(`${row.alert_id}:${row.channel}`, { id: "1", ...row, attempt_count: 1 });
              return {
                select() {
                  return {
                    maybeSingle: async () => ({ data: rows.get(`${row.alert_id}:${row.channel}`), error: null }),
                  };
                },
              };
            },
            update(payload) {
              return {
                eq(_a, alertId) {
                  return {
                    eq(_b, channel) {
                      return {
                        select() {
                          return {
                            maybeSingle: async () => {
                              const key = `${alertId}:${channel}`;
                              const existing = rows.get(key);
                              if (!existing) return { data: null, error: null };
                              const next = { ...existing, ...payload };
                              rows.set(key, next);
                              return { data: next, error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "price_alerts") {
          return {
            update() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        select() {
                          return { maybeSingle: async () => ({ data: { id: 42 }, error: null }) };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        return {};
      },
    },
    rows,
  };
}

(async () => {
  const store = createStore();
  const claim = await claimActivePriceAlert(store.client, { alertId: 42, triggeredPrice: 101 });
  assert.equal(claim.claimed, true);

  const site = await beginChannelDelivery(store.client, { alertId: 42, channel: "site" });
  assert.equal(site.proceed, true);
  await finalizeChannelDelivery(store.client, { alertId: 42, channel: "site", status: "sent" });

  const push = await beginChannelDelivery(store.client, { alertId: 42, channel: "push" });
  assert.equal(push.proceed, true);
  await finalizeChannelDelivery(store.client, {
    alertId: 42,
    channel: "push",
    status: "failed",
    errorCodeSafe: "PUSH_FAIL",
    attemptCount: 1,
  });

  const siteAgain = await beginChannelDelivery(store.client, { alertId: 42, channel: "site" });
  assert.equal(siteAgain.proceed, false);
  assert.equal(siteAgain.reason, "already_sent");

  console.log("price alert delivery integration PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
