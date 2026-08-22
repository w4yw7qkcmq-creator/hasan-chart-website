#!/usr/bin/env node
/**
 * Phase E2.1 — Email campaign integration tests (mocked DB + provider).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  shouldApplyDeliveryStatus,
  mapWebhookEventToDeliveryStatus,
  syncCampaignRecipientFromWebhook,
  syncCampaignRecipientFromOutbox,
  maybeMarkCampaignEnqueueCompleted,
} from "../lib/email-campaign/delivery-sync.js";
import { normalizeAudienceFilter } from "../lib/email-campaign/audience.js";
import { CAMPAIGN_AUDIENCE_TYPES, buildCampaignOutboxIdempotencyKey } from "../lib/email-campaign/constants.js";

process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-unsubscribe-secret-32chars-min";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

function createCampaignMock(initial = {}) {
  const campaigns = new Map();
  const recipients = new Map();

  const campaignId = initial.campaignId || randomUUID();
  campaigns.set(campaignId, {
    id: campaignId,
    status: "sending",
    eligible_count: 1,
    queued_count: 0,
    provider_accepted_count: 0,
    delivered_count: 0,
    failed_count: 0,
    bounced_count: 0,
    complained_count: 0,
    unsubscribed_count: 0,
    ...initial.campaign,
  });

  if (initial.recipient) {
    const rid = initial.recipient.id || randomUUID();
    recipients.set(rid, {
      id: rid,
      campaign_id: campaignId,
      delivery_status: "outbox_pending",
      eligibility_status: "eligible",
      outbox_id: initial.recipient.outbox_id || randomUUID(),
      resend_id: null,
      ...initial.recipient,
    });
  }

  function buildQuery(table, state = {}) {
    const api = {
      _state: { ...state, table },
      select(_cols, opts) {
        api._state.select = { cols: _cols, opts };
        return api;
      },
      eq(col, val) {
        api._state.filters = [...(api._state.filters || []), { col, val, op: "eq" }];
        return api;
      },
      in(col, vals) {
        api._state.filters = [...(api._state.filters || []), { col, vals, op: "in" }];
        return api;
      },
      update(patch) {
        api._state.patch = patch;
        return api;
      },
      insert() {
        return Promise.resolve({ error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: api._execSingle(), error: null });
      },
      then(resolve) {
        resolve({ data: api._execMany(), count: api._execCount(), error: null });
      },
      _match(row) {
        return (api._state.filters || []).every((f) => {
          if (f.op === "eq") return row[f.col] === f.val;
          if (f.op === "in") return f.vals.includes(row[f.col]);
          return true;
        });
      },
      _execSingle() {
        if (table === "email_campaign_recipients") {
          if (api._state.patch) {
            const target = [...recipients.values()].find((r) => api._match(r));
            if (target) Object.assign(target, api._state.patch);
            return target ? { id: target.id, campaign_id: target.campaign_id, delivery_status: target.delivery_status } : null;
          }
          return [...recipients.values()].find((r) => api._match(r)) || null;
        }
        if (table === "email_campaigns") {
          if (api._state.patch) {
            const c = [...campaigns.values()].find((row) => api._match(row));
            if (c) Object.assign(c, api._state.patch);
            return c || null;
          }
          return [...campaigns.values()].find((row) => api._match(row)) || null;
        }
        return null;
      },
      _execMany() {
        if (table === "email_campaign_recipients") {
          return [...recipients.values()].filter((r) => api._match(r));
        }
        return null;
      },
      _execCount() {
        if (table === "email_campaign_recipients" && api._state.select?.opts?.head) {
          return [...recipients.values()].filter((r) => api._match(r)).length;
        }
        return undefined;
      },
    };
    return api;
  }

  const supabase = {
    from(table) {
      return buildQuery(table);
    },
  };

  return { supabase, campaigns, recipients, campaignId };
}

test("delivery status monotonic advance", () => {
  assert.equal(shouldApplyDeliveryStatus("sent", "delivered"), true);
  assert.equal(shouldApplyDeliveryStatus("delivered", "sent"), false);
  assert.equal(shouldApplyDeliveryStatus("failed", "delivered"), false);
  assert.equal(shouldApplyDeliveryStatus("cancelled", "sent"), false);
});

test("webhook maps delivery events", () => {
  assert.equal(mapWebhookEventToDeliveryStatus("email.delivered"), "delivered");
  assert.equal(mapWebhookEventToDeliveryStatus("email.bounced"), "bounced");
});

test("selected users dedupe", () => {
  const f = normalizeAudienceFilter(CAMPAIGN_AUDIENCE_TYPES.SELECTED_USERS, {
    userIds: ["u1", "u1", "u2"],
  });
  assert.deepEqual(f.userIds, ["u1", "u2"]);
});

test("deterministic outbox idempotency", () => {
  const k1 = buildCampaignOutboxIdempotencyKey("c1", "r1");
  const k2 = buildCampaignOutboxIdempotencyKey("c1", "r1");
  assert.equal(k1, k2);
});

await testAsync("webhook sync updates campaign recipient delivered", async () => {
  const outboxId = randomUUID();
  const resendId = "re_test_delivered";
  const { supabase, recipients } = createCampaignMock({
    recipient: { outbox_id: outboxId, delivery_status: "sent", resend_id: resendId },
  });
  const recipientId = [...recipients.keys()][0];

  const result = await syncCampaignRecipientFromWebhook(supabase, {
    outboxId,
    resendId,
    eventType: "email.delivered",
    eventAt: new Date().toISOString(),
  });

  assert.equal(result.updated, true);
  assert.equal(recipients.get(recipientId).delivery_status, "delivered");
});

await testAsync("webhook repeated delivered is idempotent", async () => {
  const outboxId = randomUUID();
  const resendId = "re_repeat";
  const { supabase, recipients } = createCampaignMock({
    recipient: { outbox_id: outboxId, delivery_status: "delivered", resend_id: resendId },
  });

  const result = await syncCampaignRecipientFromWebhook(supabase, {
    outboxId,
    resendId,
    eventType: "email.delivered",
  });
  assert.equal(result.updated, true);
});

await testAsync("outbox provider accepted syncs campaign recipient", async () => {
  const outboxId = randomUUID();
  const { supabase, recipients } = createCampaignMock({
    recipient: { outbox_id: outboxId, delivery_status: "outbox_pending" },
  });
  const recipientId = [...recipients.keys()][0];

  const result = await syncCampaignRecipientFromOutbox(
    supabase,
    {
      id: outboxId,
      message_type: "email_campaign",
      metadata: { campaign_recipient_id: recipientId },
    },
    { outcome: "provider_accepted", resendId: "re_accept" }
  );

  assert.equal(result.updated, true);
  assert.equal(recipients.get(recipientId).delivery_status, "provider_accepted");
  assert.equal(recipients.get(recipientId).resend_id, "re_accept");
});

await testAsync("campaign completes when no queued recipients remain", async () => {
  const { supabase, campaigns, campaignId, recipients } = createCampaignMock({
    campaign: { status: "sending" },
    recipient: { delivery_status: "outbox_pending" },
  });
  const rid = [...recipients.keys()][0];
  recipients.get(rid).delivery_status = "provider_accepted";

  const result = await maybeMarkCampaignEnqueueCompleted(supabase, campaignId);
  assert.equal(result.updated, true);
  assert.equal(campaigns.get(campaignId).status, "completed");
  assert.ok(campaigns.get(campaignId).enqueue_completed_at);
});

await testAsync("priority claim prefers transactional over marketing backlog", async () => {
  const rows = new Map([
    ["m1", { id: "m1", status: "pending", priority: 10, scheduled_at: new Date(Date.now() - 60000).toISOString(), attempts: 0, max_attempts: 5 }],
    ["t1", { id: "t1", status: "pending", priority: 0, scheduled_at: new Date().toISOString(), attempts: 0, max_attempts: 5 }],
  ]);

  const supabase = {
    rpc(name, params = {}) {
      if (name === "claim_email_outbox_batch") {
        const eligible = [...rows.values()]
          .filter((row) => row.status === "pending")
          .sort((a, b) => (a.priority - b.priority) || (new Date(a.scheduled_at) - new Date(b.scheduled_at)))
          .slice(0, params.p_limit || 1)
          .map((row) => {
            row.status = "processing";
            return { ...row };
          });
        return Promise.resolve({ data: eligible, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };

  const { claimPendingEmailBatch } = await import("../lib/email-outbox-processor.js");
  const claimed = await claimPendingEmailBatch(supabase, { limit: 1 });
  assert.equal(claimed[0].id, "t1");
});

await testAsync("recordResendWebhookEvent triggers campaign sync path", async () => {
  const outboxId = randomUUID();
  const resendId = "re_webhook_path";
  const { supabase, recipients } = createCampaignMock({
    recipient: { outbox_id: outboxId, delivery_status: "sent", resend_id: resendId },
  });
  const recipientId = [...recipients.keys()][0];

  const direct = await syncCampaignRecipientFromWebhook(supabase, {
    outboxId,
    resendId,
    eventType: "email.delivered",
  });
  assert.equal(direct.updated, true);
  assert.equal(recipients.get(recipientId).delivery_status, "delivered");
});

if (process.exitCode) {
  console.error("\nSome E2.1 integration tests failed.");
  process.exit(process.exitCode);
}

console.log("\nAll Phase E2.1 integration tests passed.");
