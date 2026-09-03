#!/usr/bin/env node
/**
 * Turnstile registration token lifecycle (mark-after-verify, replay, action).
 * Run: node --test scripts/test-turnstile-token-lifecycle.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, beforeEach, afterEach } from "node:test";
import { verifyTurnstileTokenServer } from "../lib/security/turnstile-server.js";

const ENV_KEYS = ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"];
const TEST_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const TEST_SECRET = "1x0000000000000000000000000000000AA";
const PROD_LIKE_SECRET = "0x0000000000000000000000000000000AA";

function saveEnv() {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function clearUsedTokens() {
  if (globalThis.__turnstileUsedTokens) globalThis.__turnstileUsedTokens.clear();
}

describe("Turnstile token lifecycle", () => {
  let envSnapshot;
  let originalFetch;

  beforeEach(() => {
    envSnapshot = saveEnv();
    clearUsedTokens();
    originalFetch = globalThis.fetch;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    clearUsedTokens();
    globalThis.fetch = originalFetch;
  });

  it("marks token used only after successful test-mode verification", async () => {
    process.env.TURNSTILE_SECRET_KEY = TEST_SECRET;

    const first = await verifyTurnstileTokenServer({
      token: TEST_DUMMY_TOKEN,
      remoteIp: "203.0.113.1",
      expectedAction: "register",
    });
    assert.equal(first.ok, true);

    const replay = await verifyTurnstileTokenServer({
      token: TEST_DUMMY_TOKEN,
      remoteIp: "203.0.113.1",
      expectedAction: "register",
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.replay, true);
  });

  it("does not mark token when test-mode token is invalid", async () => {
    process.env.TURNSTILE_SECRET_KEY = TEST_SECRET;

    const invalid = await verifyTurnstileTokenServer({
      token: "bad-token",
      remoteIp: "203.0.113.1",
      expectedAction: "register",
    });
    assert.equal(invalid.ok, false);

    const retry = await verifyTurnstileTokenServer({
      token: "bad-token",
      remoteIp: "203.0.113.1",
      expectedAction: "register",
    });
    assert.equal(retry.ok, false);
    assert.notEqual(retry.replay, true);
  });

  it("does not mark token on fetch/network failure", async () => {
    process.env.TURNSTILE_SECRET_KEY = PROD_LIKE_SECRET;

    globalThis.fetch = async () => {
      throw new Error("network error");
    };

    const failed = await verifyTurnstileTokenServer({
      token: "cf-token-network-fail",
      remoteIp: "203.0.113.2",
      expectedAction: "register",
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.timeout, true);
    assert.equal(isTokenStored("cf-token-network-fail", "register:203.0.113.2"), false);

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        hostname: "hasanchartworld.com",
        action: "register",
      }),
    });

    const retry = await verifyTurnstileTokenServer({
      token: "cf-token-network-fail",
      remoteIp: "203.0.113.2",
      expectedAction: "register",
    });
    assert.equal(retry.ok, true);
    assert.notEqual(retry.replay, true);
  });

  it("does not mark token when Cloudflare returns failure", async () => {
    process.env.TURNSTILE_SECRET_KEY = PROD_LIKE_SECRET;

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    });

    const failed = await verifyTurnstileTokenServer({
      token: "cf-token-rejected",
      remoteIp: "203.0.113.3",
      expectedAction: "register",
    });
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.codes, ["invalid-input-response"]);
    assert.equal(isTokenStored("cf-token-rejected", "register:203.0.113.3"), false);

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        hostname: "hasanchartworld.com",
        action: "register",
      }),
    });

    const retry = await verifyTurnstileTokenServer({
      token: "cf-token-rejected",
      remoteIp: "203.0.113.3",
      expectedAction: "register",
    });
    assert.equal(retry.ok, true);
  });

  it("rejects replay after successful production verification", async () => {
    process.env.TURNSTILE_SECRET_KEY = PROD_LIKE_SECRET;

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        hostname: "hasanchartworld.com",
        action: "register",
      }),
    });

    const first = await verifyTurnstileTokenServer({
      token: "cf-token-replay",
      remoteIp: "203.0.113.4",
      expectedAction: "register",
    });
    assert.equal(first.ok, true);

    const replay = await verifyTurnstileTokenServer({
      token: "cf-token-replay",
      remoteIp: "203.0.113.4",
      expectedAction: "register",
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.replay, true);
  });

  it("returns action_mismatch without marking token", async () => {
    process.env.TURNSTILE_SECRET_KEY = PROD_LIKE_SECRET;

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        hostname: "hasanchartworld.com",
        action: "login",
      }),
    });

    const mismatch = await verifyTurnstileTokenServer({
      token: "cf-token-action-mismatch",
      remoteIp: "203.0.113.5",
      expectedAction: "register",
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.reason, "action_mismatch");
    assert.equal(isTokenStored("cf-token-action-mismatch", "register:203.0.113.5"), false);
  });
});

describe("Turnstile registration widget contract", () => {
  it("register page widget uses action register", () => {
    const source = readFileSync(join(process.cwd(), "app/(app)/register/page.js"), "utf8");
    assert.match(source, /action:\s*"register"/);
    assert.match(source, /"timeout-callback"/);
    assert.match(source, /setTurnstileToken\(""\)/);
  });

  it("register API expects register action", () => {
    const source = readFileSync(join(process.cwd(), "app/api/auth/register/route.js"), "utf8");
    assert.match(source, /expectedAction:\s*"register"/);
    assert.match(source, /\[Turnstile\] Registration verification failed/);
  });
});

function isTokenStored(token, replayScope) {
  const key = `${replayScope}:${token}`;
  return Boolean(globalThis.__turnstileUsedTokens?.has(key));
}

console.log("Turnstile token lifecycle tests loaded");
