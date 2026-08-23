import { IAM_DEFAULT_ORGANIZATION_ID } from "./constants.js";
import { getCachedPermissions, setCachedPermissions } from "./cache.js";
import { isIamDbEnabled, isIamDualReadEnabled, isIamApiEnabled } from "./feature-flags.js";
import {
  buildEmptyContext,
  buildResolverErrorContext,
  buildIamContextFromResolution,
  collectPermissionEffects,
  normalizeRoleIds,
  resolveLegacyContextIfNeeded,
} from "./resolve-permissions-internals.js";
import {
  buildIamContextFromUnifiedPayload,
  fetchUnifiedIamPayload,
  shouldUseUnifiedResolver,
} from "./resolve-unified.js";

export {
  computeEffectivePermissions,
  collectPermissionEffects,
  normalizeRoleIds,
} from "./resolve-permissions-internals.js";

async function loadIamAssignments(supabase, userId, organizationId) {
  let query = supabase
    .from("iam_user_assignments")
    .select("id, role_id, organization_id, granted_at, revoked_at")
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (organizationId) {
    query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return { assignments: [], tableMissing: true };
    }
    throw error;
  }
  return { assignments: data || [], tableMissing: false };
}

async function loadRolePermissions(supabase, roleIds) {
  if (!roleIds.length) return [];
  const { data, error } = await supabase
    .from("iam_role_permissions")
    .select("role_id, permission_id, effect")
    .in("role_id", roleIds);
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return [];
    }
    throw error;
  }
  return data || [];
}

async function loadUserOverrides(supabase, userId, organizationId) {
  let query = supabase
    .from("iam_user_permission_overrides")
    .select("permission_id, effect")
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (organizationId) {
    query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  }

  const { data, error } = await query;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return [];
    }
    throw error;
  }
  return data || [];
}

async function resolveIamContextLegacyQueries(supabase, user, organizationId, apiEnforcement) {
  const userId = String(user?.id || "").trim();
  let roleIds = [];
  let roleLabels = [];
  let assignmentIds = [];
  let tableMissing = false;
  let hasOverrides = false;

  const { assignments, tableMissing: missing } = await loadIamAssignments(
    supabase,
    userId,
    organizationId
  );
  tableMissing = missing;
  assignmentIds = (assignments || []).map((a) => String(a.id)).filter(Boolean);
  roleIds = normalizeRoleIds(assignments);

  if (roleIds.length) {
    const { data: roles } = await supabase.from("iam_roles").select("id, label").in("id", roleIds);
    roleLabels = (roles || []).map((r) => r.label || r.id);
  }

  if (apiEnforcement && tableMissing) {
    throw new Error("iam_tables_missing");
  }

  let allow = new Set();
  let deny = new Set();

  if (roleIds.length && !tableMissing) {
    const rolePerms = await loadRolePermissions(supabase, roleIds);
    const collected = collectPermissionEffects(rolePerms);
    for (const p of collected.allow) allow.add(p);
    for (const p of collected.deny) deny.add(p);

    const overrides = await loadUserOverrides(supabase, userId, organizationId);
    if (overrides.length) hasOverrides = true;
    const overrideCollected = collectPermissionEffects(overrides);
    for (const p of overrideCollected.allow) allow.add(p);
    for (const p of overrideCollected.deny) deny.add(p);
  }

  return {
    assignmentIds,
    roleIds,
    roleLabels,
    allow,
    deny,
    hasOverrides,
    tableMissing,
  };
}

async function resolveIamContextLegacy(supabase, user, options = {}) {
  const organizationId = options.organizationId || IAM_DEFAULT_ORGANIZATION_ID;
  const apiEnforcement = isIamApiEnabled();
  const parts = await resolveIamContextLegacyQueries(supabase, user, organizationId, apiEnforcement);

  const legacy = await resolveLegacyContextIfNeeded(supabase, user, {
    apiEnforcement,
    hasActiveAssignment: parts.assignmentIds.length > 0,
    roleIds: parts.roleIds,
    tableMissing: parts.tableMissing,
  });

  return buildIamContextFromResolution({
    user,
    organizationId,
    ...parts,
    legacy,
    apiEnforcement,
    resolverPath: "legacy",
  });
}

