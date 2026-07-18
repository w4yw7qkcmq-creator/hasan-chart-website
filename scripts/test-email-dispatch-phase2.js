#!/usr/bin/env node

/**
 * Phase 2 tests for lib/email-dispatch.js
 *
 * Usage:
 *   node scripts/test-email-dispatch-phase2.js
 *
 * Optional integration section (requires applied email_outbox migration):
 *   RUN_EMAIL_DISPATCH_INTEGRATION=1 node scripts/test-email-dispatch-phase2.js
 */

import { randomUUID } from "crypto";
import {
  dispatchTransactionalEmail,
  isEmailQueueWorkerEnabled,
} from "../lib/email-dispatch.js";

const TEST_HTML = "<p>Phase 2 dispatch test</p>";
const TEST_EMAIL = "admin-phase2@test.local";
const TEST_REQUEST_ID = randomUUID();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv(name, value, fn) {
  const previous = process.env[name];
  process.env[name] = value;

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

async function runFlagDefaultTest() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "", async () => {
    assert(!isEmailQueueWorkerEnabled(), "Feature flag should default to false");
  });
}

async function runDirectOnlyTest() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `admin_sub_req:${TEST_REQUEST_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: "Direct path test",
        html: TEST_HTML,
        messageType: "admin_subscription_request",
        recordId: TEST_REQUEST_ID,
        metadata: {
          source: "subscription_request",
          subscriptionRequestId: TEST_REQUEST_ID,
          userEmail: "user@test.local",
          category: "vip",
          planName: "Monthly",
        },
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true, id: "direct-test-id" };
        },
        enqueueEmail: async () => {
          enqueueCalls += 1;
          return { success: true, enqueued: true, duplicate: false, record: null };
        },
      }
    );

    assert(result.mode === "direct", "Flag false should use direct mode");
    assert(directCalls === 1, "Direct path should be called exactly once");
    assert(enqueueCalls === 0, "Enqueue must not run when flag is false");
  });
}

async function runEnqueueOnlyTest() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `admin_account_mgmt_req:${TEST_REQUEST_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: "Outbox path test",
        html: TEST_HTML,
        messageType: "admin_account_management_request",
        recordId: TEST_REQUEST_ID,
        metadata: {
          source: "account_management_request",
          accountManagementRequestId: TEST_REQUEST_ID,
          userEmail: "user@test.local",
        },
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true };
        },
        enqueueEmail: async () => {
          enqueueCalls += 1;
          return {
            success: true,
            enqueued: true,
            duplicate: false,
            record: { id: randomUUID(), status: "pending" },
          };
        },
      }
    );

    assert(result.mode === "outbox", "Flag true should use outbox mode");
    assert(enqueueCalls === 1, "Enqueue should be called exactly once");
    assert(directCalls === 0, "Direct must not run when flag is true");
    assert(result.enqueued === true, "Result should report enqueued=true");
  });
}

async function runDuplicateTest() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;
    const existingId = randomUUID();

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `admin_sub_req:${TEST_REQUEST_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: "Duplicate test",
        html: TEST_HTML,
        messageType: "admin_subscription_request",
        recordId: TEST_REQUEST_ID,
        metadata: {
          source: "subscription_request",
          subscriptionRequestId: TEST_REQUEST_ID,
          userEmail: "user@test.local",
          category: "vip",
          planName: "Monthly",
        },
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true };
        },
        enqueueEmail: async () => {
          enqueueCalls += 1;
          return {
            success: true,
            enqueued: false,
            duplicate: true,
            record: { id: existingId, status: "pending" },
          };
        },
      }
    );

    assert(enqueueCalls === 1, "Duplicate should still call enqueue once");
    assert(directCalls === 0, "Duplicate must not trigger direct send");
    assert(result.duplicate === true, "Result should report duplicate=true");
    assert(result.record?.id === existingId, "Duplicate should return existing record");
  });
}

async function runEnqueueFailureNoFallbackTest() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `admin_sub_req:${TEST_REQUEST_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: "Enqueue failure test",
        html: TEST_HTML,
        messageType: "admin_subscription_request",
        recordId: TEST_REQUEST_ID,
        metadata: {
          source: "subscription_request",
          subscriptionRequestId: TEST_REQUEST_ID,
          userEmail: "user@test.local",
          category: "vip",
          planName: "Monthly",
        },
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true };
        },
        enqueueEmail: async () => {
          enqueueCalls += 1;
          throw new Error("simulated enqueue failure");
        },
      }
    );

    assert(enqueueCalls === 1, "Failed enqueue should still attempt once");
    assert(directCalls === 0, "Failed enqueue must not fallback to direct");
    assert(result.success === false, "Failed enqueue should return success=false");
    assert(result.mode === "outbox", "Failed enqueue should stay in outbox mode");
  });
}

