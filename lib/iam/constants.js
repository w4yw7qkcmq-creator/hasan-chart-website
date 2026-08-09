/** System role identifiers — seeded in iam_roles migration. */
export const IAM_ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  ANALYST: "analyst",
  SUPPORT: "support",
  ACCOUNTANT: "accountant",
  NEWS_EDITOR: "news_editor",
});

/** Permission identifiers — seeded in iam_permissions migration. */
export const IAM_PERMISSIONS = Object.freeze({
  // IAM
  IAM_READ: "iam.read",
  IAM_MANAGE: "iam.manage",
  IAM_ROLES_MANAGE: "iam.roles.manage",
  IAM_ASSIGNMENTS_GRANT: "iam.assignments.grant",
  IAM_ASSIGNMENTS_REVOKE: "iam.assignments.revoke",
  IAM_AUDIT_READ: "iam.audit.read",
  IAM_SESSIONS_READ: "iam.sessions.read",
  IAM_SESSIONS_FORCE_LOGOUT: "iam.sessions.force_logout",
  IAM_SESSIONS_REVOKE: "iam.sessions.revoke",
  IAM_SECURITY_READ: "iam.security.read",
  // Users
  USERS_READ: "users.read",
  USERS_MANAGE: "users.manage",
  USERS_BAN: "users.ban",
  USERS_NOTES_MANAGE: "users.notes.manage",
  USERS_SECRETS_READ: "users.secrets.read",
  USERS_SESSIONS_REVOKE: "users.sessions.revoke",
  // Subscriptions
  SUBSCRIPTIONS_READ: "subscriptions.read",
  SUBSCRIPTIONS_MANAGE: "subscriptions.manage",
  // Finance
  FINANCE_READ: "finance.read",
  FINANCE_PROOFS_READ: "finance.proofs.read",
  FINANCE_EXPORT: "finance.export",
  // Partners
  PARTNERS_READ: "partners.read",
  PARTNERS_ANALYTICS_READ: "partners.analytics.read",
  PARTNERS_SETTINGS_READ: "partners.settings.read",
  PARTNERS_SETTINGS_MANAGE: "partners.settings.manage",
  PARTNERS_WITHDRAWALS_READ: "partners.withdrawals.read",
  PARTNERS_WITHDRAWALS_MANAGE: "partners.withdrawals.manage",
  PARTNERS_FINANCE_READ: "partners.finance.read",
  PARTNERS_FRAUD_REVIEW: "partners.fraud.review",
  PARTNERS_JOBS_RUN: "partners.jobs.run",
  PARTNERS_CAMPAIGNS_READ: "partners.campaigns.read",
  PARTNERS_CAMPAIGNS_MANAGE: "partners.campaigns.manage",
  PARTNERS_MISSIONS_READ: "partners.missions.read",
  PARTNERS_MISSIONS_MANAGE: "partners.missions.manage",
  PARTNERS_REWARDS_READ: "partners.rewards.read",
  PARTNERS_REWARDS_MANAGE: "partners.rewards.manage",
  PARTNERS_LEVELS_MANAGE: "partners.levels.manage",
  // Analysis
  ANALYSIS_READ: "analysis.read",
  ANALYSIS_MANAGE: "analysis.manage",
  ANALYSIS_PUBLISH: "analysis.publish",
  // News
  NEWS_READ: "news.read",
  NEWS_MANAGE: "news.manage",
  NEWS_PUBLISH: "news.publish",
  // Content (Academy + Result)
  CONTENT_READ: "content.read",
  CONTENT_MANAGE: "content.manage",
  CONTENT_PUBLISH: "content.publish",
  // Email
  EMAIL_ANALYTICS_READ: "email.analytics.read",
  // Dashboard
  DASHBOARD_READ: "dashboard.read",
  DASHBOARD_MUTATIONS: "dashboard.mutations",
  // VIP Recommendations
  RECOMMENDATIONS_STATUS_READ: "recommendations.status.read",
  RECOMMENDATIONS_STATUS_UPDATE: "recommendations.status.update",
  RECOMMENDATIONS_NOTIFICATIONS_SEND: "recommendations.notifications.send",
  // Accounts
  ACCOUNTS_READ: "accounts.read",
  ACCOUNTS_SECRETS_MANAGE: "accounts.secrets.manage",
  // System
  SYSTEM_NOTIFICATIONS_TEST: "system.notifications.test",
  SYSTEM_CRON_READ: "system.cron.read",
  // Support
  SUPPORT_MANAGE: "support.manage",
});

/** Known service account IDs — seeded in iam_service_accounts migration. */
export const IAM_SERVICE_ACCOUNTS = Object.freeze({
  CRON: "cron",
  NEWS_WORKER: "news-worker",
  PRICE_ALERT_WORKER: "price-alert-worker",
  INSTANT_ANALYSIS_WORKER: "instant-analysis-worker",
  TELEGRAM_BOT: "telegram-bot",
  SUBSCRIPTION_MAINTENANCE_WORKER: "subscription-maintenance-worker",
});

/** Default organization placeholder for future multi-tenant (single org today). */
export const IAM_DEFAULT_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";

export const PERMISSION_EFFECT = Object.freeze({
  ALLOW: "allow",
  DENY: "deny",
});
