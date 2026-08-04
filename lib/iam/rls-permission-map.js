/**
 * Central IAM RLS permission matrix — source of truth for migrations, validators, and tests.
 * All permission ids MUST exist in iam_permissions (see 20260804_iam_rbac_foundation.sql).
 */

/** @typedef {'user_owned'|'public_read'|'admin_managed'|'service_only'|'mixed'} RlsTableCategory */

/**
 * @typedef {Object} RlsTablePolicySpec
 * @property {string} [ownSelect]
 * @property {string} [ownInsert]
 * @property {string} [ownUpdate]
 * @property {string} [ownDelete]
 * @property {string} [publicSelect]
 * @property {string} [adminSelect]
 * @property {string} [adminInsert]
 * @property {string} [adminUpdate]
 * @property {string} [adminDelete]
 * @property {string} [adminAll]
 */

/** Tables accessed via browser Supabase client or PostgREST (direct or Realtime). */
export const RLS_TABLE_INVENTORY = Object.freeze({
  profiles: Object.freeze({
    category: "mixed",
    existsInStaging: true,
    browserAccess: true,
    ownershipColumn: "id",
    ownershipExpr: "id = auth.uid() OR lower(email) = public.current_user_email()",
    serviceRoleOnly: false,
    requiredIndexes: ["profiles_pkey"],
    migrationAction: "own+admin+enable",
    policies: Object.freeze({
      ownSelect: "auth.uid() = id OR lower(email) = public.current_user_email()",
      ownInsert: "signup-safe WITH CHECK",
      ownUpdate: "safe columns only (trigger + column grants)",
      adminSelect: "users.read",
      adminUpdate: "users.manage",
      adminInsert: "users.manage",
      adminDelete: "users.manage",
    }),
  }),

  analysis_requests: Object.freeze({
    category: "user_owned",
    existsInStaging: true,
    browserAccess: true,
    ownershipColumn: "user_email",
    ownershipExpr: "lower(user_email) = public.current_user_email()",
    serviceRoleOnly: false,
    requiredIndexes: ["analysis_requests_user_email_idx"],
    migrationAction: "own+admin+enable",
    policies: Object.freeze({
      ownSelect: "lower(user_email) = public.current_user_email()",
      ownInsert: "lower(user_email) = public.current_user_email()",
      adminSelect: "analysis.read",
      adminUpdate: "analysis.manage",
      adminDelete: "analysis.manage",
    }),
  }),

  subscription_requests: Object.freeze({
    category: "user_owned",
    existsInStaging: true,
    browserAccess: false,
    ownershipColumn: "user_email",
    ownershipExpr: "lower(user_email) = public.current_user_email()",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "own+admin+enable",
    policies: Object.freeze({
      ownSelect: "lower(user_email) = public.current_user_email()",
      ownInsert: "lower(user_email) = public.current_user_email()",
      adminSelect: "subscriptions.read",
      adminUpdate: "subscriptions.manage",
      adminDelete: "subscriptions.manage",
    }),
  }),

  subscription_upload_sessions: Object.freeze({
    category: "service_only",
    existsInStaging: true,
    browserAccess: false,
    ownershipColumn: "user_id",
    serviceRoleOnly: true,
    requiredIndexes: ["subscription_upload_sessions_user_open_idx"],
    migrationAction: "service_only_rls_on",
    policies: Object.freeze({}),
  }),

  price_alerts: Object.freeze({
    category: "admin_managed",
    existsInStaging: true,
    browserAccess: false,
    ownershipColumn: "user_email",
    serviceRoleOnly: false,
    note: "User CRUD via /api/alerts with service_role; no authenticated direct write",
    requiredIndexes: [],
    migrationAction: "admin+enable",
    policies: Object.freeze({
      adminSelect: "dashboard.read",
      adminUpdate: "dashboard.mutations",
      adminDelete: "dashboard.mutations",
    }),
  }),

  account_management_requests: Object.freeze({
    category: "user_owned",
    existsInStaging: true,
    browserAccess: false,
    ownershipColumn: "user_id",
    ownershipExpr: "user_id = auth.uid()",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "own+admin+enable",
    policies: Object.freeze({
      ownSelect: "user_id = auth.uid()",
      ownInsert: "user_id = auth.uid() AND lower(email) = public.current_user_email()",
      adminSelect: "accounts.read",
      adminUpdate: "accounts.secrets.manage",
      adminDelete: "accounts.secrets.manage",
    }),
  }),

  notifications: Object.freeze({
    category: "mixed",
    existsInStaging: true,
    browserAccess: true,
    ownershipColumn: "user_email",
    ownershipExpr: "lower(user_email) = public.current_user_email()",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "own+admin+enable",
    policies: Object.freeze({
      ownSelect: "lower(user_email) = public.current_user_email()",
      ownUpdate: "lower(user_email) = public.current_user_email()",
      adminSelect: "users.read",
      adminInsert: "support.manage",
      adminUpdate: "support.manage",
      adminDelete: "support.manage",
    }),
  }),

  vip_signals: Object.freeze({
    category: "mixed",
    existsInStaging: true,
    browserAccess: true,
    ownershipColumn: null,
    publicReadCondition: "authenticated SELECT temp until layout.js migrated",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "public_temp+admin+enable",
    policies: Object.freeze({
      publicSelect: "authenticated USING (true) — TEMP",
      adminInsert: "dashboard.mutations",
      adminUpdate: "dashboard.mutations",
      adminDelete: "dashboard.mutations",
    }),
  }),

  news_posts: Object.freeze({
    category: "public_read",
    existsInStaging: true,
    browserAccess: true,
    publicReadCondition: "true",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "public+admin+enable",
    policies: Object.freeze({
      publicSelect: "anon, authenticated USING (true)",
      adminInsert: "news.manage",
      adminUpdate: "news.manage",
      adminDelete: "news.manage",
    }),
  }),

  published_news: Object.freeze({
    category: "service_only",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: true,
    requiredIndexes: [],
    migrationAction: "service_only_rls_on",
    policies: Object.freeze({}),
  }),

  daily_analysis: Object.freeze({
    category: "mixed",
    existsInStaging: true,
    browserAccess: false,
    publicReadCondition: "is_published = true",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "public+admin+enable",
    policies: Object.freeze({
      publicSelect: "is_published = true",
      adminSelect: "analysis.read",
      adminInsert: "analysis.publish",
      adminUpdate: "analysis.publish",
      adminDelete: "analysis.publish",
    }),
  }),

  partner_withdrawals: Object.freeze({
    category: "admin_managed",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "admin+enable",
    policies: Object.freeze({
      adminSelect: "partners.withdrawals.read",
      adminUpdate: "partners.withdrawals.manage",
    }),
  }),

  partners: Object.freeze({
    category: "admin_managed",
    existsInStaging: true,
    browserAccess: false,
    ownershipColumn: "user_id",
    note: "Partner self-read via API routes; admin via IAM",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "admin+enable",
    policies: Object.freeze({
      adminSelect: "partners.read",
      adminUpdate: "partners.settings.manage",
    }),
  }),

  partner_wallet_ledger: Object.freeze({
    category: "admin_managed",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: false,
    migrationAction: "admin+enable",
    policies: Object.freeze({
      adminSelect: "partners.finance.read",
    }),
  }),

  partner_commissions: Object.freeze({
    category: "admin_managed",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: false,
    migrationAction: "admin+enable",
    policies: Object.freeze({
      adminSelect: "partners.finance.read",
      adminUpdate: "partners.jobs.run",
    }),
  }),

  partner_program_settings: Object.freeze({
    category: "admin_managed",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: false,
    migrationAction: "admin+enable",
    policies: Object.freeze({
      adminSelect: "partners.settings.read",
      adminUpdate: "partners.settings.manage",
    }),
  }),

  push_subscriptions: Object.freeze({
    category: "user_owned",
    existsInStaging: true,
    browserAccess: true,
    ownershipColumn: "user_id",
    ownershipExpr: "user_id = auth.uid()",
    serviceRoleOnly: false,
    requiredIndexes: [],
    migrationAction: "own+enable",
    policies: Object.freeze({
      ownSelect: "user_id = auth.uid()",
      ownInsert: "user_id = auth.uid()",
      ownUpdate: "user_id = auth.uid()",
      ownDelete: "user_id = auth.uid()",
    }),
  }),

  user_notification_settings: Object.freeze({
    category: "user_owned",
    existsInStaging: true,
    browserAccess: true,
    ownershipColumn: "user_id",
    ownershipExpr: "user_id = auth.uid()",
    serviceRoleOnly: false,
    migrationAction: "own_exists",
    policies: Object.freeze({
      ownSelect: "user_id = auth.uid()",
      ownInsert: "user_id = auth.uid()",
      ownUpdate: "user_id = auth.uid()",
    }),
  }),

  instant_analysis_requests: Object.freeze({
    category: "service_only",
    existsInStaging: true,
    browserAccess: false,
    ownershipColumn: "user_id",
    serviceRoleOnly: true,
    migrationAction: "service_only_rls_on",
    policies: Object.freeze({}),
  }),

  admin_user_notes: Object.freeze({
    category: "admin_managed",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: false,
    migrationAction: "admin+enable",
    policies: Object.freeze({
      adminSelect: "users.notes.manage",
      adminInsert: "users.notes.manage",
      adminUpdate: "users.notes.manage",
      adminDelete: "users.notes.manage",
    }),
  }),

  admin_audit_logs: Object.freeze({
    category: "service_only",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: true,
    migrationAction: "service_only_rls_on",
    policies: Object.freeze({}),
  }),

  admin_logs: Object.freeze({
    category: "service_only",
    existsInStaging: true,
    browserAccess: false,
    serviceRoleOnly: true,
    migrationAction: "service_only_rls_on",
    policies: Object.freeze({}),
  }),
});

