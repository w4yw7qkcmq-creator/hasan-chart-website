import { IAM_DEFAULT_ORGANIZATION_ID, PERMISSION_EFFECT } from "./constants.js";
import { getCachedPermissions, setCachedPermissions } from "./cache.js";
import { isIamDbEnabled, isIamDualReadEnabled, isIamApiEnabled } from "./feature-flags.js";
import { resolveLegacyAdminContext } from "./legacy-auth.js";

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

function normalizeRoleIds(rows) {
  return [...new Set((rows || []).map((row) => String(row.role_id || "").trim()).filter(Boolean))];
}

function collectPermissionEffects(rows) {
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

  let roleIds = [];
  let roleLabels = [];
  let assignmentIds = [];
  let source = "none";
  let tableMissing = false;
  let hasOverrides = false;

  if (isIamDbEnabled() || isIamDualReadEnabled()) {
    try {
      const { assignments, tableMissing: missing } = await loadIamAssignments(
        supabase,
        userId,
        organizationId
      );
      tableMissing = missing;
      assignmentIds = (assignments || []).map((a) => String(a.id)).filter(Boolean);
      roleIds = normalizeRoleIds(assignments);

      if (roleIds.length) {
        source = "iam";
        const { data: roles } = await supabase
          .from("iam_roles")
          .select("id, label")
          .in("id", roleIds);
        roleLabels = (roles || []).map((r) => r.label || r.id);
      }
    } catch (err) {
      if (apiEnforcement) {
        return buildResolverErrorContext(userId, email, organizationId, err);
      }
      console.warn("IAM resolve assignments skipped:", err?.message || err);
    }
  }

  if (apiEnforcement && tableMissing) {
    return buildResolverErrorContext(userId, email, organizationId, new Error("iam_tables_missing"));
  }

  let allow = new Set();
  let deny = new Set();

  if (roleIds.length && !tableMissing) {
    try {
      const rolePerms = await loadRolePermissions(supabase, roleIds);
      const collected = collectPermissionEffects(rolePerms);
      for (const p of collected.allow) allow.add(p);
      for (const p of collected.deny) deny.add(p);

      const overrides = await loadUserOverrides(supabase, userId, organizationId);
      if (overrides.length) hasOverrides = true;
      const overrideCollected = collectPermissionEffects(overrides);
      for (const p of overrideCollected.allow) allow.add(p);
      for (const p of overrideCollected.deny) deny.add(p);
    } catch (err) {
      if (apiEnforcement) {
        return buildResolverErrorContext(userId, email, organizationId, err);
      }
      console.warn("IAM resolve permissions skipped:", err?.message || err);
    }
  }

  const legacy = await resolveLegacyAdminContext(supabase, user);
  const hasActiveAssignment = assignmentIds.length > 0;

  if (!apiEnforcement && legacy.isAdmin && roleIds.length === 0) {
    source = source === "iam" ? "dual" : "legacy";
    for (const p of legacy.permissions) allow.add(p);
    if (legacy.roleId && !roleIds.includes(legacy.roleId)) {
      roleIds.push(legacy.roleId);
      roleLabels.push(legacy.roleLabel || legacy.roleId);
    }
  } else if (apiEnforcement && !hasActiveAssignment && legacy.isAdmin) {
    source = "legacy_blocked";
  } else if (hasActiveAssignment && hasOverrides) {
    source = "iam_with_overrides";
  } else if (hasActiveAssignment) {
    source = "iam";
  }

  const permissions = computeEffectivePermissions(allow, deny);
  const legacyDetected = Boolean(legacy.isAdmin);
  const legacyRole = legacy.roleId || (legacy.profileRole === "admin" ? "admin" : null);

  let isSuperAdmin;
  let isAdmin;

  if (apiEnforcement) {
    isSuperAdmin = hasActiveAssignment && (roleIds.includes("super_admin") || permissions.has("iam.manage"));
    isAdmin = hasActiveAssignment && permissions.size > 0;
  } else {
    isSuperAdmin = roleIds.includes("super_admin") || permissions.has("iam.manage");
    isAdmin = roleIds.length > 0 || legacy.isAdmin || permissions.size > 0;
  }

  const ctx = {
    userId,
    email,
    organizationId,
    roleIds: apiEnforcement ? roleIds.filter((r) => !r.startsWith("service:")) : roleIds,
    roleLabels,
    assignmentIds,
    hasActiveAssignment,
    primaryRoleId: roleIds[0] || (apiEnforcement ? null : legacy.roleId || null),
    primaryRoleLabel: roleLabels[0] || (apiEnforcement ? null : legacy.roleLabel || null),
    permissions,
    allowPermissions: allow,
    denyPermissions: deny,
    isAdmin,
    isSuperAdmin,
    source,
    legacyProfileRole: legacy.profileRole || null,
    legacyDetected,
    legacyRole,
    legacyIsFallback: Boolean(legacy.isFallback),
    tableMissing,
    resolverError: null,
  };

  return setCachedPermissions(userId, organizationId, ctx);
}

function buildEmptyContext(email, organizationId) {
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
  };
}

function buildResolverErrorContext(userId, email, organizationId, err) {
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
  };
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
