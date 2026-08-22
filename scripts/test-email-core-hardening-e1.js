#!/usr/bin/env node

/**
 * Phase E1 — Email core hardening tests (mocks only, no real Resend).
 * Usage: node scripts/test-email-core-hardening-e1.js
 */

import { randomUUID } from "crypto";
import {
  buildOutboxResendTags,
  buildProviderIdempotencyKey,
  processSingleOutboxEmail,
  claimPendingEmailBatch,
  releaseStaleProcessingEmails,
} from "../lib/email-outbox-processor.js";
import { verifyResendWebhook } from "../lib/resend-webhook.js";
import { recordResendWebhookEvent } from "../lib/email-analytics-store.js";
import {
  mapResendEventToSuppressionReason,
  upsertEmailSuppression,
  SUPPRESSION_REASONS,
} from "../lib/email-suppression.js";
import { isMarketingEmailAllowed } from "../lib/email-marketing-preferences.js";
import { evaluateEmailRecipient } from "../lib/email-recipient-eligibility.js";
import { EMAIL_CATEGORIES } from "../lib/email-categories.js";
import {
  assertBulkEmailQueueEnabled,
  BULK_EMAIL_REQUIRES_OUTBOX_ERROR,
} from "../lib/email-dispatch-policy.js";
import { dispatchTransactionalEmail } from "../lib/email-dispatch.js";
import { mapVipStatusEmailDeliveryOutcome } from "../lib/transactional-email-dispatch-result.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
}

