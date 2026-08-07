import assert from "node:assert/strict";
import {
  buildVipStatusEventDeliveryContract,
  syncVipStatusEventDeliverySummary,
} from "../lib/vip-status-event-summary-sync.js";

function deliveriesFixture() {
  return [
    { channel: "site", status: "pending" },
    { channel: "push", status: "pending" },
    { channel: "email", status: "pending" },
  ];
}

{
  const pending = buildVipStatusEventDeliveryContract(deliveriesFixture(), 1);
  assert.equal(pending.requested, 3);
  assert.equal(pending.pending, 3);
  assert.equal(pending.completed, false);
  assert.equal(pending.partialFailure, false);
}

{
  const rows = [
    { channel: "site", status: "delivered" },
    { channel: "push", status: "unavailable" },
    { channel: "email", status: "delivered" },
  ];
  const summary = buildVipStatusEventDeliveryContract(rows, 1);
  assert.equal(summary.delivered, 2);
  assert.equal(summary.unavailable, 1);
  assert.equal(summary.completed, true);
  assert.equal(summary.partialFailure, false);
  assert.equal(summary.channels.push.unavailable, 1);
}

{
  const rows = [
    { channel: "site", status: "delivered" },
    { channel: "push", status: "failed" },
    { channel: "email", status: "delivered" },
  ];
  const summary = buildVipStatusEventDeliveryContract(rows, 1);
  assert.equal(summary.partialFailure, true);
  assert.equal(summary.completed, true);
}

{
  const first = buildVipStatusEventDeliveryContract(
    [
      { channel: "site", status: "delivered" },
      { channel: "push", status: "delivered" },
      { channel: "email", status: "delivered" },
    ],
    1
  );
  const second = buildVipStatusEventDeliveryContract(
    [
      { channel: "site", status: "delivered" },
      { channel: "push", status: "delivered" },
      { channel: "email", status: "delivered" },
    ],
    1
  );
  assert.deepEqual(first, second);
}

{
  const rpcCalls = [];
  const supabase = {
    rpc(name, args) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ error: null });
    },
  };
  const result = await syncVipStatusEventDeliverySummary(supabase, {
    signalId: 42,
    eventType: "target_1_hit",
  });
  assert.equal(result.synced, true);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "sync_vip_status_event_delivery_summary");
}

console.log("test-vip-status-event-summary-sync: ok");