/** Expected enforce admin policy count per table (SELECT/INSERT/UPDATE/DELETE split). */
export const ENFORCE_POLICY_EXPECTATIONS = Object.freeze({
  profiles: { admin: 4, dualDrop: 2 },
  analysis_requests: { admin: 3, dualDrop: 2 },
  subscription_requests: { admin: 3, dualDrop: 2 },
  account_management_requests: { admin: 3, dualDrop: 2 },
  daily_analysis: { admin: 4, dualDrop: 2, legacyDrop: 3 },
  partner_withdrawals: { admin: 2, dualDrop: 2 },
  price_alerts: { admin: 3, dualDrop: 0 },
  notifications: { admin: 4, dualDrop: 0 },
  vip_signals: { admin: 3, dualDrop: 0 },
  news_posts: { admin: 3, dualDrop: 0 },
  partners: { admin: 2, dualDrop: 0 },
  partner_wallet_ledger: { admin: 1, dualDrop: 0 },
  partner_commissions: { admin: 2, dualDrop: 0 },
  partner_program_settings: { admin: 2, dualDrop: 0 },
  admin_user_notes: { admin: 4, dualDrop: 0 },
});

export function countExpectedEnforcePolicies() {
  return Object.values(ENFORCE_POLICY_EXPECTATIONS).reduce(
    (sum, t) => sum + (t.admin || 0),
    0
  );
}

export function countExpectedOwnPolicies() {
  let count = 0;
  for (const spec of Object.values(RLS_TABLE_INVENTORY)) {
    const p = spec.policies || {};
    if (p.ownSelect) count += 1;
    if (p.ownInsert) count += 1;
    if (p.ownUpdate) count += 1;
    if (p.ownDelete) count += 1;
    if (p.publicSelect) count += 1;
  }
  return count;
}

export function tablesRequiringRlsEnable() {
  return Object.entries(RLS_TABLE_INVENTORY)
    .filter(([, spec]) => spec.migrationAction?.includes("enable"))
    .map(([name]) => name);
}

export function getPermissionForAdminAction(table, action) {
  const spec = RLS_TABLE_INVENTORY[table];
  if (!spec?.policies) return null;
  const key = `admin${action.charAt(0).toUpperCase()}${action.slice(1)}`;
  return spec.policies[key] || spec.policies.adminAll || null;
}
