import {
  isIamLocalAuthReadsEnabled,
  isIamLocalAuthShadowEnabled,
} from "./feature-flags.js";
import { AUTH_MODES, resolveAuthModeForRequest } from "./auth-mode-policy.js";
import { isSessionRevoked, extractTokenIssuedAt } from "./session-revocation.js";
import { assertUserAccountAccessAllowed } from "./account-access.js";
import { isIamApiEnabled } from "./feature-flags.js";
import { recordSecurityEvent } from "./security-events.js";
import {
  buildIdentityFromGetUser,
  buildIdentityFromClaims,
  buildMinimalUserFromIdentity,
  compareAuthIdentities,
  decodeJwtHeaderMeta,
} from "./verified-auth-identity.js";

async function runGetUser(supabase, token) {
  const startedAt = Date.now();
  const { data, error } = await supabase.auth.getUser(token);
  return {
    ms: Date.now() - startedAt,
    user: data?.user || null,
    error: error?.message || null,
  };
}

async function runGetClaims(supabase, token) {
  const startedAt = Date.now();
  if (typeof supabase.auth.getClaims !== "function") {
    return { ms: Date.now() - startedAt, claims: null, error: "getClaims_unavailable" };
  }
  try {
    const { data, error } = await supabase.auth.getClaims(token);
    if (error) {
      return { ms: Date.now() - startedAt, claims: null, error: error.message || "getClaims_failed" };
    }
    return { ms: Date.now() - startedAt, claims: data, error: null };
  } catch (err) {
    return { ms: Date.now() - startedAt, claims: null, error: err?.message || "getClaims_failed" };
  }
}

async function runRevocationChecks(supabase, token, userId, tokenIssuedAt) {
  const startedAt = Date.now();
  const pre = await isSessionRevoked(supabase, { token, tokenIssuedAt });
  if (pre.revoked) {
    return { ms: Date.now() - startedAt, revoked: true, reason: pre.reason, phase: "pre" };
  }
  if (userId) {
    const post = await isSessionRevoked(supabase, { token, userId, tokenIssuedAt });
    if (post.revoked) {
      return { ms: Date.now() - startedAt, revoked: true, reason: post.reason, phase: "post" };
    }
  }
  return { ms: Date.now() - startedAt, revoked: false };
}

async function runAccountStatusGate(supabase, userId) {
  const startedAt = Date.now();
  const result = await assertUserAccountAccessAllowed(supabase, userId, {
    failClosed: isIamApiEnabled(),
  });
  return { ms: Date.now() - startedAt, result };
}

function applyAuthTimings(store, partial) {
  if (!store?.timings) return;
  Object.assign(store.timings, partial);
}

async function logShadowMismatch(supabase, details, request) {
  await recordSecurityEvent(supabase, {
    eventType: "iam.auth.shadow_mismatch",
    severity: "warning",
    userId: details.userId || null,
    details: {
      mismatches: details.mismatches || [],
      parity: false,
      route: details.route || null,
    },
    request,
  });
}

function logShadowValidation(payload) {
  console.info(
    "[iam-auth-shadow]",
    JSON.stringify({
      event: "iam_auth_shadow",
      ...payload,
    })
  );
}

/**
 * Resolve authenticated session using mode policy (getUser / shadow getClaims / read getClaims).
 */
