#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveUserClassificationSignals,
  USER_CLASSIFICATION,
} from "../lib/user-classification.js";

test("explicit E2E fixture metadata", () => {
  const result = resolveUserClassificationSignals(
    { email: "smoke-e2e-user@e2e.hasanchartworld.test", username: "smoke-e2e-user" },
    { user_metadata: { e2e: true, smoke_test: true } }
  );
  assert.equal(result.classification, USER_CLASSIFICATION.E2E);
});

test("known test domain without e2e prefix => TEST", () => {
  const result = resolveUserClassificationSignals({
    email: "p-a-1783266372203@test.local",
    username: "PartnerA1783266372203",
  });
  assert.equal(result.classification, USER_CLASSIFICATION.TEST);
});

test("e2e-pay on test.local => E2E (e2e prefix wins)", () => {
  const result = resolveUserClassificationSignals({
    email: "e2e-pay-123@test.local",
    username: "PayE2E123",
  });
  assert.equal(result.classification, USER_CLASSIFICATION.E2E);
});

test("normal production user without test signals is not TEST", () => {
  const result = resolveUserClassificationSignals({
    email: "user@gmail.com",
    username: "ahmad_trader",
    created_at: "2025-01-01T00:00:00Z",
    last_sign_in_at: "2026-01-01T00:00:00Z",
  });
  assert.notEqual(result.classification, USER_CLASSIFICATION.TEST);
  assert.notEqual(result.classification, USER_CLASSIFICATION.E2E);
});

test("ambiguous username stays UNKNOWN or SUSPECTED not REAL-only-by-default", () => {
  const result = resolveUserClassificationSignals({
    email: "someone@gmail.com",
    username: "ProdA991",
  });
  assert.ok(
    result.classification === USER_CLASSIFICATION.SUSPECTED ||
      result.classification === USER_CLASSIFICATION.UNKNOWN
  );
});

test("admin on non-test domain => INTERNAL", () => {
  const result = resolveUserClassificationSignals({
    email: "admin@hasanchartworld.com",
    username: "admin_main",
    role: "admin",
  });
  assert.equal(result.classification, USER_CLASSIFICATION.INTERNAL);
});

console.log("admin user classification tests scheduled");
