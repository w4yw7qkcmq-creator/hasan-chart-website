#!/usr/bin/env node

/**
 * Email Queue cleanup verification tests.
 *
 * Usage:
 *   node scripts/test-email-dispatch-cleanup.js
 */

import { randomUUID } from "crypto";
import {
  dispatchTransactionalEmail,
  isEmailQueueWorkerEnabled,
} from "../lib/email-dispatch.js";
import { dispatchTemplateTransactionalEmail } from "../lib/template-transactional-email.js";
import {
  buildVipSignalIdempotencyKey,
  dispatchVipSignalEmail,
} from "../lib/vip-signal-email-dispatch.js";

const TEST_EMAIL = "cleanup-user@test.local";
const SIGNAL_ID = randomUUID();
const RECORD_ID = randomUUID();

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

async function testUnifiedDirectPath() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `cleanup_direct:${RECORD_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: "Cleanup direct test",
        html: "<p>cleanup direct</p>",
        messageType: "cleanup_direct",
        recordId: RECORD_ID,
        metadata: { source: "cleanup_test" },
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true, id: "cleanup-direct-id" };
        },
        enqueueEmail: async () => {
          enqueueCalls += 1;
          return { success: true, enqueued: true, duplicate: false, record: null };
        },
      }
    );

    assert(result.mode === "direct", "Cleanup direct path should use direct mode");
    assert(directCalls === 1, "Cleanup direct path should send once");
    assert(enqueueCalls === 0, "Cleanup direct path must not enqueue");
  });
}

async function testUnifiedOutboxPath() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchTransactionalEmail(
      {
        idempotencyKey: `cleanup_outbox:${RECORD_ID}`,
        recipientEmail: TEST_EMAIL,
        subject: "Cleanup outbox test",
        html: "<p>cleanup outbox</p>",
        messageType: "cleanup_outbox",
        recordId: RECORD_ID,
        metadata: { source: "cleanup_test" },
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

    assert(result.mode === "outbox", "Cleanup outbox path should use outbox mode");
    assert(result.enqueued === true, "Cleanup outbox path should enqueue");
    assert(enqueueCalls === 1, "Cleanup outbox path should enqueue once");
    assert(directCalls === 0, "Cleanup outbox path must not direct-send");
  });
}

async function testDuplicateIdempotency() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const dispatchOnce = () =>
      dispatchTransactionalEmail(
        {
          idempotencyKey: `cleanup_duplicate:${RECORD_ID}`,
          recipientEmail: TEST_EMAIL,
          subject: "Cleanup duplicate test",
          html: "<p>duplicate</p>",
          messageType: "cleanup_duplicate",
          recordId: RECORD_ID,
        },
        {
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
        }
      );

    const first = await dispatchOnce();
    const second = await dispatchOnce();

    assert(first.enqueued === true, "First cleanup dispatch should enqueue");
    assert(second.duplicate === true, "Second cleanup dispatch should be duplicate");
    assert(directCalls === 0, "Duplicate cleanup path must not direct-send");
  });
}

async function testTemplateHelperDirect() {
  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "false", async () => {
    let directCalls = 0;

    await dispatchTemplateTransactionalEmail(
      {
        idempotencyKey: `cleanup_template:${RECORD_ID}`,
        recipientEmail: TEST_EMAIL,
        messageType: "cleanup_template",
        recordId: RECORD_ID,
        subject: "Template helper test",
        title: "Template helper test",
        content: "<p>template helper</p>",
        actionText: "Open",
        actionUrl: "https://www.hasanchartworld.com",
      },
      {
        sendDirectEmail: async () => {
          directCalls += 1;
          return { success: true };
        },
      }
    );

    assert(directCalls === 1, "Template helper should direct-send once when flag false");
  });
}

async function testVipSignalDispatch() {
  assert(
    buildVipSignalIdempotencyKey(SIGNAL_ID, TEST_EMAIL) ===
      `vip_signal:${SIGNAL_ID}:${TEST_EMAIL.replace(/[^a-z0-9]/g, "").slice(0, 24)}`,
    "VIP signal idempotency key should include signal id and recipient hash"
  );

  await withEnv("EMAIL_QUEUE_WORKER_ENABLED", "true", async () => {
    let directCalls = 0;
    let enqueueCalls = 0;

    const result = await dispatchVipSignalEmail(
      {
        signalId: SIGNAL_ID,
        recipientEmail: TEST_EMAIL,
        signalType: "spot",
        coin: "BTC",
        subject: "VIP cleanup test",
        title: "VIP cleanup test",
        content: "<p>vip cleanup</p>",
        actionText: "Open VIP",
        actionUrl: "https://www.hasanchartworld.com/vip-spot",
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
            record: { id: randomUUID(), status: "pending", message_type: "vip_signal" },
          };
        },
      }
    );

    assert(result.sent === true, "VIP cleanup dispatch should queue successfully");
    assert(result.mode === "outbox", "VIP cleanup dispatch should use outbox mode");
    assert(enqueueCalls === 1, "VIP cleanup dispatch should enqueue once");
    assert(directCalls === 0, "VIP cleanup dispatch must not direct-send");
  });
}

async function testMissingRecipientDoesNotThrow() {
  const result = await dispatchVipSignalEmail({
    signalId: SIGNAL_ID,
    recipientEmail: "",
    signalType: "spot",
    coin: "BTC",
    subject: "VIP missing recipient",
    title: "VIP missing recipient",
    content: "<p>missing</p>",
  });

  assert(result.sent === false, "Missing recipient should not send");
  assert(result.hasRecipient === false, "Missing recipient should report hasRecipient=false");
}

async function main() {
  assert(!isEmailQueueWorkerEnabled(), "Default feature flag should remain false");

  await testUnifiedDirectPath();
  await testUnifiedOutboxPath();
  await testDuplicateIdempotency();
  await testTemplateHelperDirect();
  await testVipSignalDispatch();
  await testMissingRecipientDoesNotThrow();

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_dispatch.cleanup.test.passed",
      resendCalledForReal: false,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "email_dispatch.cleanup.test.failed",
      message: error.message,
    })
  );
  process.exit(1);
});
