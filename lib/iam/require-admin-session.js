import { cookies } from "next/headers";
import { resolveIamContext } from "./resolve-permissions.js";
import { IAM_DEFAULT_ORGANIZATION_ID } from "./constants.js";
import { isSessionRevoked, extractTokenIssuedAt } from "./session-revocation.js";
import { touchAdminSessionActivity } from "./session-log.js";
import { isIamApiEnabled } from "./feature-flags.js";
import {
  hasActiveIamAssignment,
  humanAdminAllowed,
  assignmentRequiredResponse,
  resolverUnavailableResponse,
} from "./assignment-enforcement.js";
import { recordSecurityEvent } from "./security-events.js";
import {
  adminSessionCacheKey,
  getRequestIamStore,
  getRequestSupabaseAdmin,
  iamContextCacheKey,
  memoizeRequestPromise,
} from "./request-context.js";

async function resolveAuthenticatedSessionInternal() {
  const store = await getRequestIamStore();

  if (!store.authenticatedSessionPromise) {
    store.authenticatedSessionPromise = (async () => {
      const startedAt = Date.now();
      const supabase = await getRequestSupabaseAdmin();
      const cookieStore = await cookies();
      const token = cookieStore.get("hc_access_token")?.value;

      if (!token) {
        store.timings.authSessionMs = Date.now() - startedAt;
        return {
          ok: false,
          status: 401,
          error: "يجب تسجيل الدخول أولاً",
        };
      }

      const tokenIssuedAt = extractTokenIssuedAt(token);

      const revocation = await isSessionRevoked(supabase, {
        token,
        tokenIssuedAt,
      });

      if (revocation.revoked) {
        store.timings.authSessionMs = Date.now() - startedAt;
        return {
          ok: false,
          status: 401,
          error: "تم إنهاء الجلسة",
          revoked: true,
          revokeReason: revocation.reason,
        };
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !user) {
        store.timings.authSessionMs = Date.now() - startedAt;
        return {
          ok: false,
          status: 401,
          error: "جلسة غير صالحة",
        };
      }

      const userRevocation = await isSessionRevoked(supabase, {
        token,
        userId: user.id,
        tokenIssuedAt,
      });

      if (userRevocation.revoked) {
        store.timings.authSessionMs = Date.now() - startedAt;
        return {
          ok: false,
          status: 401,
          error: "تم إنهاء الجلسة",
          revoked: true,
          revokeReason: userRevocation.reason,
        };
      }

      store.timings.authSessionMs = Date.now() - startedAt;
      return { ok: true, user, supabase, token };
    })();
  }

  return store.authenticatedSessionPromise;
}

async function resolveIamContextForRequest(supabase, user, organizationId) {
  const store = await getRequestIamStore();
  const key = iamContextCacheKey(user?.id, organizationId);

  return memoizeRequestPromise(store, store.iamContextPromises, key, async () => {
    const startedAt = Date.now();
    try {
      const iam = await resolveIamContext(supabase, user, { organizationId });
      store.timings.iamResolveMs = Date.now() - startedAt;
      return iam;
    } catch (err) {
      store.timings.iamResolveMs = Date.now() - startedAt;
      throw err;
    }
  });
}

async function touchSessionOnce(supabase, token, userId) {
  const store = await getRequestIamStore();
  if (store.sessionTouchDone) return;

  if (!store.sessionTouchPromise) {
    store.sessionTouchPromise = (async () => {
      const startedAt = Date.now();
      const touchResult = await touchAdminSessionActivity(supabase, { token, userId });
      store.timings.sessionTouchMs = touchResult.touchMs ?? Date.now() - startedAt;
      store.timings.sessionTouchTouched = Boolean(touchResult.touched);
      store.timings.sessionTouchThrottled = Boolean(touchResult.throttled);
      store.sessionTouchDone = true;
    })();
  }

  await store.sessionTouchPromise;
}

/**
 * Authentication-only: validates session cookie → Supabase user.
 * Does NOT check admin status.
 */
export async function requireAuthenticatedSession() {
  return resolveAuthenticatedSessionInternal();
}

async function buildAdminSessionFromAuth(auth, options = {}) {
  const organizationId = options.organizationId || IAM_DEFAULT_ORGANIZATION_ID;
  let iam;
  try {
    iam = await resolveIamContextForRequest(auth.supabase, auth.user, organizationId);
  } catch (err) {
    iam = {
      isAdmin: false,
      hasActiveAssignment: false,
      resolverError: err?.message || "resolver_failed",
      permissions: new Set(),
      roleIds: [],
      assignmentIds: [],
    };
  }

  if (isIamApiEnabled()) {
    if (iam.resolverError || iam.tableMissing) {
      return resolverUnavailableResponse(iam);
    }

    if (!hasActiveIamAssignment(iam)) {
      await recordSecurityEvent(auth.supabase, {
        eventType: "iam.assignment_required",
        severity: "warning",
        userId: auth.user?.id,
        details: {
          legacyDetected: Boolean(iam.legacyDetected),
          legacyRole: iam.legacyRole || null,
          source: iam.source || "none",
          route: options.request?.url ? new URL(options.request.url).pathname : null,
        },
        request: options.request,
      });
      return assignmentRequiredResponse(iam);
    }
  }

  if (!humanAdminAllowed(iam)) {
    return {
      ok: false,
      status: 403,
      error: "غير مصرح لك بالدخول",
      user: auth.user,
      supabase: auth.supabase,
      iam,
    };
  }

  if (options.touchSession !== false && auth.token) {
    await touchSessionOnce(auth.supabase, auth.token, auth.user.id);
  }

  return {
    ok: true,
    user: auth.user,
    supabase: auth.supabase,
    token: auth.token,
    iam,
    actorType: "user",
  };
}

/**
 * Admin session: authenticated user + IAM context resolved.
 * When IAM_API=true, active IAM assignment is mandatory for humans.
 */
export async function requireAdminSession(options = {}) {
  const store = await getRequestIamStore();
  const cacheKey = adminSessionCacheKey(options);

  return memoizeRequestPromise(store, store.adminSessionPromises, cacheKey, async () => {
    const startedAt = Date.now();
    const auth = await resolveAuthenticatedSessionInternal();
    if (!auth.ok) {
      store.timings.adminSessionMs = Date.now() - startedAt;
      return auth;
    }

    const session = await buildAdminSessionFromAuth(auth, options);
    store.timings.adminSessionMs = Date.now() - startedAt;
    return session;
  });
}
