#!/usr/bin/env node
/**
 * IAM Phase 2B.2 — getClaims shadow / read-only rollout tests.
 * Run: node scripts/test-iam-getclaims-rollout.js
 */
import assert from "node:assert/strict";
import {
  AUTH_MODES,
  resolveAuthModeForRequest,
  isReadSafeAdminRoute,
  isSensitiveAdminRoute,
  __matchReadSafeRoute,
} from "../lib/iam/auth-mode-policy.js";
import {
  buildIdentityFromClaims,
  buildIdentityFromGetUser,
  compareAuthIdentities,
  decodeJwtHeaderMeta,
} from "../lib/iam/verified-auth-identity.js";
import {
  isIamLocalAuthReadsEnabled,
  isIamLocalAuthShadowEnabled,
} from "../lib/iam/feature-flags.js";
import { clearMemoryRevocations, isSessionRevoked } from "../lib/iam/session-revocation.js";
import { resolveVerifiedAuthSession } from "../lib/iam/auth-verification.js";

const ENV_BACKUP = { ...process.env };

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}:`, error.message);
      process.exitCode = 1;
    }
  })();
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_BACKUP)) delete process.env[key];
  }
  Object.assign(process.env, ENV_BACKUP);
}

function makeToken(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "kid-1" })).toString(
    "base64url"
  );
  const body = Buffer.from(
    JSON.stringify({
      sub: "11111111-1111-1111-1111-111111111111",
      role: "authenticated",
      iss: "https://example.supabase.co/auth/v1",
      aud: "authenticated",
      session_id: "sess-1",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: "admin@test.com",
      ...payload,
    })
  ).toString("base64url");
  return `${header}.${body}.sig`;
}

function mockRequest(method, pathname) {
  return { method, url: `https://example.com${pathname}` };
}

await test("read-safe GET email-outbox classified", () => {
  assert.equal(__matchReadSafeRoute("/api/admin/email-outbox", "GET"), true);
  assert.equal(isSensitiveAdminRoute("/api/admin/email-outbox", "GET"), false);
});

await test("audience-counts is read-safe not sensitive", () => {
  assert.equal(__matchReadSafeRoute("/api/admin/email-campaigns/audience-counts", "GET"), true);
  assert.equal(isSensitiveAdminRoute("/api/admin/email-campaigns/audience-counts", "GET"), false);
});

await test("POST launch is authoritative getUser", () => {
  const mode = resolveAuthModeForRequest(
    mockRequest("POST", "/api/admin/email-campaigns/abc/launch"),
    { localAuthReadsEnabled: true, localAuthShadowEnabled: true }
  );
  assert.equal(mode, AUTH_MODES.AUTHORITATIVE_GETUSER);
});

await test("GET launch path snippet not in read list", () => {
  const mode = resolveAuthModeForRequest(
    mockRequest("GET", "/api/admin/email-campaigns/abc/launch"),
    { localAuthReadsEnabled: true, localAuthShadowEnabled: true }
  );
  assert.equal(mode, AUTH_MODES.AUTHORITATIVE_GETUSER);
});

await test("unlisted GET defaults to getUser", () => {
  const mode = resolveAuthModeForRequest(mockRequest("GET", "/api/admin/partners"), {
    localAuthReadsEnabled: true,
    localAuthShadowEnabled: true,
  });
  assert.equal(mode, AUTH_MODES.AUTHORITATIVE_GETUSER);
});

await test("shadow mode when reads disabled", () => {
  const mode = resolveAuthModeForRequest(mockRequest("GET", "/api/admin/email-outbox"), {
    localAuthReadsEnabled: false,
    localAuthShadowEnabled: true,
  });
  assert.equal(mode, AUTH_MODES.SHADOW_GETCLAIMS);
});