async function runValidationTests() {
  let missingKeyRejected = false;

  try {
    await dispatchTransactionalEmail({
      recipientEmail: TEST_EMAIL,
      subject: "Missing key",
      html: TEST_HTML,
      messageType: "admin_subscription_request",
      metadata: {},
    });
  } catch (error) {
    missingKeyRejected = error.code === "EMAIL_DISPATCH_VALIDATION_ERROR";
  }

  assert(missingKeyRejected, "Missing idempotencyKey should fail validation");

  let missingHtmlRejected = false;

  try {
    await dispatchTransactionalEmail({
      idempotencyKey: `admin_sub_req:${TEST_REQUEST_ID}`,
      recipientEmail: TEST_EMAIL,
      subject: "Missing html",
      messageType: "admin_subscription_request",
      metadata: {},
    });
  } catch (error) {
    missingHtmlRejected = error.code === "EMAIL_DISPATCH_VALIDATION_ERROR";
  }

  assert(missingHtmlRejected, "Missing html should fail validation");
}

async function runIntegrationDuplicateTest() {
  if (process.env.RUN_EMAIL_DISPATCH_INTEGRATION !== "1") {
    return;
  }

  const { enqueueEmail } = await import("../lib/email-outbox-shared.js");
  const requestId = randomUUID();
  const idempotencyKey = `admin_sub_req:${requestId}`;

  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;

    const deps = {
      sendDirectEmail: async () => {
        directCalls += 1;
        return { success: true };
      },
      enqueueEmail,
    };

    const first = await dispatchTransactionalEmail(
      {
        idempotencyKey,
        recipientEmail: TEST_EMAIL,
        subject: "Integration duplicate test",
        html: TEST_HTML,
        messageType: "admin_subscription_request",
        recordId: requestId,
        metadata: {
          source: "subscription_request",
          subscriptionRequestId: requestId,
          userEmail: "user@test.local",
          category: "vip",
          planName: "Monthly",
        },
      },
      deps
    );

    const second = await dispatchTransactionalEmail(
      {
        idempotencyKey,
        recipientEmail: TEST_EMAIL,
        subject: "Integration duplicate test",
        html: TEST_HTML,
        messageType: "admin_subscription_request",
        recordId: requestId,
        metadata: {
          source: "subscription_request",
          subscriptionRequestId: requestId,
          userEmail: "user@test.local",
          category: "vip",
          planName: "Monthly",
        },
      },
      deps
    );

    assert(first.enqueued === true, "Integration first enqueue should create row");
    assert(second.duplicate === true, "Integration duplicate should not create second row");
    assert(directCalls === 0, "Integration duplicate path must not direct-send");

    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await supabase.from("email_outbox").delete().eq("idempotency_key", idempotencyKey);
  });
}

async function main() {
  await runFlagDefaultTest();
  await runDirectOnlyTest();
  await runEnqueueOnlyTest();
  await runDuplicateTest();
  await runEnqueueFailureNoFallbackTest();
  await runValidationTests();
  await runIntegrationDuplicateTest();

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_dispatch.phase2.test.passed",
      integration: process.env.RUN_EMAIL_DISPATCH_INTEGRATION === "1",
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "email_dispatch.phase2.test.failed",
      message: error.message,
    })
  );
  process.exit(1);
});
