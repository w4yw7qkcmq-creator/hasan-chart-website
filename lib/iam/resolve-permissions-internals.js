import { IAM_DEFAULT_ORGANIZATION_ID, PERMISSION_EFFECT } from "./constants.js";
import { resolveLegacyAdminContext, emptyLegacyAdminContext } from "./legacy-auth.js";

/**
 * Compute effective permissions from allow/deny sets.
 * Deny always wins over allow.
 */
export function computeEffectivePermissions(allowSet, denySet) {
  const effective = new Set(allowSet);
  for (const denied of denySet) {
    effective.delete(denied);
  }
  return effective;
}

export function normalizeRoleIds(rows) {
  return [...new Set((rows || []).map((row) => String(row.role_id || "").trim()).filter(Boolean))];
}

export function collectPermissionEffects(rows) {
  const allow = new Set();
  const deny = new Set();
  for (const row of rows || []) {
    const permissionId = String(row.permission_id || "").trim();
    if (!permissionId) continue;
    const effect = String(row.effect || PERMISSION_EFFECT.ALLOW).trim().toLowerCase();
    if (effect === PERMISSION_EFFECT.DENY) {
      deny.add(permissionId);
    } else {
      allow.add(permissionId);
    }
  }
  return { allow, deny };
}

export function buildEmptyContext(email, organizationId) {
  return {
    userId: null,
    email,
    organizationId,
    roleIds: [],
    roleLabels: [],
    assignmentIds: [],
    hasActiveAssignment: false,
    primaryRoleId: null,
    primaryRoleLabel: null,
    permissions: new Set(),
    allowPermissions: new Set(),
    denyPermissions: new Set(),
    isAdmin: false,
    isSuperAdmin: false,
    source: "none",
    legacyProfileRole: null,
    legacyDetected: false,
    legacyRole: null,
    legacyIsFallback: false,
    tableMissing: false,
    resolverError: null,
    resolverPath: null,
  };
}

export function buildResolverErrorContext(userId, email, organizationId, err, resolverPath = "legacy") {
  return {
    userId,
    email,
    organizationId,
    roleIds: [],
    roleLabels: [],
    assignmentIds: [],
    hasActiveAssignment: false,
    primaryRoleId: null,
    primaryRoleLabel: null,
    permissions: new Set(),
    allowPermissions: new Set(),
    denyPermissions: new Set(),
    isAdmin: false,
    isSuperAdmin: false,
    source: "none",
    legacyProfileRole: null,
    legacyDetected: false,
    legacyRole: null,
    legacyIsFallback: false,
    tableMissing: false,
    resolverError: err?.message || "resolver_failed",
    resolverPath,
  };
}

/**
 * Shared final IamContext builder — single source of deny-wins semantics.
 */
export function buildIamContextFromResolution(params) {
  const {
    user,
    organizationId = IAM_DEFAULT_ORGANIZATION_ID,
    assignmentIds = [],
    roleIds = [],
    roleLabels = [],
    allow,
    deny,
    hasOverrides = false,
    tableMissing = false,
    legacy = null,
    apiEnforcement = false,
    resolverSource = "none",
    skipLegacyMerge = false,
    resolverPath = null,
  } = params;

  const userId = String(user?.id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const hasActiveAssignment = assignmentIds.length > 0;

  let source = resolverSource;
  const allowSet = new Set(allow || []);
  const denySet = new Set(deny || []);

  let legacyCtx = legacy;
  if (!legacyCtx) {
    legacyCtx = emptyLegacyAdminContext();
  }

  if (!skipLegacyMerge) {
    if (!apiEnforcement && legacyCtx.isAdmin && roleIds.length === 0) {
      source = source === "iam" ? "dual" : "legacy";
      for (const p of legacyCtx.permissions) allowSet.add(p);
      if (legacyCtx.roleId && !roleIds.includes(legacyCtx.roleId)) {
        roleIds.push(legacyCtx.roleId);
        roleLabels.push(legacyCtx.roleLabel || legacyCtx.roleId);
      }
    } else if (apiEnforcement && !hasActiveAssignment && legacyCtx.isAdmin) {
      source = "legacy_blocked";
    } else if (hasActiveAssignment && hasOverrides) {
      source = "iam_with_overrides";
    } else if (hasActiveAssignment) {
      source = "iam";
    }
  } else if (hasActiveAssignment && hasOverrides) {
    source = "iam_with_overrides";
  } else if (hasActiveAssignment) {
    source = "iam";
  }

  const permissions = computeEffectivePermissions(allowSet, denySet);
  const legacyDetected = Boolean(legacyCtx.isAdmin);
  const legacyRole = legacyCtx.roleId || (legacyCtx.profileRole === "admin" ? "admin" : null);

  let isSuperAdmin;
  let isAdmin;

  if (apiEnforcement) {
    isSuperAdmin = hasActiveAssignment && (roleIds.includes("super_admin") || permissions.has("iam.manage"));
    isAdmin = hasActiveAssignment && permissions.size > 0;
  } else {
    isSuperAdmin = roleIds.includes("super_admin") || permissions.has("iam.manage");
    isAdmin = roleIds.length > 0 || legacyCtx.isAdmin || permissions.size > 0;
  }

  return {
    userId,
    email,
    organizationId,
    roleIds: apiEnforcement ? roleIds.filter((r) => !r.startsWith("service:")) : roleIds,
    roleLabels,
    assignmentIds,
    hasActiveAssignment,
    primaryRoleId: roleIds[0] || (apiEnforcement ? null : legacyCtx.roleId || null),
    primaryRoleLabel: roleLabels[0] || (apiEnforcement ? null : legacyCtx.roleLabel || null),
    permissions,
    allowPermissions: allowSet,
    denyPermissions: denySet,
    isAdmin,
    isSuperAdmin,
    source,
    legacyProfileRole: legacyCtx.profileRole || null,
    legacyDetected,
    legacyRole,
    legacyIsFallback: Boolean(legacyCtx.isFallback),
    tableMissing,
    resolverError: null,
    resolverPath,
  };
}

export async function resolveLegacyContextIfNeeded(supabase, user, options = {}) {
  const { apiEnforcement, hasActiveAssignment, roleIds, tableMissing, resolverError } = options;

  if (
    apiEnforcement &&
    hasActiveAssignment &&
    roleIds.length > 0 &&
    !tableMissing &&
    !resolverError
  ) {
    return emptyLegacyAdminContext();
  }

  return resolveLegacyAdminContext(supabase, user);
}
