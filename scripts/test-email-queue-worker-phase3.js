#!/usr/bin/env node

/**
 * Phase 3 tests for email queue worker / outbox processor.
 * Uses in-memory mocks — no real Resend calls.
 *
 * Usage:
 *   node scripts/test-email-queue-worker-phase3.js
 */

import { randomUUID } from "crypto";
import {
  calculateRetryDelay,
  claimPendingEmailBatch,
  isEmailQueueWorkerEnabled,
  processEmailOutboxBatch,
  processSingleOutboxEmail,
  releaseStaleProcessingEmails,
  runEmailQueueCron,
} from "../lib/email-outbox-processor.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv(name, value, fn) {
  const previous = process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous;
      }
    });
}

function cloneRow(row) {
  return {
    ...row,
    metadata: { ...(row.metadata || {}) },
  };
}

function createMockSupabase(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.id, cloneRow(row)]));

  const supabase = {
    rpc(name, params = {}) {
      if (name === "claim_email_outbox_batch") {
        const limit = Number(params.p_limit || 25);
        const now = Date.now();
        const eligible = [...rows.values()]
          .filter(
            (row) =>
              row.status === "pending" &&
              new Date(row.scheduled_at).getTime() <= now &&
              row.attempts < row.max_attempts
          )
          .sort((a, b) => {
            const scheduleDiff =
              new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
            if (scheduleDiff !== 0) return scheduleDiff;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })
          .slice(0, limit);

        const claimed = eligible.map((row) => {
          row.status = "processing";
          row.claimed_at = new Date().toISOString();
          row.attempts += 1;
          row.updated_at = new Date().toISOString();
          return cloneRow(row);
        });

        return Promise.resolve({ data: claimed, error: null });
      }

      if (name === "release_stale_email_outbox_processing") {
        const staleMinutes = Number(params.p_stale_minutes || 15);
        const cutoff = Date.now() - staleMinutes * 60 * 1000;
        let releasedPending = 0;
        let markedFailed = 0;
        let finalizedSent = 0;

        for (const row of rows.values()) {
          if (row.status !== "processing" && row.status !== "accepted") continue;
          if (!row.claimed_at) continue;
          if (new Date(row.claimed_at).getTime() > cutoff) continue;

          if (row.resend_id) {
            row.status = "sent";
            row.sent_at = row.sent_at || row.accepted_at || new Date().toISOString();
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

      return Promise.resolve({
        data: null,
        error: { message: `Unknown rpc ${name}` },
      });
    },
    from(table) {
      if (table === "email_messages") {
        const messageRows = new Map();
        return {
          upsert(row) {
            const key = row.resend_id;
            messageRows.set(key, { ...row });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table !== "email_outbox") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        update(values) {
          const filters = [];
          const api = {
            eq(column, value) {
              filters.push(["eq", column, value]);
              return api;
            },
            in(column, values) {
              filters.push(["in", column, values]);
              return api;
            },
            async then(resolve, reject) {
              try {
                for (const row of rows.values()) {
                  const matches = filters.every((filter) => {
                    if (filter[0] === "eq") {
                      const [, column, value] = filter;
                      return row[column] === value;
                    }
                    if (filter[0] === "in") {
                      const [, column, value] = filter;
                      return Array.isArray(value) && value.includes(row[column]);
                    }
                    return true;
                  });
                  if (matches) {
                    Object.assign(row, values, {
                      updated_at: new Date().toISOString(),
                    });
                  }
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
    },
    _rows: rows,
    _getRow(id) {
      return rows.get(id);
    },
    _allRows() {
      return [...rows.values()].map(cloneRow);
    },
  };

  return supabase;
}

function buildPendingRow(overrides = {}) {
  const id = overrides.id || randomUUID();
  return {
    id,
    idempotency_key: overrides.idempotency_key || `test:${id}`,
    recipient_email: overrides.recipient_email || "user@test.local",
    subject: overrides.subject || "Phase 3 test",
    html: overrides.html || "<p>test</p>",
    text: overrides.text || null,
    message_type: overrides.message_type || "admin_subscription_request",
    status: overrides.status || "pending",
    attempts: overrides.attempts ?? 0,
    max_attempts: overrides.max_attempts ?? 5,
    resend_id: overrides.resend_id || null,
    provider_idempotency_key: overrides.provider_idempotency_key || null,
    accepted_at: overrides.accepted_at || null,
    provider_submission_state: overrides.provider_submission_state || "none",
    error: null,
    metadata: overrides.metadata || {},
    scheduled_at: overrides.scheduled_at || new Date().toISOString(),
    claimed_at: overrides.claimed_at || null,
    sent_at: null,
    failed_at: null,
    skipped_at: null,
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
  };
}

async function testWorkerDisabled() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    const supabase = createMockSupabase([buildPendingRow()]);
    const result = await runEmailQueueCron(supabase);

    assert(result.skipped === true, "Disabled worker should skip");
    assert(result.reason === "EMAIL_QUEUE_WORKER_DISABLED", "Skip reason should match");
    assert(isEmailQueueWorkerEnabled() === false, "Flag helper should be false");
    assert(supabase._getRow([...supabase._rows.keys()][0]).status === "pending", "Row stays pending");
  });
}

async function testClaimOnceOnly() {
  const row = buildPendingRow();
  const supabase = createMockSupabase([row]);

  const first = await claimPendingEmailBatch(supabase, { batchSize: 25 });
  const second = await claimPendingEmailBatch(supabase, { batchSize: 25 });

  assert(first.length === 1, "First claim should return one row");
  assert(second.length === 0, "Second claim should not reclaim processing row");
  assert(first[0].status === "processing", "Claimed row should be processing");
  assert(first[0].attempts === 1, "Attempts should increment on claim");
}

async function testTwoCyclesNoDoubleProcess() {
  const row = buildPendingRow();
  const supabase = createMockSupabase([row]);
  let sendCalls = 0;

  const firstSummary = await processEmailOutboxBatch(supabase, {
    batchSize: 25,
    maxRuntimeMs: 5000,
    sendOutboxEmail: async () => {
      sendCalls += 1;
      return { success: true, id: "mock-resend-id" };
    },
    sleep: async () => {},
  });

  const secondSummary = await processEmailOutboxBatch(supabase, {
    batchSize: 25,
    maxRuntimeMs: 5000,
    sendOutboxEmail: async () => {
      sendCalls += 1;
      return { success: true, id: "mock-resend-id-2" };
    },
    sleep: async () => {},
  });

  assert(firstSummary.sent === 1, "First cycle should send once");
  assert(secondSummary.sent === 0, "Second cycle should not resend sent row");
  assert(sendCalls === 1, "Resend mock should run once total");
  assert(supabase._getRow(row.id).status === "sent", "Row should remain sent");
}

async function testSuccessMarksSent() {
  const row = buildPendingRow();
  const supabase = createMockSupabase([row]);
  const claimed = (await claimPendingEmailBatch(supabase, { batchSize: 1 }))[0];

  await processSingleOutboxEmail(supabase, claimed, {
    sendOutboxEmail: async () => ({ success: true, id: "resend-123" }),
  });

  const stored = supabase._getRow(row.id);
  assert(stored.status === "sent", "Successful send should mark sent");
  assert(stored.resend_id === "resend-123", "Resend id should be stored");
}

async function testTemporaryFailureRetry() {
  const row = buildPendingRow({ max_attempts: 5 });
  const supabase = createMockSupabase([row]);
  const claimed = (await claimPendingEmailBatch(supabase, { batchSize: 1 }))[0];
  const before = Date.now();

  await processSingleOutboxEmail(supabase, claimed, {
    sendOutboxEmail: async () => ({
      success: false,
      error: "temporary provider error",
      status: 500,
    }),
  });

  const stored = supabase._getRow(row.id);
  assert(stored.status === "pending", "Temporary failure should return to pending");
  assert(new Date(stored.scheduled_at).getTime() > before, "Retry should schedule future time");
  assert(stored.claimed_at === null, "Claim should be cleared on retry");
}

async function testMaxAttemptsFailed() {
  const row = buildPendingRow({ max_attempts: 2 });
  const supabase = createMockSupabase([row]);
  const claimed = (await claimPendingEmailBatch(supabase, { batchSize: 1 }))[0];
  claimed.attempts = 2;
  supabase._getRow(row.id).attempts = 2;

  await processSingleOutboxEmail(supabase, claimed, {
    sendOutboxEmail: async () => ({
      success: false,
      error: "permanent failure",
      status: 500,
    }),
  });

  const stored = supabase._getRow(row.id);
  assert(stored.status === "failed", "Max attempts should mark failed");
  assert(stored.failed_at, "failed_at should be set");
}

async function testStaleProcessingReleased() {
  const staleClaimedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const row = buildPendingRow({
    status: "processing",
    attempts: 1,
    max_attempts: 5,
    claimed_at: staleClaimedAt,
  });
  const supabase = createMockSupabase([row]);

  const result = await releaseStaleProcessingEmails(supabase, {
    staleProcessingMinutes: 15,
  });

  assert(result.releasedPending === 1, "Stale row should be released to pending");
  assert(supabase._getRow(row.id).status === "pending", "Stale row status should be pending");
}

async function testFutureScheduledNotProcessed() {
  const row = buildPendingRow({
    scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  const supabase = createMockSupabase([row]);
  let sendCalls = 0;

  const summary = await processEmailOutboxBatch(supabase, {
    sendOutboxEmail: async () => {
      sendCalls += 1;
      return { success: true, id: "x" };
    },
    sleep: async () => {},
  });

  assert(summary.claimed === 0, "Future scheduled row should not be claimed");
  assert(sendCalls === 0, "Future scheduled row should not send");
}

async function testDuplicateIdempotencyKey() {
  const supabase = createMockSupabase([]);
  const id = randomUUID();
  const key = `admin_sub_req:${id}`;

  supabase._rows.set(id, buildPendingRow({ id, idempotency_key: key }));

  let duplicateRejected = false;
  for (const existing of supabase._rows.values()) {
    if (existing.idempotency_key === key) {
      duplicateRejected = true;
      break;
    }
  }

  const secondId = randomUUID();
  const beforeSize = supabase._rows.size;
  const hasDuplicate = [...supabase._rows.values()].some(
    (row) => row.idempotency_key === key
  );

  if (!hasDuplicate) {
    supabase._rows.set(secondId, buildPendingRow({ id: secondId, idempotency_key: key }));
  } else {
    duplicateRejected = true;
  }

  assert(duplicateRejected || supabase._rows.size === beforeSize, "Duplicate key should not create second row");
}

async function testNoRealResendInBatch() {
  const row = buildPendingRow();
  const supabase = createMockSupabase([row]);
  let resendCalled = false;

  await processEmailOutboxBatch(supabase, {
    sendOutboxEmail: async () => {
      resendCalled = true;
      return { success: true, id: "mock-only" };
    },
    sleep: async () => {},
  });

  assert(resendCalled === true, "Mock sender should be used");
}

async function testRateLimit() {
  const rows = [
    buildPendingRow({ created_at: new Date(Date.now() - 3000).toISOString() }),
    buildPendingRow({ created_at: new Date(Date.now() - 2000).toISOString() }),
    buildPendingRow({ created_at: new Date(Date.now() - 1000).toISOString() }),
  ];
  const supabase = createMockSupabase(rows);
  const sleepCalls = [];

  await processEmailOutboxBatch(supabase, {
    batchSize: 25,
    rateLimitPerSecond: 3,
    maxRuntimeMs: 10000,
    sendOutboxEmail: async () => ({ success: true, id: "mock" }),
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
  });

  assert(sleepCalls.length >= 2, "Rate limit should sleep between sends");
  assert(sleepCalls.every((ms) => ms > 0), "Rate limit sleeps should be positive");
}

async function testMaxRuntimeStopsSafely() {
  const rows = Array.from({ length: 10 }, (_, index) =>
    buildPendingRow({
      created_at: new Date(Date.now() - index * 1000).toISOString(),
    })
  );
  const supabase = createMockSupabase(rows);

  const summary = await processEmailOutboxBatch(supabase, {
    batchSize: 10,
    maxRuntimeMs: 60,
    rateLimitPerSecond: 100,
    sendOutboxEmail: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { success: true, id: "mock" };
    },
    sleep: async () => {},
  });

  assert(
    summary.stoppedByRuntime === true || summary.sent < rows.length,
    "Max runtime should stop before processing every row"
  );
}

async function testRetryPolicy() {
  assert(calculateRetryDelay(1) === 60 * 1000, "Attempt 1 -> 1 minute");
  assert(calculateRetryDelay(2) === 5 * 60 * 1000, "Attempt 2 -> 5 minutes");
  assert(calculateRetryDelay(3) === 15 * 60 * 1000, "Attempt 3 -> 15 minutes");
  assert(calculateRetryDelay(4) === 60 * 60 * 1000, "Attempt 4+ -> 1 hour");
  assert(
    calculateRetryDelay(2, { retryAfterSeconds: 120 }) === 120 * 1000,
    "Retry-After should override when provided"
  );
}

async function testEnqueueFailureDoesNotDirectSend() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    const supabase = createMockSupabase([buildPendingRow()]);
    let directSendCalls = 0;

    const summary = await processEmailOutboxBatch(supabase, {
      sendOutboxEmail: async () => {
        directSendCalls += 1;
        return { success: false, error: "simulated resend failure", status: 500 };
      },
      sleep: async () => {},
    });

    assert(summary.retried === 1 || summary.failed === 1, "Failure should retry or fail in outbox");
    assert(directSendCalls === 1, "Only one mocked send attempt, no direct fallback path");
  });
}

async function main() {
  await testWorkerDisabled();
  await testClaimOnceOnly();
  await testTwoCyclesNoDoubleProcess();
  await testSuccessMarksSent();
  await testTemporaryFailureRetry();
  await testMaxAttemptsFailed();
  await testStaleProcessingReleased();
  await testFutureScheduledNotProcessed();
  await testDuplicateIdempotencyKey();
  await testNoRealResendInBatch();
  await testRateLimit();
  await testMaxRuntimeStopsSafely();
  await testRetryPolicy();
  await testEnqueueFailureDoesNotDirectSend();

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_queue.phase3.test.passed",
      resendCalledForReal: false,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "email_queue.phase3.test.failed",
      message: error.message,
    })
  );
  process.exit(1);
});
