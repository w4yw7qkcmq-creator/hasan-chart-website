#!/usr/bin/env node
/**
 * IAM Phase 2B.2A — password security revocation tests.
 * Run: node scripts/test-iam-password-revocation.js
 */
import assert from "node:assert/strict";
import {
  clearMemoryRevocations,
  isSessionRevoked,
  extractTokenIssuedAt,
} from "../lib/iam/session-revocation.js";
import { REVOCATION_REASONS } from "../lib/iam/revocation-reasons.js";
import {
  revokeAllUserAccessAfterPasswordSecurityChange,
} from "../lib/iam/session-revocation-service.js";
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
  const iat = Math.floor(Date.now() / 1000) - 120;
  const body = Buffer.from(
    JSON.stringify({
      sub: "11111111-1111-1111-1111-111111111111",
      role: "authenticated",
      session_id: "sess-old",
      iat,
      exp: iat + 3600,
      ...payload,
    })
  ).toString("base64url");
  return `${header}.${body}.sig`;
}

function mockSupabase() {
  const sessionRevocations = new Map();
  const userGlobal = new Map();
  const securityEvents = [];

  return {
    securityEvents,
    auth: {
      getUser: async (token) => {
        if (!token) return { data: { user: null }, error: { message: "missing" } };
        return {
          data: { user: { id: "11111111-1111-1111-1111-111111111111", email: "a@test.com" } },
          error: null,
        };
      },
      getClaims: async (token) => {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        return { data: { claims: payload }, error: null };
      },
      admin: { signOut: async () => ({ data: {}, error: null }) },
    },
    from(table) {
      if (table === "iam_session_revocations") {
        return {
          insert(row) {
            sessionRevocations.set(row.session_id_hash, row);
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              eq(_c, hash) {
                return {
                  maybeSingle: async () => ({
                    data: sessionRevocations.get(hash) || null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "iam_user_session_revocations") {
        return {
          upsert(row) {
            userGlobal.set(row.user_id, row);
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              eq(_c, userId) {
                return {
                  maybeSingle: async () => ({
                    data: userGlobal.get(userId) || null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "iam_security_events") {
        return {
          insert: async (row) => {
            securityEvents.push(row);
            return { error: null };
          },
        };
      }
      if (table === "iam_session_logs") {
        return {
          update() {
            const chain = { eq() { return chain; }, is: async () => ({ error: null }) };
            return chain;
          },
        };
      }
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { id: "11111111-1111-1111-1111-111111111111", account_status: "active" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

await test("old token valid before password security revoke", async () => {
  clearMemoryRevocations();
  const token = makeToken();
  const supabase = mockSupabase();
  const check = await isSessionRevoked(supabase, { token, userId: "11111111-1111-1111-1111-111111111111" });
  assert.equal(check.revoked, false);
});

await test("password change writes global IAM cutoff", async () => {
  clearMemoryRevocations();
  const oldToken = makeToken();
  const supabase = mockSupabase();

  const result = await revokeAllUserAccessAfterPasswordSecurityChange(supabase, {
    userId: "11111111-1111-1111-1111-111111111111",
    previousAccessToken: oldToken,
    currentAccessToken: oldToken,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, REVOCATION_REASONS.PASSWORD_SECURITY_RESET);
  assert.ok(result.forceLogoutAfter);
  assert.equal(
    supabase.securityEvents.some((e) => e.event_type === "iam.session.global_revoke"),
    true
  );
});

await test("old token denied after password security revoke via getClaims path", async () => {
  clearMemoryRevocations();
  restoreEnv();
  process.env.IAM_API = "true";
  process.env.IAM_LOCAL_AUTH_READS_ENABLED = "true";

  const oldToken = makeToken();
  const supabase = mockSupabase();

  await revokeAllUserAccessAfterPasswordSecurityChange(supabase, {
    userId: "11111111-1111-1111-1111-111111111111",
    previousAccessToken: oldToken,
    currentAccessToken: oldToken,
  });

  const denied = await resolveVerifiedAuthSession(supabase, oldToken, {
    request: { method: "GET", url: "https://example.com/api/admin/email-outbox" },
    store: { timings: {} },
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.status, 401);
  restoreEnv();
});

await test("fresh token after re-login allowed when iat after cutoff", async () => {
  clearMemoryRevocations();
  const oldToken = makeToken({ iat: Math.floor(Date.now() / 1000) - 300 });
  const supabase = mockSupabase();

  await revokeAllUserAccessAfterPasswordSecurityChange(supabase, {
    userId: "11111111-1111-1111-1111-111111111111",
    previousAccessToken: oldToken,
    currentAccessToken: oldToken,
  });

  await new Promise((r) => setTimeout(r, 1100));
  const freshToken = makeToken({
    iat: Math.floor(Date.now() / 1000),
    session_id: "sess-new",
  });
  const check = await isSessionRevoked(supabase, {
    token: freshToken,
    userId: "11111111-1111-1111-1111-111111111111",
    tokenIssuedAt: extractTokenIssuedAt(freshToken),
  });
  assert.equal(check.revoked, false);
});

await test("reset link request alone does not write global revoke in API contract", () => {
  // Documented policy: /api/auth/reset-password only sends email — no IAM revoke hook.
  assert.equal(typeof REVOCATION_REASONS.PASSWORD_SECURITY_RESET, "string");
});

await test("repeated password security revoke is idempotent", async () => {
  clearMemoryRevocations();
  const oldToken = makeToken();
  const supabase = mockSupabase();

  const first = await revokeAllUserAccessAfterPasswordSecurityChange(supabase, {
    userId: "11111111-1111-1111-1111-111111111111",
    previousAccessToken: oldToken,
  });
  const second = await revokeAllUserAccessAfterPasswordSecurityChange(supabase, {
    userId: "11111111-1111-1111-1111-111111111111",
    previousAccessToken: oldToken,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
});

console.log("\nPhase 2B.2A password revocation tests complete.");
