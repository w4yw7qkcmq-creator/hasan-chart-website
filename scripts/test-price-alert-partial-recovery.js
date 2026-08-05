#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const delivery = require("../worker/lib/price-alert-delivery-state.js");

function createStore() {
  const rows = new Map();
  return {
    rows,
    client: {
      from(table) {
        assert.equal(table, "price_alert_delivery_attempts");
        return {
          select() {
            return {
              eq(_c1, alertId) {
                return {
                  eq(_c2, channel) {
                    return {
                      maybeSingle: async () => {
                        const key = `${alertId}:${channel}`;
                        const data = rows.get(key) || null;
                        return { data, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          insert(row) {
            const key = `${row.alert_id}:${row.channel}`;
            rows.set(key, { id: "1", ...row, attempt_count: 1 });
            return {
              select() {
                return {
                  maybeSingle: async () => ({ data: rows.get(key), error: null }),
                };
              },
            };
          },
          update(payload) {
            return {
              eq(_c1, alertId) {
                return {
                  eq(_c2, channel) {
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
      },
    },
  };
}

(async () => {
  const store = createStore();
  const site = await delivery.beginChannelDelivery(store.client, { alertId: 9, channel: "site" });
  assert.equal(site.proceed, true);
  await delivery.finalizeChannelDelivery(store.client, { alertId: 9, channel: "site", status: "sent" });

  const siteRetry = await delivery.beginChannelDelivery(store.client, { alertId: 9, channel: "site" });
  assert.equal(siteRetry.proceed, false);
  assert.equal(siteRetry.reason, "already_sent");

  const pushRetry = await delivery.beginChannelDelivery(store.client, { alertId: 9, channel: "push" });
  assert.equal(pushRetry.proceed, true);

  console.log("price alert partial recovery PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
