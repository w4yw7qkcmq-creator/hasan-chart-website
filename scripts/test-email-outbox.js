#!/usr/bin/env node

/**
 * Local integration tests for lib/email-outbox-shared.js (Phase 1).
 *
 * Requires:
 *   - Migration 20260721_email_outbox.sql applied to the target Supabase project
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/test-email-outbox.js
 *
 * Uses test.local recipient addresses only. Does not send email via Resend.
 */

import { randomUUID } from "crypto";
import {
  buildEmailIdempotencyKey,
  enqueueEmail,
  normalizeRecipientEmail,
  validateEmailOutboxPayload,
} from "../lib/email-outbox-shared.js";

const TEST_RUN_ID = randomUUID();
const TEST_EMAIL = `outbox-test+${TEST_RUN_ID.slice(0, 8)}@test.local`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function cleanupTestRows(idempotencyKeys) {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase
    .from("email_outbox")
    .delete()
    .in("idempotency_key", idempotencyKeys);

  if (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "email_outbox.test.cleanup_failed",
        error: error.message,
      })
    );
  }
}

async function runValidationTests() {
  assert(
    normalizeRecipientEmail("  User@Test.LOCAL ") === "user@test.local",
    "normalizeRecipientEmail should lowercase and trim"
  );

  assert(
    buildEmailIdempotencyKey("admin_subscription_request", "req-123") ===
      "admin_subscription_request:req-123",
    "buildEmailIdempotencyKey should join message type and parts"
  );

  const invalid = validateEmailOutboxPayload({
    recipientEmail: TEST_EMAIL,
    subject: "Test",
    messageType: "test_message",
  });

  assert(!invalid.valid, "validateEmailOutboxPayload should reject missing idempotencyKey");
  assert(
    invalid.errors.includes("idempotencyKey is required"),
    "validateEmailOutboxPayload should report missing idempotencyKey"
  );
}

async function runIntegrationTests() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: tableError } = await supabase.from("email_outbox").select("id").limit(1);

  if (tableError) {
    throw new Error(
      `email_outbox table is not available (${tableError.message}). Apply migration 20260721_email_outbox.sql first.`
    );
  }

  const idempotencyKey = buildEmailIdempotencyKey(
    "test_email_outbox",
    TEST_RUN_ID
  );
  const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const metadata = {
    testRunId: TEST_RUN_ID,
    source: "scripts/test-email-outbox.js",
    phase: 1,
  };

  try {
    let rejected = false;
    try {
      await enqueueEmail({
        recipientEmail: TEST_EMAIL,
        subject: "Should fail",
        messageType: "test_email_outbox",
      });
    } catch (error) {
      rejected = error.code === "EMAIL_OUTBOX_VALIDATION_ERROR";
    }
    assert(rejected, "enqueueEmail should reject incomplete payload");

    const first = await enqueueEmail({
      idempotencyKey,
      recipientEmail: `  ${TEST_EMAIL.toUpperCase()}  `,
      subject: "Email Outbox Phase 1 Test",
      html: "<p>Test HTML only — no Resend send.</p>",
      text: "Test text only — no Resend send.",
      messageType: "test_email_outbox",
      metadata,
      scheduledAt,
      maxAttempts: 3,
    });

    assert(first.success === true, "first enqueue should succeed");
    assert(first.enqueued === true, "first enqueue should report enqueued=true");
    assert(first.duplicate === false, "first enqueue should not be duplicate");
    assert(first.record?.status === "pending", "new row should be pending");
    assert(
      first.record?.recipient_email === normalizeRecipientEmail(TEST_EMAIL),
      "recipient_email should be normalized"
    );
    assert(
      first.record?.metadata?.testRunId === TEST_RUN_ID,
      "metadata should be stored"
    );
    assert(
      new Date(first.record?.scheduled_at).toISOString() === scheduledAt,
      "scheduledAt should be stored"
    );
    assert(first.record?.max_attempts === 3, "maxAttempts should be stored");

    const second = await enqueueEmail({
      idempotencyKey,
      recipientEmail: TEST_EMAIL,
      subject: "Duplicate attempt",
      messageType: "test_email_outbox",
      html: "<p>duplicate</p>",
    });

    assert(second.success === true, "duplicate enqueue should still succeed");
    assert(second.enqueued === false, "duplicate enqueue should report enqueued=false");
    assert(second.duplicate === true, "duplicate enqueue should report duplicate=true");
    assert(second.record?.id === first.record?.id, "duplicate should return existing record");
  } finally {
    await cleanupTestRows([idempotencyKey]);
  }
}

async function main() {
  const requiredEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = requiredEnv.filter((name) => !process.env[name]);

  if (missing.length) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "email_outbox.test.missing_env",
        missing,
      })
    );
    process.exit(1);
  }

  await runValidationTests();
  await runIntegrationTests();

  console.log(
    JSON.stringify({
      level: "info",
      event: "email_outbox.test.passed",
      testRunId: TEST_RUN_ID,
      recipientEmail: TEST_EMAIL,
      resendCalled: false,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "email_outbox.test.failed",
      message: error.message,
      code: error.code || null,
    })
  );
  process.exit(1);
});
