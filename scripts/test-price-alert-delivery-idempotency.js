#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const delivery = require("../worker/lib/price-alert-delivery-state.js");

function createMockSupabase(state) {
  return {
    from(table) {
      assert.equal(table, "price_alert_delivery_attempts");
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: state.existing, error: null }),
                  };
                },
              };
            },
          };
        },
        insert(row) {
          state.inserts.push(row);
          return {
            select() {
              return {
                maybeSingle: async () => ({
                  data: { id: "new", ...row, attempt_count: 1 },
                  error: null,
                }),
              };
            },
          };
        },
        update(payload) {
          state.updates.push(payload);
          return {
            eq() {
              return {
                neq() {
                  return {
                    select() {
                      return {
                        maybeSingle: async () => ({
                          data: { id: "upd", status: payload.status, attempt_count: 2 },
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
      };
    },
  };
}

(async () => {
  const state = { existing: null, inserts: [], updates: [] };
  const supabase = createMockSupabase(state);
  const begin = await delivery.beginChannelDelivery(supabase, { alertId: 42, channel: "site" });
  assert.equal(begin.proceed, true);
  assert.equal(begin.idempotencyKey, "price_alert:42:site");

  const sentState = {
    existing: {
      id: "x",
      alert_id: 42,
      channel: "site",
      status: "sent",
      attempt_count: 1,
      idempotency_key: "price_alert:42:site",
    },
    inserts: [],
    updates: [],
  };
  const skip = await delivery.beginChannelDelivery(createMockSupabase(sentState), {
    alertId: 42,
    channel: "site",
  });
  assert.equal(skip.proceed, false);
  assert.equal(skip.reason, "already_sent");

  console.log("price alert delivery idempotency PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
