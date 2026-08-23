import { isFallbackAdminEmail, normalizeEmail } from "../admin-emails.js";
import { getAdminRole, hasAdminPermission, ADMIN_PERMISSIONS } from "../admin-permissions.js";
import { IAM_PERMISSIONS } from "./constants.js";

/** Map legacy admin-permissions.js keys → IAM permission IDs. */
const LEGACY_TO_IAM = Object.freeze({
  "users.read": IAM_PERMISSIONS.USERS_READ,
  "users.manage": IAM_PERMISSIONS.USERS_MANAGE,
  "users.ban": IAM_PERMISSIONS.USERS_BAN,
  "subscriptions.read": IAM_PERMISSIONS.SUBSCRIPTIONS_READ,
  "subscriptions.manage": IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  "payments.read": IAM_PERMISSIONS.FINANCE_READ,
  "finance.read": IAM_PERMISSIONS.FINANCE_READ,
  "news.manage": IAM_PERMISSIONS.NEWS_MANAGE,
  "analysis.manage": IAM_PERMISSIONS.ANALYSIS_MANAGE,
  "support.manage": IAM_PERMISSIONS.SUPPORT_MANAGE,
  "admin.manage": IAM_PERMISSIONS.IAM_MANAGE,
});

function legacyPermissionsForRole(roleId) {
  const perms = new Set();
  for (const [legacyKey, iamKey] of Object.entries(LEGACY_TO_IAM)) {
    if (hasAdminPermission(roleId, legacyKey)) {
      perms.add(iamKey);
    }
  }
  return perms;
}

function fullLegacyAdminPermissions() {
  const perms = new Set(Object.values(IAM_PERMISSIONS));
  return perms;
}

export function emptyLegacyAdminContext() {
  return {
    isAdmin: false,
    roleId: null,
    roleLabel: null,
    profileRole: null,
    permissions: new Set(),
    isFallback: false,
  };
}

/**
 * Resolve admin access from profiles.role + admin_role + FALLBACK (dual-read period).
 */
export async function resolveLegacyAdminContext(supabase, user) {
  const normalizedEmail = normalizeEmail(user?.email);
  const userId = user?.id;

  if (!userId && !normalizedEmail) {
    return {
      isAdmin: false,
      roleId: null,
      roleLabel: null,
      profileRole: null,
      permissions: new Set(),
      isFallback: false,
    };
  }

  let profile = null;
  if (supabase && userId) {
    const { data } = await supabase
      .from("profiles")
      .select("id,email,role,admin_role")
      .or(`id.eq.${userId},email.eq.${normalizedEmail}`)
      .maybeSingle();
    profile = data || null;
  }

  const isFallback = isFallbackAdminEmail(normalizedEmail);
  const profileRole = String(profile?.role || "").trim();
  const isProfileAdmin = profileRole === "admin";
  const legacyRoleId = getAdminRole(profile) || (isFallback ? "admin" : null);
  const isAdmin = Boolean(isFallback || isProfileAdmin || legacyRoleId);

  if (!isAdmin) {
    return {
      isAdmin: false,
      roleId: null,
      roleLabel: null,
      profileRole,
      permissions: new Set(),
      isFallback: false,
    };
  }

  let permissions;
  if (isFallback && !profile) {
    permissions = fullLegacyAdminPermissions();
  } else if (legacyRoleId === "super_admin") {
    permissions = fullLegacyAdminPermissions();
  } else if (legacyRoleId) {
    permissions = legacyPermissionsForRole(legacyRoleId);
  } else if (isProfileAdmin) {
    permissions = legacyPermissionsForRole("admin");
  } else {
    permissions = new Set();
  }

  return {
    isAdmin: true,
    roleId: legacyRoleId || "admin",
    roleLabel: legacyRoleId || "admin",
    profileRole,
    permissions,
    isFallback,
  };
}

/** Export legacy permission map for tests. */
export function getLegacyPermissionMap() {
  return { ...LEGACY_TO_IAM, ADMIN_PERMISSIONS };
}
