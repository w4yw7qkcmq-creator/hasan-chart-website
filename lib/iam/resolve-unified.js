import { IAM_DEFAULT_ORGANIZATION_ID } from "./constants.js";
import { isIamUnifiedResolverEnabled } from "./feature-flags.js";
import {
  computeEffectivePermissions,
  buildIamContextFromResolution,
  collectPermissionEffects,
  normalizeRoleIds,
} from "./resolve-permissions-internals.js";

/**
 * Resolve IAM raw data via single Postgres RPC (service role only).
 * @returns {Promise<{ ok: boolean, payload?: object, error?: string }>}
 */
export async function fetchUnifiedIamPayload(supabase, userId, organizationId) {
  const orgId = organizationId || IAM_DEFAULT_ORGANIZATION_ID;
  const { data, error } = await supabase.rpc("resolve_iam_context_v2", {
    p_user_id: userId,
    p_organization_id: orgId,
  });

  if (error) {
    if (/function .* does not exist/i.test(error.message || "")) {
      return { ok: false, error: "rpc_missing" };
    }
    return { ok: false, error: error.message || "rpc_failed" };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, error: "rpc_malformed" };
  }

  return { ok: true, payload: data };
}

/**
 * Build IamContext from unified RPC payload using same semantics as legacy resolver.
 */
export function buildIamContextFromUnifiedPayload(payload, user, options = {}) {
  const assignments = Array.isArray(payload?.assignments) ? payload.assignments : [];
  const roles = Array.isArray(payload?.roles) ? payload.roles : [];
  const rolePermissions = Array.isArray(payload?.role_permissions) ? payload.role_permissions : [];
  const overrides = Array.isArray(payload?.overrides) ? payload.overrides : [];

  const assignmentIds = assignments.map((a) => String(a.id || "")).filter(Boolean);
  const roleIds = normalizeRoleIds(assignments);
  const roleLabelById = new Map(roles.map((r) => [String(r.id), String(r.label || r.id)]));

  const roleCollected = collectPermissionEffects(rolePermissions);
  const allow = new Set(roleCollected.allow);
  const deny = new Set(roleCollected.deny);

  const hasOverrides = overrides.length > 0;
  const overrideCollected = collectPermissionEffects(overrides);
  for (const p of overrideCollected.allow) allow.add(p);
  for (const p of overrideCollected.deny) deny.add(p);

  const roleLabels = roleIds.map((id) => roleLabelById.get(id) || id);

  const ctx = buildIamContextFromResolution({
    user,
    organizationId: options.organizationId || IAM_DEFAULT_ORGANIZATION_ID,
    assignmentIds,
    roleIds,
    roleLabels,
    allow,
    deny,
    hasOverrides,
    tableMissing: false,
    legacy: options.legacy || null,
    apiEnforcement: options.apiEnforcement,
    resolverSource: hasOverrides ? "iam_with_overrides" : roleIds.length ? "iam" : "none",
    skipLegacyMerge: options.skipLegacyMerge,
    resolverPath: "unified",
  });
  return ctx;
}

export function shouldUseUnifiedResolver() {
  return isIamUnifiedResolverEnabled();
}