export async function resolveVerifiedAuthSession(supabase, token, options = {}) {
  const store = options.store;
  const request = options.request || null;
  const mode = resolveAuthModeForRequest(request, {
    localAuthReadsEnabled: isIamLocalAuthReadsEnabled(),
    localAuthShadowEnabled: isIamLocalAuthShadowEnabled(),
  });

  applyAuthTimings(store, {
    authMode: mode,
    getClaimsMs: 0,
    getUserMs: 0,
    fallbackToGetUser: false,
    shadowParity: null,
    shadowMismatchFields: null,
    revocationMs: 0,
    accountStatusMs: 0,
  });

  if (!token) {
    return { ok: false, status: 401, error: "يجب تسجيل الدخول أولاً" };
  }

  const tokenIssuedAt = extractTokenIssuedAt(token);
  const headerMeta = decodeJwtHeaderMeta(token);

  const preRevocation = await isSessionRevoked(supabase, { token, tokenIssuedAt });
  applyAuthTimings(store, { revocationMs: store?.timings?.revocationMs || 0 });
  if (preRevocation.revoked) {
    return {
      ok: false,
      status: 401,
      error: "تم إنهاء الجلسة",
      revoked: true,
      revokeReason: preRevocation.reason,
    };
  }

  const tryReadClaimsPath = mode === AUTH_MODES.READ_ONLY_GETCLAIMS;
  const runShadow = mode === AUTH_MODES.SHADOW_GETCLAIMS;

  if (tryReadClaimsPath) {
    const claimsResult = await runGetClaims(supabase, token);
    applyAuthTimings(store, { getClaimsMs: claimsResult.ms, authSource: "getClaims" });

    if (!claimsResult.error && claimsResult.claims) {
      const identity = buildIdentityFromClaims(claimsResult.claims, token);
      if (!identity.userId) {
        applyAuthTimings(store, { fallbackToGetUser: true });
      } else {
        const claimsObj = claimsResult.claims?.claims || claimsResult.claims || {};
        const revocation = await runRevocationChecks(
          supabase,
          token,
          identity.userId,
          tokenIssuedAt
        );
        applyAuthTimings(store, {
          revocationMs: (store.timings.revocationMs || 0) + revocation.ms,
        });
        if (revocation.revoked) {
          return {
            ok: false,
            status: 401,
            error: "تم إنهاء الجلسة",
            revoked: true,
            revokeReason: revocation.reason,
          };
        }

        const account = await runAccountStatusGate(supabase, identity.userId);
        applyAuthTimings(store, { accountStatusMs: account.ms });
        if (!account.result.ok) {
          return {
            ok: false,
            status: account.result.status || 403,
            error: account.result.error,
            code: account.result.code,
            accountBlocked: true,
          };
        }

        const user = buildMinimalUserFromIdentity(identity, claimsObj.email || null);
        return {
          ok: true,
          user,
          supabase,
          token,
          identity,
          authMode: mode,
          authSource: "getClaims",
        };
      }
    }

    applyAuthTimings(store, {
      fallbackToGetUser: true,
      getClaimsFailure: claimsResult.error || "claims_invalid",
    });
  }

  const getUserResult = await runGetUser(supabase, token);
  applyAuthTimings(store, {
    getUserMs: (store.timings.getUserMs || 0) + getUserResult.ms,
    authSource: tryReadClaimsPath && store.timings.fallbackToGetUser ? "getUser_fallback" : "getUser",
  });

  if (getUserResult.error || !getUserResult.user) {
    return { ok: false, status: 401, error: "جلسة غير صالحة" };
  }

  const user = getUserResult.user;
  const getUserIdentity = buildIdentityFromGetUser(user, token, "getUser");

  const postRevocation = await runRevocationChecks(supabase, token, user.id, tokenIssuedAt);
  applyAuthTimings(store, {
    revocationMs: (store.timings.revocationMs || 0) + postRevocation.ms,
  });
  if (postRevocation.revoked) {
    return {
      ok: false,
      status: 401,
      error: "تم إنهاء الجلسة",
      revoked: true,
      revokeReason: postRevocation.reason,
    };
  }

  const account = await runAccountStatusGate(supabase, user.id);
  applyAuthTimings(store, { accountStatusMs: account.ms });
  if (!account.result.ok) {
    return {
      ok: false,
      status: account.result.status || 403,
      error: account.result.error,
      code: account.result.code,
      accountBlocked: true,
    };
  }

  if (runShadow) {
    const claimsResult = await runGetClaims(supabase, token);
    applyAuthTimings(store, {
      getClaimsMs: claimsResult.ms,
      jwtAlg: headerMeta?.alg || null,
      jwtKidPresent: Boolean(headerMeta?.kid),
    });

    if (!claimsResult.error && claimsResult.claims) {
      const claimsIdentity = buildIdentityFromClaims(claimsResult.claims, token);
      const comparison = compareAuthIdentities(getUserIdentity, claimsIdentity);
      applyAuthTimings(store, {
        shadowParity: comparison.parity,
        shadowMismatchFields: comparison.mismatches.length ? comparison.mismatches : null,
      });

      if (!comparison.parity) {
        logShadowValidation({
          parity: false,
          mismatches: comparison.mismatches,
          route: request?.url ? new URL(request.url).pathname : null,
          getUserMs: getUserResult.ms,
          getClaimsMs: claimsResult.ms,
          fallback: false,
          reason: "identity_mismatch",
        });
        await logShadowMismatch(
          supabase,
          {
            userId: user.id,
            mismatches: comparison.mismatches,
            route: request?.url ? new URL(request.url).pathname : null,
          },
          request
        );
      } else {
        logShadowValidation({
          parity: true,
          route: request?.url ? new URL(request.url).pathname : null,
          getUserMs: getUserResult.ms,
          getClaimsMs: claimsResult.ms,
          fallback: false,
          reason: null,
        });
      }
    } else {
      applyAuthTimings(store, {
        shadowParity: null,
        shadowClaimsFailure: claimsResult.error || "shadow_failed",
      });
      logShadowValidation({
        parity: null,
        route: request?.url ? new URL(request.url).pathname : null,
        getUserMs: getUserResult.ms,
        getClaimsMs: claimsResult.ms,
        fallback: false,
        reason: claimsResult.error || "getClaims_failed",
      });
    }
  }

  return {
    ok: true,
    user,
    supabase,
    token,
    identity: getUserIdentity,
    authMode: mode,
    authSource: store?.timings?.authSource || "getUser",
  };
}

export { AUTH_MODES };
