#!/usr/bin/env node

/**
 * Phase 5 tests for subscription activated email dispatch.
 *
 * Usage:
 *   node scripts/test-email-dispatch-phase5.js
 */

import { randomUUID } from "crypto";
import {
  buildSubscriptionActivatedIdempotencyKey,
  dispatchSubscriptionActivatedEmail,
} from "../lib/subscription-activated-dispatch.js";
import {
  dispatchTransactionalEmail,
  isEmailQueueWorkerEnabled,
} from "../lib/email-dispatch.js";

const TEST_EMAIL = "phase5-user@test.local";
const SUBSCRIPTION_REQUEST_ID = randomUUID();
const EXPIRES_AT = "2026-12-31T00:00:00.000Z";

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

async function testSubscriptionActivatedIdempotencyKey() {
  assert(
    buildSubscriptionActivatedIdempotencyKey(SUBSCRIPTION_REQUEST_ID) ===
      `subscription_activated:${SUBSCRIPTION_REQUEST_ID}`,
    "Subscription activated idempotency key should use subscriptionRequestId"
  );
}

async function testDirectPath() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchSubscriptionActivatedEmail(
      {
        subscriptionRequestId: SUBSCRIPTION_REQUEST_ID,
        recipientEmail: TEST_EMAIL,
        planName: "VIP Spot",
        expiresAt: EXPIRES_AT,
      },
      {
        dispatchTransactionalEmail: (payload, deps = {}) => {
          assert(
            payload.idempotencyKey ===
              `subscription_activated:${SUBSCRIPTION_REQUEST_ID}`,
            "idempotency key should use subscription request id"
          );
          assert(
            payload.messageType === "subscription_activated",
            "messageType should be subscription_activated"
          );

          return dispatchTransactionalEmail(payload, {
            ...deps,
            sendDirectEmail: async () => {
              directCalls += 1;
              return { success: true, id: "subscription-activated-direct-id" };
            },
            enqueueEmail: async () => {
              enqueueCalls += 1;
              return { success: true, enqueued: true, duplicate: false, record: null };
            },
          });
        },
      }
    );

    assert(result.sent === true, "Direct subscription activated should succeed");
    assert(result.mode === "direct", "Direct subscription activated should use direct mode");
    assert(directCalls === 1, "Direct subscription activated should call direct sender once");
    assert(enqueueCalls === 0, "Direct subscription activated must not enqueue");
  });
}

async function testOutboxPath() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchSubscriptionActivatedEmail(
      {
        subscriptionRequestId: SUBSCRIPTION_REQUEST_ID,
        recipientEmail: TEST_EMAIL,
        planName: "VIP Futures",
        expiresAt: EXPIRES_AT,
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
                record: { id: randomUUID(), status: "pending", message_type: "subscription_activated" },
              };
            },
          }),
      }
    );

    assert(result.sent === true, "Queued subscription activated should report sent/queued success");
    assert(result.mode === "outbox", "Queued subscription activated should use outbox mode");
    assert(result.queued === true, "Queued subscription activated should set queued=true");
    assert(enqueueCalls === 1, "Queued subscription activated should enqueue once");
    assert(directCalls === 0, "Queued subscription activated must not direct-send");
    assert(
      result.messageType === "subscription_activated",
      "Queued subscription activated should keep messageType"
    );
  });
}

async function testDuplicatePath() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const dispatchOnce = () =>
      dispatchSubscriptionActivatedEmail(
        {
          subscriptionRequestId: SUBSCRIPTION_REQUEST_ID,
          recipientEmail: TEST_EMAIL,
          planName: "VIP Spot",
          expiresAt: EXPIRES_AT,
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
                if (enqueueCalls === 1) {
                  return {
                    success: true,
                    enqueued: true,
                    duplicate: false,
                    record: { id: randomUUID(), status: "pending" },
                  };
                }

                return {
                  success: true,
                  enqueued: false,
                  duplicate: true,
                  record: { id: randomUUID(), status: "pending" },
                };
              },
            }),
        }
      );

    const firstResult = await dispatchOnce();
    const secondResult = await dispatchOnce();

    assert(firstResult.sent === true, "First subscription activated dispatch should queue");
    assert(secondResult.duplicate === true, "Duplicate subscription activated should set duplicate=true");
    assert(enqueueCalls === 2, "Duplicate path should attempt enqueue twice");
    assert(directCalls === 0, "Duplicate subscription activated must not direct-send");
  });
}

async function testMissingRecipient() {
  const result = await dispatchSubscriptionActivatedEmail({
    subscriptionRequestId: SUBSCRIPTION_REQUEST_ID,
    recipientEmail: "",
    planName: "VIP Spot",
    expiresAt: EXPIRES_AT,
  });

  assert(result.sent === false, "Missing recipient should not send");
  assert(result.hasRecipient === false, "Missing recipient should report hasRecipient=false");
  assert(
    result.reason === "missing-recipient-email",
    "Missing recipient should report missing-recipient-email"
  );
}

async function main() {
  assert(!isEmailQueueWorkerEnabled(), "Default feature flag should remain false");

  await testSubscriptionActivatedIdempotencyKey();
  await testDirectPath();
  await testOutboxPath();
  await testDuplicatePath();
  await testMissingRecipient();

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_dispatch.phase5.test.passed",
      resendCalledForReal: false,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "email_dispatch.phase5.test.failed",
      message: error.message,
    })
  );
  process.exit(1);
});
