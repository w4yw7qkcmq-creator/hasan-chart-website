#!/usr/bin/env node
/**
 * Turnstile client-side error telemetry validation and route contract.
 * Run: node --test scripts/test-turnstile-client-telemetry.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  detectBrowserFamily,
  normalizeTurnstileClientErrorCode,
  parseTurnstileClientTelemetryPayload,
  TURNSTILE_CLIENT_ERROR_EVENT,
  TURNSTILE_REGISTER_ACTION,
} from "../lib/security/turnstile-client-telemetry.js";

describe("Turnstile client error code normalization", () => {
  it("accepts known Cloudflare numeric error codes", () => {
    assert.equal(normalizeTurnstileClientErrorCode(110200), "110200");
    assert.equal(normalizeTurnstileClientErrorCode("200500"), "200500");
    assert.equal(normalizeTurnstileClientErrorCode("300010"), "300010");
  });

  it("rejects arbitrary strings and secrets-like values", () => {
    assert.equal(normalizeTurnstileClientErrorCode("not-a-code"), null);
    assert.equal(normalizeTurnstileClientErrorCode("password123"), null);
    assert.equal(normalizeTurnstileClientErrorCode("0xSECRET"), null);
    assert.equal(normalizeTurnstileClientErrorCode(""), null);
    assert.equal(normalizeTurnstileClientErrorCode(null), null);
  });
});

describe("Turnstile client telemetry payload parsing", () => {
  it("accepts whitelisted schema only", () => {
    const parsed = parseTurnstileClientTelemetryPayload({
      event: TURNSTILE_CLIENT_ERROR_EVENT,
      code: "110200",
      action: TURNSTILE_REGISTER_ACTION,
      browserFamily: "chrome",
      clientReportId: "abc1234567890abcd",
    });

    assert.equal(parsed.ok, true);
    assert.equal(parsed.payload.code, "110200");
    assert.equal(parsed.payload.action, "register");
    assert.equal(parsed.payload.browserFamily, "chrome");
    assert.equal(parsed.payload.clientReportId, "abc1234567890abcd");
    assert.match(parsed.payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects arbitrary payload fields from being forwarded", () => {
    const parsed = parseTurnstileClientTelemetryPayload({
      event: TURNSTILE_CLIENT_ERROR_EVENT,
      code: "110200",
      action: TURNSTILE_REGISTER_ACTION,
      email: "user@example.com",
      password: "secret",
      token: "turnstile-token",
      message: "free text log injection",
    });

    assert.equal(parsed.ok, true);
    assert.equal(parsed.payload.email, undefined);
    assert.equal(parsed.payload.password, undefined);
    assert.equal(parsed.payload.token, undefined);
    assert.equal(parsed.payload.message, undefined);
  });

  it("rejects invalid event/action/code combinations", () => {
    assert.equal(parseTurnstileClientTelemetryPayload(null).ok, false);
    assert.equal(
      parseTurnstileClientTelemetryPayload({
        event: "custom_event",
        code: "110200",
        action: "register",
      }).ok,
      false
    );
    assert.equal(
      parseTurnstileClientTelemetryPayload({
        event: TURNSTILE_CLIENT_ERROR_EVENT,
        code: "110200",
        action: "login",
      }).ok,
      false
    );
    assert.equal(
      parseTurnstileClientTelemetryPayload({
        event: TURNSTILE_CLIENT_ERROR_EVENT,
        code: "bad",
        action: TURNSTILE_REGISTER_ACTION,
      }).ok,
      false
    );
  });
});

describe("Register widget client capture contract", () => {
  it("error-callback receives errorCode and clears token path remains", () => {
    const source = readFileSync(join(process.cwd(), "app/(app)/register/page.js"), "utf8");
    assert.match(source, /"error-callback":\s*\(errorCode\)\s*=>/);
    assert.match(source, /reportTurnstileClientError\(errorCode/);
    assert.match(source, /setTurnstileToken\(""\)/);
    assert.match(source, /\/api\/telemetry\/turnstile-client-error/);
  });
});

describe("Telemetry route contract", () => {
  it("logs TurnstileClient challenge error without token fields", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/telemetry/turnstile-client-error/route.js"),
      "utf8"
    );
    assert.match(source, /\[TurnstileClient\] challenge error/);
    assert.match(source, /parseTurnstileClientTelemetryPayload/);
    assert.match(source, /rate_limited/);
    assert.doesNotMatch(source, /turnstileToken|password|email|secret/i);
  });
});

describe("Browser family detection", () => {
  it("detects common mobile families safely", () => {
    assert.equal(
      detectBrowserFamily(
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36"
      ),
      "chrome"
    );
    assert.equal(
      detectBrowserFamily(
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 SamsungBrowser/24.0 Chrome/122.0.0.0 Mobile Safari/537.36"
      ),
      "samsung_internet"
    );
  });
});

console.log("Turnstile client telemetry tests loaded");