async function resolveIamContextUnified(supabase, user, options = {}) {
  const organizationId = options.organizationId || IAM_DEFAULT_ORGANIZATION_ID;
  const apiEnforcement = isIamApiEnabled();
  const userId = String(user?.id || "").trim();

  const rpc = await fetchUnifiedIamPayload(supabase, userId, organizationId);
  if (!rpc.ok) {
    throw new Error(rpc.error || "unified_resolver_failed");
  }

  const assignmentIds = (rpc.payload?.assignments || [])
    .map((a) => String(a.id || ""))
    .filter(Boolean);
  const roleIds = normalizeRoleIds(rpc.payload?.assignments || []);

  const legacy = await resolveLegacyContextIfNeeded(supabase, user, {
    apiEnforcement,
    hasActiveAssignment: assignmentIds.length > 0,
    roleIds,
    tableMissing: false,
  });

  return buildIamContextFromUnifiedPayload(rpc.payload, user, {
    organizationId,
    apiEnforcement,
    legacy,
    skipLegacyMerge: apiEnforcement && assignmentIds.length > 0 && roleIds.length > 0,
  });
}

/**
 * @returns {Promise<import('./types.js').IamContext>}
 */
export async function resolveIamContext(supabase, user, options = {}) {
  const userId = String(user?.id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const organizationId = options.organizationId || IAM_DEFAULT_ORGANIZATION_ID;
  const apiEnforcement = isIamApiEnabled();

  if (!userId) {
    return buildEmptyContext(email, organizationId);
  }

  const cached = getCachedPermissions(userId, organizationId);
  if (cached) return cached;

  let ctx;

  if ((isIamDbEnabled() || isIamDualReadEnabled()) && shouldUseUnifiedResolver()) {
    try {
      ctx = await resolveIamContextUnified(supabase, user, { organizationId });
      ctx.resolverPath = "unified";
    } catch (err) {
      console.warn("[IAM] unified resolver fallback:", err?.message || err);
      try {
        ctx = await resolveIamContextLegacy(supabase, user, { organizationId });
        ctx.resolverPath = "legacy_fallback";
      } catch (legacyErr) {
        if (apiEnforcement) {
          return buildResolverErrorContext(userId, email, organizationId, legacyErr, "legacy_fallback");
        }
        throw legacyErr;
      }
    }
  } else if (isIamDbEnabled() || isIamDualReadEnabled()) {
    try {
      ctx = await resolveIamContextLegacy(supabase, user, { organizationId });
    } catch (err) {
      if (apiEnforcement) {
        return buildResolverErrorContext(userId, email, organizationId, err, "legacy");
      }
      console.warn("IAM resolve skipped:", err?.message || err);
      ctx = buildEmptyContext(email, organizationId);
      ctx.userId = userId;
      ctx.email = email;
    }
  } else {
    const legacy = await resolveLegacyContextIfNeeded(supabase, user, {
      apiEnforcement,
      hasActiveAssignment: false,
      roleIds: [],
      tableMissing: false,
    });
    ctx = buildIamContextFromResolution({
      user,
      organizationId,
      legacy,
      apiEnforcement,
      resolverPath: "legacy_only",
    });
  }

  return setCachedPermissions(userId, organizationId, ctx);
}

export function iamContextCan(ctx, permission) {
  const perm = String(permission || "").trim();
  if (!perm || !ctx) return false;
  return ctx.permissions.has(perm);
}

export function iamContextCanAny(ctx, permissions) {
  return (permissions || []).some((p) => iamContextCan(ctx, p));
}

export function iamContextCanAll(ctx, permissions) {
  const list = permissions || [];
  if (!list.length) return false;
  return list.every((p) => iamContextCan(ctx, p));
}

/** @internal tests — compare unified vs legacy resolver output */
export async function __resolveIamContextBothPathsForTests(supabase, user, options = {}) {
  const [unified, legacy] = await Promise.all([
    resolveIamContextUnified(supabase, user, options).catch((err) => ({
      resolverError: err?.message || "unified_failed",
    })),
    resolveIamContextLegacy(supabase, user, options).catch((err) => ({
      resolverError: err?.message || "legacy_failed",
    })),
  ]);
  return { unified, legacy };
}