await test("read mode when reads enabled", () => {
  const mode = resolveAuthModeForRequest(mockRequest("GET", "/api/admin/email-campaigns"), {
    localAuthReadsEnabled: true,
    localAuthShadowEnabled: true,
  });
  assert.equal(mode, AUTH_MODES.READ_ONLY_GETCLAIMS);
});

await test("identity parity matching sub/session/role", () => {
  const token = makeToken();
  const user = { id: "11111111-1111-1111-1111-111111111111", email: "admin@test.com", role: "authenticated" };
  const a = buildIdentityFromGetUser(user, token);
  const b = buildIdentityFromClaims({ claims: JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) }, token);
  const cmp = compareAuthIdentities(a, b);
  assert.equal(cmp.parity, true);
});

await test("identity mismatch detected", () => {
  const token = makeToken();
  const user = { id: "other-user", email: "x@test.com" };
  const a = buildIdentityFromGetUser(user, token);
  const b = buildIdentityFromClaims({ claims: JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) }, token);
  const cmp = compareAuthIdentities(a, b);
  assert.equal(cmp.parity, false);
  assert.ok(cmp.mismatches.includes("userId"));
});

await test("JWT header decode exposes alg/kid without token body leak", () => {
  const token = makeToken();
  const meta = decodeJwtHeaderMeta(token);
  assert.equal(meta.alg, "ES256");
  assert.equal(meta.kid, "kid-1");
});

await test("read mode uses getClaims without getUser on success", async () => {
  clearMemoryRevocations();
  restoreEnv();
  process.env.IAM_API = "true";
  process.env.IAM_LOCAL_AUTH_READS_ENABLED = "true";
  process.env.IAM_LOCAL_AUTH_SHADOW_ENABLED = "false";

  const token = makeToken();
  let getUserCalls = 0;
  let getClaimsCalls = 0;

  const supabase = {
    auth: {
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: { id: "11111111-1111-1111-1111-111111111111", email: "a@test.com" } }, error: null };
      },
      getClaims: async () => {
        getClaimsCalls += 1;
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        return { data: { claims: payload, header: { alg: "ES256" } }, error: null };
      },
    },
    from(table) {
      if (table === "iam_session_revocations") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      if (table === "iam_user_session_revocations") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "11111111-1111-1111-1111-111111111111", account_status: "active" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "iam_security_events") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected ${table}`);
    },
  };

  const result = await resolveVerifiedAuthSession(supabase, token, {
    request: mockRequest("GET", "/api/admin/email-outbox"),
    store: { timings: {} },
  });

  assert.equal(result.ok, true);
  assert.equal(result.authSource, "getClaims");
  assert.equal(getClaimsCalls, 1);
  assert.equal(getUserCalls, 0);
  restoreEnv();
});

await test("revoked token denied in read mode", async () => {
  clearMemoryRevocations();
  const token = makeToken();
  const { revokeSessionToken } = await import("../lib/iam/session-revocation.js");
  await revokeSessionToken(null, { token, userId: "11111111-1111-1111-1111-111111111111", reason: "user_logout" });

  const supabase = {
    auth: {
      getClaims: async () => {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        return { data: { claims: payload }, error: null };
      },
    },
  };

  const check = await isSessionRevoked(supabase, { token });
  assert.equal(check.revoked, true);

  const denied = await resolveVerifiedAuthSession(supabase, token, {
    request: mockRequest("GET", "/api/admin/email-outbox"),
    store: { timings: {} },
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 401);
});

await test("feature flags default shadow on when IAM_API", () => {
  restoreEnv();
  process.env.IAM_API = "true";
  delete process.env.IAM_LOCAL_AUTH_SHADOW_ENABLED;
  delete process.env.IAM_LOCAL_AUTH_READS_ENABLED;
  assert.equal(isIamLocalAuthShadowEnabled(), true);
  assert.equal(isIamLocalAuthReadsEnabled(), false);
  restoreEnv();
});

console.log("\nPhase 2B.2 getClaims rollout tests complete.");