function createOutboxMock(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.id, { ...row }]));
  const messages = new Map();
  const suppressions = new Map();
  const marketingPrefs = new Map();

  const supabase = {
    rpc(name, params = {}) {
      if (name === "claim_email_outbox_batch") {
        const limit = Number(params.p_limit || 25);
        const eligible = [...rows.values()]
          .filter(
            (row) =>
              row.status === "pending" &&
              new Date(row.scheduled_at).getTime() <= Date.now() &&
              row.attempts < row.max_attempts
          )
          .slice(0, limit)
          .map((row) => {
            row.status = "processing";
            row.claimed_at = new Date().toISOString();
            row.attempts += 1;
            return { ...row };
          });
        return Promise.resolve({ data: eligible, error: null });
      }

      if (name === "release_stale_email_outbox_processing") {
        const cutoff = Date.now() - Number(params.p_stale_minutes || 15) * 60 * 1000;
        let releasedPending = 0;
        let markedFailed = 0;
        let finalizedSent = 0;

        for (const row of rows.values()) {
          if (!["processing", "accepted"].includes(row.status) || !row.claimed_at) continue;
          if (new Date(row.claimed_at).getTime() > cutoff) continue;

          if (row.resend_id) {
            row.status = "sent";
            row.sent_at = row.sent_at || new Date().toISOString();
            row.claimed_at = null;
            finalizedSent += 1;
            continue;
          }

          if (row.attempts >= row.max_attempts) {
            row.status = "failed";
            row.failed_at = new Date().toISOString();
            markedFailed += 1;
          } else {
            row.status = "pending";
            row.claimed_at = null;
            releasedPending += 1;
          }
        }

        return Promise.resolve({
          data: { releasedPending, markedFailed, finalizedSent },
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: { message: `Unknown rpc ${name}` } });
    },
    from(table) {
      if (table === "email_outbox") {
        return createUpdateApi(rows);
      }
      if (table === "email_messages") {
        return {
          upsert(row, { onConflict } = {}) {
            const key = row[onConflict || "resend_id"];
            messages.set(key, { ...row });
            return Promise.resolve({ error: null });
          },
          insert(row) {
            messages.set(row.resend_id, { ...row });
            return Promise.resolve({ error: null });
          },
          select(columns) {
            void columns;
            return {
              eq(_col, val) {
                return {
                  maybeSingle: async () => {
                    const found = [...messages.values()].find((m) => m.resend_id === val);
                    return { data: found || null, error: null };
                  },
                };
              },
            };
          },
          update(values) {
            return {
              eq(_col, val) {
                return {
                  then(resolve) {
                    const found = [...messages.values()].find((m) => m.resend_id === val);
                    if (found) Object.assign(found, values);
                    resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "email_suppressions") {
        return createSuppressionApi(suppressions);
      }
      if (table === "email_marketing_preferences") {
        return {
          select() {
            return {
              eq(_col, userId) {
                return {
                  maybeSingle: async () => ({
                    data: marketingPrefs.get(userId) || null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select() {
            return {
              ilike() {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "email_analytics_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    _rows: rows,
    _messages: messages,
    _suppressions: suppressions,
    _marketingPrefs: marketingPrefs,
    _getRow(id) {
      return rows.get(id);
    },
  };

  return supabase;
}

function createUpdateApi(store) {
  return {
    update(values) {
      const filters = [];
      const api = {
        eq(column, value) {
          filters.push(["eq", column, value]);
          return api;
        },
        in(column, value) {
          filters.push(["in", column, value]);
          return api;
        },
        then(resolve, reject) {
          try {
            for (const row of store.values()) {
              const matches = filters.every((filter) => {
                if (filter[0] === "eq") return row[filter[1]] === filter[2];
                if (filter[0] === "in") return filter[2].includes(row[filter[1]]);
                return true;
              });
              if (matches) Object.assign(row, values);
            }
            resolve({ error: null });
          } catch (error) {
            reject(error);
          }
        },
      };
      return api;
    },
  };
}

function createSuppressionApi(store) {
  return {
    select() {
      return {
        eq(_col, email) {
          return {
            eq(_col2, active) {
              return {
                maybeSingle: async () => {
                  const found = [...store.values()].find(
                    (row) => row.normalized_email === email && row.active === active
                  );
                  return { data: found || null, error: null };
                },
              };
            },
          };
        },
      };
    },
    insert(row) {
      const id = randomUUID();
      const record = { id, ...row };
      store.set(record.normalized_email, record);
      return {
        select() {
          return {
            single: async () => ({ data: record, error: null }),
          };
        },
      };
    },
    update(values) {
      return {
        eq(_col, id) {
          return {
            select() {
              return {
                single: async () => {
                  for (const row of store.values()) {
                    if (row.id === id) Object.assign(row, values);
                  }
                  return { data: { id, ...values }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

function buildRow(overrides = {}) {
  const id = overrides.id || randomUUID();
  return {
    id,
    idempotency_key: overrides.idempotency_key || `test:${id}`,
    recipient_email: overrides.recipient_email || "user@example.com",
    subject: "Test",
    html: "<p>test</p>",
    text: null,
    message_type: overrides.message_type || "subscription_activated",
    status: overrides.status || "pending",
    attempts: overrides.attempts ?? 0,
    max_attempts: 5,
    resend_id: overrides.resend_id || null,
    provider_idempotency_key: overrides.provider_idempotency_key || null,
    accepted_at: overrides.accepted_at || null,
    provider_submission_state: overrides.provider_submission_state || "none",
    metadata: overrides.metadata || {},
    scheduled_at: overrides.scheduled_at || new Date().toISOString(),
    claimed_at: overrides.claimed_at || null,
    sent_at: null,
    failed_at: null,
    skipped_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function testProviderIdempotencyKeyDeterministic() {
  const id = randomUUID();
  const first = buildProviderIdempotencyKey(id);
  const second = buildProviderIdempotencyKey(id);
  assert(first === second, "Provider idempotency key must be deterministic");
  assert(first.includes(id), "Provider key should include outbox id");
}

async function testTagsIncludeMessageTypeAndOutboxId() {
  const id = randomUUID();
  const tags = buildOutboxResendTags({
    id,
    message_type: "subscription_activated",
    metadata: { campaign_id: "camp-123" },
  });

  assert(tags.some((tag) => tag.name === "message_type" && tag.value === "subscription_activated"));
  assert(tags.some((tag) => tag.name === "outbox_id" && tag.value === id));
  assert(tags.some((tag) => tag.name === "campaign_id" && tag.value === "camp-123"));
}

async function testProviderSuccessMarksSent() {
  const row = buildRow();
  const supabase = createOutboxMock([row]);
  const claimed = (await claimPendingEmailBatch(supabase))[0];
  const keys = [];

  await processSingleOutboxEmail(supabase, claimed, {
    sendOutboxEmail: async (sendRow, deps) => {
      keys.push(deps?.providerIdempotencyKey || sendRow.provider_idempotency_key);
      return {
        success: true,
        id: "resend-abc",
        providerIdempotencyKey: buildProviderIdempotencyKey(sendRow.id),
      };
    },
  });

  const stored = supabase._getRow(row.id);
  assert(stored.status === "sent", "Should mark sent");
  assert(stored.resend_id === "resend-abc", "Should store resend id");
  assert(stored.accepted_at, "Should store accepted_at");
}

async function testRetryUsesSameProviderKeyAndNoSecondSend() {
  const row = buildRow();
  const supabase = createOutboxMock([row]);
  const claimed = (await claimPendingEmailBatch(supabase))[0];
  let sendCalls = 0;
  const keys = [];

  await processSingleOutboxEmail(supabase, claimed, {
    sendOutboxEmail: async (sendRow) => {
      sendCalls += 1;
      const key = buildProviderIdempotencyKey(sendRow.id);
      keys.push(key);
      return { success: true, id: "resend-same", providerIdempotencyKey: key };
    },
  });

  const stored = supabase._getRow(row.id);
  stored.status = "processing";
  stored.claimed_at = new Date().toISOString();
  stored.resend_id = "resend-same";
  stored.accepted_at = new Date().toISOString();

  await processSingleOutboxEmail(supabase, stored, {
    sendOutboxEmail: async () => {
      sendCalls += 1;
      return { success: true, id: "should-not-send-again" };
    },
  });

  assert(sendCalls === 1, "Reconcile path should not call provider again");
  assert(supabase._getRow(row.id).status === "sent", "Reconcile should finalize sent");
}

async function testUncertainFailureDoesNotBlindRetryAsSuccess() {
  const row = buildRow();
  const supabase = createOutboxMock([row]);
  const claimed = (await claimPendingEmailBatch(supabase))[0];

  await processSingleOutboxEmail(supabase, claimed, {
    sendOutboxEmail: async () => ({
      success: false,
      uncertain: true,
      error: "network timeout",
    }),
  });

  const stored = supabase._getRow(row.id);
  assert(stored.status === "pending", "Uncertain failure should schedule retry pending");
  assert(stored.provider_submission_state === "uncertain", "Should mark uncertain state");
}

async function testStaleRecoveryFinalizesAcceptedRows() {
  const row = buildRow({
    status: "processing",
    claimed_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    attempts: 1,
    resend_id: "resend-stale",
    accepted_at: new Date().toISOString(),
  });
  const supabase = createOutboxMock([row]);

  const result = await releaseStaleProcessingEmails(supabase, {
    staleProcessingMinutes: 15,
  });

  assert(result.finalizedSent === 1, "Stale accepted row should finalize sent");
  assert(supabase._getRow(row.id).status === "sent", "Stale row with resend_id becomes sent");
}

async function testMultiWorkerClaimSafety() {
  const row = buildRow();
  const supabase = createOutboxMock([row]);
  const first = await claimPendingEmailBatch(supabase);
  const second = await claimPendingEmailBatch(supabase);
  assert(first.length === 1, "First worker claims row");
  assert(second.length === 0, "Second worker should not claim processing row");
}

async function testWebhookSuppressionMapping() {
  assert(
    mapResendEventToSuppressionReason("email.complained", {}) === SUPPRESSION_REASONS.COMPLAINT
  );
  assert(
    mapResendEventToSuppressionReason("email.bounced", {
      data: { bounce: { type: "hard" } },
    }) === SUPPRESSION_REASONS.HARD_BOUNCE
  );
  assert(
    mapResendEventToSuppressionReason("email.delivery_delayed", {}) === null,
    "Delayed should not suppress"
  );
}

async function testSuppressionIdempotent() {
  const supabase = createOutboxMock([]);
  const first = await upsertEmailSuppression(supabase, {
    email: "blocked@example.com",
    reason: SUPPRESSION_REASONS.COMPLAINT,
    source: "test",
  });
  const second = await upsertEmailSuppression(supabase, {
    email: "blocked@example.com",
    reason: SUPPRESSION_REASONS.COMPLAINT,
    source: "test",
  });
  assert(first.created === true, "First suppression created");
  assert(second.updated === true, "Second suppression updates existing");
}

async function testMarketingOptOutBlocksMarketingCategory() {
  const supabase = createOutboxMock([]);
  supabase._marketingPrefs.set("user-1", {
    marketing_opt_in: false,
    global_unsubscribed_at: new Date().toISOString(),
  });

  const allowed = await isMarketingEmailAllowed(supabase, { userId: "user-1" });
  assert(allowed.allowed === false, "Opted-out user blocked from marketing");

  const eligibility = await evaluateEmailRecipient(
    supabase,
    {
      email: "user@example.com",
      category: EMAIL_CATEGORIES.MARKETING,
      userId: "user-1",
    },
    {
      isMarketingEmailAllowed: async () => ({ allowed: false, reason: "marketing-not-opted-in" }),
    }
  );
  assert(eligibility.eligible === false, "Marketing category should respect opt-out");
}

async function testTransactionalNotBlockedByMarketingOptOut() {
  const supabase = createOutboxMock([]);
  const eligibility = await evaluateEmailRecipient(
    supabase,
    {
      email: "user@example.com",
      category: EMAIL_CATEGORIES.TRANSACTIONAL,
      userId: "user-1",
    },
    {
      isEmailSuppressed: async () => false,
      isMarketingEmailAllowed: async () => ({ allowed: false, reason: "marketing-not-opted-in" }),
    }
  );
  assert(eligibility.eligible === true, "Transactional should not require marketing opt-in");
}

async function testBulkFailClosedWithoutQueue() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    const check = assertBulkEmailQueueEnabled(EMAIL_CATEGORIES.BULK);
    assert(check.ok === false, "Bulk should fail closed when queue disabled");
    assert(check.code === BULK_EMAIL_REQUIRES_OUTBOX_ERROR, "Bulk fail-closed code");

    let threw = false;
    try {
      await dispatchTransactionalEmail({
        idempotencyKey: "bulk:test",
        recipientEmail: "user@example.com",
        subject: "Bulk",
        html: "<p>x</p>",
        messageType: "bulk_test",
        metadata: { category: "bulk" },
      });
    } catch (error) {
      threw = true;
      assert(error.code === BULK_EMAIL_REQUIRES_OUTBOX_ERROR, "Dispatch should throw for bulk");
    }
    assert(threw, "Bulk dispatch must throw without outbox");
  });
}

async function testVipDuplicateNotDelivered() {
  const mapped = mapVipStatusEmailDeliveryOutcome({
    success: true,
    mode: "outbox",
    duplicate: true,
    enqueued: false,
    record: { id: "outbox-1" },
  });
  assert(mapped.delivered === false, "VIP duplicate enqueue must not count as delivered");
  assert(mapped.duplicate === true, "Duplicate flag preserved");
}

async function testWebhookOutboxCorrelation() {
  const supabase = createOutboxMock([]);
  const outboxId = randomUUID();

  await recordResendWebhookEvent(supabase, {
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: {
      email_id: "resend-delivered-1",
      to: ["user@example.com"],
      subject: "Hello",
      tags: [
        { name: "message_type", value: "subscription_activated" },
        { name: "outbox_id", value: outboxId },
      ],
    },
  });

  const message = supabase._messages.get("resend-delivered-1");
  assert(message, "Webhook should upsert analytics message");
  assert(message.outbox_id === outboxId, "Webhook should correlate outbox_id");
  assert(message.status === "delivered", "Delivered event should set delivery status");
}

async function testWebhookSignatureRequired() {
  let threw = false;
  try {
    verifyResendWebhook("{}", new Headers(), "");
  } catch (error) {
    threw = true;
  }
  assert(threw, "Missing webhook secret should fail verification");
}

async function run() {
  const tests = [
    ["provider idempotency key deterministic", testProviderIdempotencyKeyDeterministic],
    ["tags include message_type and outbox_id", testTagsIncludeMessageTypeAndOutboxId],
    ["provider success marks sent", testProviderSuccessMarksSent],
    ["retry reconciles without second send", testRetryUsesSameProviderKeyAndNoSecondSend],
    ["uncertain failure stays retry pending", testUncertainFailureDoesNotBlindRetryAsSuccess],
    ["stale recovery finalizes accepted rows", testStaleRecoveryFinalizesAcceptedRows],
    ["multi worker claim safety", testMultiWorkerClaimSafety],
    ["webhook suppression mapping", testWebhookSuppressionMapping],
    ["suppression idempotent", testSuppressionIdempotent],
    ["marketing opt-out blocks marketing", testMarketingOptOutBlocksMarketingCategory],
    ["transactional not blocked by marketing opt-out", testTransactionalNotBlockedByMarketingOptOut],
    ["bulk fail-closed without queue", testBulkFailClosedWithoutQueue],
    ["VIP duplicate not delivered", testVipDuplicateNotDelivered],
    ["webhook outbox correlation", testWebhookOutboxCorrelation],
    ["webhook signature required", testWebhookSignatureRequired],
  ];

  for (const [name, fn] of tests) {
    await fn();
    console.log(`PASS ${name}`);
  }

  console.log(`\nAll ${tests.length} Phase E1 tests passed.`);
}

run().catch((error) => {
  console.error("FAIL", error?.message || error);
  process.exit(1);
});
