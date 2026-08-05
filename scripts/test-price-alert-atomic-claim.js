#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { claimActivePriceAlert } = require("../worker/lib/price-alert-atomic-claim.js");

function createMockSupabase({ claimResult }) {
  return {
    from(table) {
      assert.equal(table, "price_alerts");
      return {
        update(payload) {
          assert.equal(payload.status, "triggered");
          return {
            eq(col, val) {
              assert.equal(col, "id");
              return {
                eq(statusCol, statusVal) {
                  assert.equal(statusCol, "status");
                  assert.equal(statusVal, "active");
                  return {
                    select() {
                      return {
                        maybeSingle: async () => claimResult,
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
  const success = await claimActivePriceAlert(createMockSupabase({ claimResult: { data: { id: 1 }, error: null } }), {
    alertId: 1,
    triggeredPrice: 100,
  });
  assert.equal(success.claimed, true);

  const duplicate = await claimActivePriceAlert(createMockSupabase({ claimResult: { data: null, error: null } }), {
    alertId: 2,
    triggeredPrice: 100,
  });
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.duplicate, true);

  console.log("price alert atomic claim PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
