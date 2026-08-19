import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  PRODUCTION_TEST_RECIPIENT_BLOCKED_EVENT,
  isProductionEmailEnvironment,
  isBlockedProductionRecipientEmail,
  blockProductionTestRecipientSend,
} = require("../lib/email-recipient-guard.cjs");

const productionEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://lzgsxdsumnteuwtjfqlm.supabase.co",
  NODE_ENV: "production",
};

const stagingEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://tvkhuijufhnpqpchkyss.supabase.co",
  NODE_ENV: "development",
  HC_ENVIRONMENT: "staging",
};

test("detects production email environment from Supabase project ref", () => {
  assert.equal(isProductionEmailEnvironment(productionEnv), true);
  assert.equal(isProductionEmailEnvironment(stagingEnv), false);
});

test("blocks known test/staging recipient domains in production", () => {
  for (const email of [
    "qa@staging-hcw.test",
    "user@test.local",
    "demo@example.com",
    "vip@vip-staging-test.invalid",
    "bot@e2e.hasanchartworld.test",
  ]) {
    assert.equal(isBlockedProductionRecipientEmail(email, productionEnv), true, email);
  }
});

test("allows real recipient domains in production", () => {
  assert.equal(
    isBlockedProductionRecipientEmail("member@gmail.com", productionEnv),
    false
  );
  assert.equal(
    isBlockedProductionRecipientEmail("support@hasanchartworld.com", productionEnv),
    false
  );
});

test("does not block staging recipients outside production runtime", () => {
  const blocked = blockProductionTestRecipientSend({
    path: "test",
    to: "qa@staging-hcw.test",
    env: stagingEnv,
  });

  assert.equal(blocked, null);
});

test("blocks production sends to test recipients with structured reason", () => {
  const blocked = blockProductionTestRecipientSend({
    path: "scripts/test-email-recipient-guard.js",
    to: ["qa@staging-hcw.test", "member@gmail.com"],
    env: productionEnv,
  });

  assert.equal(blocked?.skipped, true);
  assert.equal(blocked?.reason, PRODUCTION_TEST_RECIPIENT_BLOCKED_EVENT);
  assert.deepEqual(blocked?.blockedDomains, ["staging-hcw.test"]);
});

test("resend website guard integration skips network send for test recipients", async () => {
  const previous = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };

  process.env.NEXT_PUBLIC_SUPABASE_URL = productionEnv.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NODE_ENV = productionEnv.NODE_ENV;

  try {
    const { sendWebsiteResendEmail } = await import("../lib/resend-website.js");

    const outcome = await sendWebsiteResendEmail({
      path: "scripts/test-email-recipient-guard.js",
      resendApiKey: "re_test_key_should_not_be_used",
      payload: {
        from: "HasaN CharT World <support@hasanchartworld.com>",
        to: ["qa@staging-hcw.test"],
        subject: "guard test",
        html: "<p>test</p>",
      },
    });

    assert.equal(outcome.skipped, true);
    assert.equal(outcome.reason, PRODUCTION_TEST_RECIPIENT_BLOCKED_EVENT);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = previous.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NODE_ENV = previous.NODE_ENV;
  }
});
