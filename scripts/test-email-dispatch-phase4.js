#!/usr/bin/env node

/**
 * Phase 4 tests for analysis reply and account management approved dispatch.
 *
 * Usage:
 *   node scripts/test-email-dispatch-phase4.js
 */

import { randomUUID } from "crypto";
import {
  buildAnalysisReplyIdempotencyKey,
  sendAnalysisReplyEmail,
} from "../lib/analysis-reply-dispatch.js";
import {
  dispatchTransactionalEmail,
  isEmailQueueWorkerEnabled,
} from "../lib/email-dispatch.js";

const TEST_EMAIL = "phase4-user@test.local";
const ANALYSIS_REQUEST_ID = randomUUID();
const ACCOUNT_REQUEST_ID = randomUUID();

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

async function testAnalysisReplyIdempotencyKey() {
  assert(
    buildAnalysisReplyIdempotencyKey(ANALYSIS_REQUEST_ID) ===
      `analysis_reply:${ANALYSIS_REQUEST_ID}`,
    "Analysis reply idempotency key should use analysisRequestId"
  );
}

async function testAnalysisReplyRequiresRequestId() {
  const result = await sendAnalysisReplyEmail({
    email: TEST_EMAIL,
    coin: "BTC",
    reply: "Test reply",
    requestId: "",
  });

  assert(result.sent === false, "Analysis reply should reject missing requestId");
  assert(
    result.reason === "Missing analysis request id",
    "Analysis reply should report missing requestId"
  );
}

async function testAnalysisReplyDirectPath() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await sendAnalysisReplyEmail(
      {
        email: TEST_EMAIL,
        coin: "ETH",
        reply: "Direct path test",
        requestId: ANALYSIS_REQUEST_ID,
      },
      {
        dispatchTransactionalEmail: (payload, deps = {}) => {
          assert(
            payload.idempotencyKey === `analysis_reply:${ANALYSIS_REQUEST_ID}`,
            "Analysis reply dispatch should use analysis_request idempotency key"
          );
          assert(payload.messageType === "analysis_reply", "messageType should be analysis_reply");
          assert(
            payload.metadata.analysisRequestId === ANALYSIS_REQUEST_ID,
            "metadata should include analysisRequestId"
          );

          return dispatchTransactionalEmail(payload, {
            ...deps,
            sendDirectEmail: async () => {
              directCalls += 1;
              return { success: true, id: "analysis-direct-id" };
            },
            enqueueEmail: async () => {
              enqueueCalls += 1;
              return { success: true, enqueued: true, duplicate: false, record: null };
            },
          });
        },
      }
    );

    assert(result.sent === true, "Direct analysis reply should succeed");
    assert(directCalls === 1, "Direct analysis reply should call direct sender once");
    assert(enqueueCalls === 0, "Direct analysis reply must not enqueue");
  });
}

async function testAnalysisReplyEnqueuePath() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await sendAnalysisReplyEmail(
      {
        email: TEST_EMAIL,
        coin: "SOL",
        reply: "Outbox path test",
        requestId: ANALYSIS_REQUEST_ID,
      },
      {
        dispatchTransactionalEmail: (payload, deps = {}) =>
          dispatchTransactionalEmail(payload, {
            ...deps,
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
          }),
      }
    );

    assert(result.sent === true, "Queued analysis reply should report sent/queued success");
    assert(enqueueCalls === 1, "Queued analysis reply should enqueue once");
    assert(directCalls === 0, "Queued analysis reply must not direct-send");
  });
}

async function testAccountManagementApprovedDispatch() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const title = "تم قبول طلب إدارة حسابك ✅";
    const html = "<p>approved test</p>";

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `account_mgmt_approved:${ACCOUNT_REQUEST_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: title,
        html,
        messageType: "account_management_approved",
        recordId: ACCOUNT_REQUEST_ID,
        metadata: {
          source: "account_management_approved",
          accountManagementRequestId: ACCOUNT_REQUEST_ID,
          userEmail: TEST_EMAIL,
          platform: "OKX",
        },
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true, id: "account-approved-direct-id" };
        },
        enqueueEmail: async () => {
          enqueueCalls += 1;
          return { success: true, enqueued: true, duplicate: false, record: null };
        },
      }
    );

    assert(
      result.mode === "direct",
      "Account management approved should use direct mode when flag false"
    );
    assert(directCalls === 1, "Account management approved should direct-send once");
    assert(enqueueCalls === 0, "Account management approved must not enqueue when flag false");
    assert(result.success === true, "Account management approved direct dispatch should succeed");
  });
}

async function testAccountManagementApprovedDuplicate() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `account_mgmt_approved:${ACCOUNT_REQUEST_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: "تم قبول طلب إدارة حسابك ✅",
        html: "<p>duplicate test</p>",
        messageType: "account_management_approved",
        recordId: ACCOUNT_REQUEST_ID,
        metadata: {
          source: "account_management_approved",
          accountManagementRequestId: ACCOUNT_REQUEST_ID,
          userEmail: TEST_EMAIL,
        },
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true };
        },
        enqueueEmail: async () => ({
          success: true,
          enqueued: false,
          duplicate: true,
          record: { id: randomUUID(), status: "pending" },
        }),
      }
    );

    assert(
      result.duplicate === true,
      "Duplicate account management approved should not create second row"
    );
    assert(directCalls === 0, "Duplicate account management approved must not direct-send");
  });
}

async function main() {
  assert(!isEmailQueueWorkerEnabled(), "Default feature flag should remain false");

  await testAnalysisReplyIdempotencyKey();
  await testAnalysisReplyRequiresRequestId();
  await testAnalysisReplyDirectPath();
  await testAnalysisReplyEnqueuePath();
  await testAccountManagementApprovedDispatch();
  await testAccountManagementApprovedDuplicate();

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_dispatch.phase4.test.passed",
      resendCalledForReal: false,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "email_dispatch.phase4.test.failed",
      message: error.message,
    })
  );
  process.exit(1);
});
