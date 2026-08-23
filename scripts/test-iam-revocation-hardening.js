#!/usr/bin/env node
/**
 * IAM Phase 2B.1 — revocation safety hardening tests.
 * Run: node scripts/test-iam-revocation-hardening.js
 */
import assert from "node:assert/strict";
import {
  clearMemoryRevocations,
  isSessionRevoked,
  extractTokenIssuedAt,
} from "../lib/iam/session-revocation.js";
import { hashSessionToken } from "../lib/iam/security-events.js";
import { REVOCATION_REASONS } from "../lib/iam/revocation-reasons.js";
import {
  revokeCurrentSession,
  revokeAllUserAccess,
} from "../lib/iam/session-revocation-service.js";
import { assertUserAccountAccessAllowed } from "../lib/iam/account-access.js";

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

function makeToken(payload = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      sub: "user-1",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    })
  ).toString("base64url");
  return `${header}.${body}.sig`;
}

function mockSupabase() {
  const sessionRevocations = new Map();
  const userGlobal = new Map();
  const sessionLogs = [];
  const profileByUser = {};

  return {
    sessionRevocations,
    userGlobal,
    sessionLogs,
    profileByUser,
    auth: {
      admin: {
        signOut: async () => ({ data: {}, error: null }),
      },
    },
    from(table) {
      if (table === "iam_session_revocations") {
        return {
          insert(row) {
            if (sessionRevocations.has(row.session_id_hash)) {
              return Promise.resolve({
                error: { message: "duplicate key value violates unique constraint" },
              });
            }
            sessionRevocations.set(row.session_id_hash, row);
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              eq(_col, hash) {
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
              eq(_col, userId) {
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

      if (table === "iam_session_logs") {
        return {
          update(patch) {
            const chain = {
              eq() {
                return chain;
              },
              is: async () => {
                sessionLogs.push({ patch });
                return { error: null };
              },
            };
            return chain;
          },
        };
      }

      if (table === "iam_security_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      if (table === "profiles") {
        return {
          select() {
            return {
              eq(_c, userId) {
                return {
                  maybeSingle: async () => ({
                    data: profileByUser[userId] || { id: userId, account_status: "active" },
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


await test("revokeCurrentSession writes per-session revocation only", async () => {
  clearMemoryRevocations();
  const supabase = mockSupabase();
  const token = makeToken({ iat: Math.floor(Date.now() / 1000) });

  const result = await revokeCurrentSession(supabase, {
    token,
    userId: "user-1",
    reason: REVOCATION_REASONS.USER_LOGOUT,
    endSessionLog: false,
  });

  assert.equal(result.iamRevoked, true);
  assert.equal(supabase.sessionRevocations.size, 1);
  assert.equal(supabase.userGlobal.size, 0);

  const check = await isSessionRevoked(supabase, {
    token,
    tokenIssuedAt: extractTokenIssuedAt(token),
  });
  assert.equal(check.revoked, true);
});

await test("repeated logout is idempotent", async () => {
  clearMemoryRevocations();
  const supabase = mockSupabase();
  const token = makeToken();

  await revokeCurrentSession(supabase, { token, userId: "user-1", endSessionLog: false });
  await revokeCurrentSession(supabase, { token, userId: "user-1", endSessionLog: false });
  assert.equal(supabase.sessionRevocations.size, 1);
});

await test("raw token is not stored in revocation row", async () => {
  clearMemoryRevocations();
  const supabase = mockSupabase();
  const token = makeToken();
  await revokeCurrentSession(supabase, { token, userId: "user-1", endSessionLog: false });
  const row = [...supabase.sessionRevocations.values()][0];
  assert.ok(row.session_id_hash);
  assert.notEqual(row.session_id_hash, token);
  assert.equal(row.session_id_hash, hashSessionToken(token));
});

await test("revokeAllUserAccess writes global cutoff and rejects old token", async () => {
  clearMemoryRevocations();
  const supabase = mockSupabase();
  const oldToken = makeToken({ iat: Math.floor(Date.now() / 1000) - 120 });

  await revokeAllUserAccess(supabase, {
    userId: "user-1",
    actorId: "admin-1",
    reason: REVOCATION_REASONS.ADMIN_FORCE_LOGOUT,
  });

  assert.equal(supabase.userGlobal.size, 1);
  const check = await isSessionRevoked(supabase, {
    token: oldToken,
    userId: "user-1",
    tokenIssuedAt: extractTokenIssuedAt(oldToken),
  });
  assert.equal(check.revoked, true);
  assert.equal(check.reason, "global_force_logout");
});

await test("token issued after global cutoff is allowed", async () => {
  clearMemoryRevocations();
  const supabase = mockSupabase();
  const oldToken = makeToken({ iat: Math.floor(Date.now() / 1000) - 300 });

  await revokeAllUserAccess(supabase, {
    userId: "user-1",
    reason: REVOCATION_REASONS.ADMIN_FORCE_LOGOUT,
  });

  const newToken = makeToken({ iat: Math.floor(Date.now() / 1000) + 5 });
  const check = await isSessionRevoked(supabase, {
    token: newToken,
    userId: "user-1",
    tokenIssuedAt: extractTokenIssuedAt(newToken),
  });
  assert.equal(check.revoked, false);
});

await test("account access blocks banned profile", async () => {
  const supabase = mockSupabase();
  supabase.profileByUser["user-banned"] = { id: "user-banned", account_status: "banned" };
  const result = await assertUserAccountAccessAllowed(supabase, "user-banned", { failClosed: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, "ACCOUNT_ACCESS_BLOCKED");
});

await test("account access allows active profile", async () => {
  const supabase = mockSupabase();
  supabase.profileByUser["user-active"] = { id: "user-active", account_status: "active" };
  const result = await assertUserAccountAccessAllowed(supabase, "user-active", { failClosed: true });
  assert.equal(result.ok, true);
});

await test("per-session revoke does not global-revoke other device tokens", async () => {
  clearMemoryRevocations();
  const supabase = mockSupabase();
  const tokenA = makeToken({ iat: Math.floor(Date.now() / 1000), sid: "a" });
  const tokenB = makeToken({ iat: Math.floor(Date.now() / 1000), sid: "b" });

  await revokeCurrentSession(supabase, { token: tokenA, userId: "user-1", endSessionLog: false });

  const checkA = await isSessionRevoked(supabase, { token: tokenA, tokenIssuedAt: extractTokenIssuedAt(tokenA) });
  const checkB = await isSessionRevoked(supabase, {
    token: tokenB,
    userId: "user-1",
    tokenIssuedAt: extractTokenIssuedAt(tokenB),
  });

  assert.equal(checkA.revoked, true);
  assert.equal(checkB.revoked, false);
});

console.log("\nPhase 2B.1 revocation hardening tests complete.");
