#!/usr/bin/env node
/**
 * Regression: register route isolates HV persistence from risk-signal capture failures.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const routePath = join(dirname(fileURLToPath(import.meta.url)), "../app/api/auth/register/route.js");
const source = readFileSync(routePath, "utf8");

describe("register signup post-processing isolation", () => {
  it("logs HV persistence failures separately from risk signal capture", () => {
    assert.match(source, /Signup human verification persistence failed/);
    assert.match(source, /Signup risk signal capture failed/);
    assert.match(source, /catch \(hvError\)/);
    assert.match(source, /catch \(signalError\)/);
    assert.doesNotMatch(
      source,
      /catch \(hvError\)[\s\S]*recordSignupRiskSignals[\s\S]*catch \(signalError\)/
    );
  });

  it("keeps Turnstile verification fail-closed before signup", () => {
    const turnstileIdx = source.indexOf("verifyTurnstileTokenServer");
    const signUpIdx = source.indexOf("supabase.auth.signUp");
    assert.ok(turnstileIdx > 0 && signUpIdx > turnstileIdx);
  });
});
