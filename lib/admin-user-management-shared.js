export const ACCOUNT_STATUS_LABELS = {
  active: "نشط",
  suspended: "معلق",
  banned: "محظور",
  deleted: "محذوف",
};

export const ACCOUNT_STATUS_ICONS = {
  active: "🟢",
  suspended: "🟡",
  banned: "🔴",
  deleted: "⚫",
};

export function getAccountStatusLabel(status) {
  return ACCOUNT_STATUS_LABELS[status] || ACCOUNT_STATUS_LABELS.active;
}

export function getAccountStatusIcon(status) {
  return ACCOUNT_STATUS_ICONS[status] || ACCOUNT_STATUS_ICONS.active;
}

/** @deprecated use resolveAccountStatusFromProfile */
export function resolveAccountStatus(authUser) {
  if (!authUser) return "active";
  const metadata = authUser.user_metadata || {};
  if (metadata.deleted_at || metadata.soft_deleted || metadata.account_status === "deleted") return "deleted";
  const bannedUntil = authUser.banned_until ? new Date(authUser.banned_until).getTime() : 0;
  if (bannedUntil > Date.now()) return "banned";
  if (metadata.account_suspended || metadata.account_disabled) return "suspended";
  return "active";
}
