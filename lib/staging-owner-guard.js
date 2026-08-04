/**
 * Blocks credential mutation against the staging IAM owner account in test harnesses.
 */
export function getStagingOwnerId(env = process.env) {
  return String(env.STAGING_OWNER_USER_ID || env.IAM_OWNER_USER_ID || "").trim();
}

export function getStagingOwnerEmail(env = process.env) {
  return String(env.IAM_OWNER_EMAIL || env.STAGING_OWNER_EMAIL || "")
    .trim()
    .toLowerCase();
}

export function isStagingOwnerTarget(target, env = process.env) {
  const userId = target?.userId;
  const email = target?.email;
  const ownerId = getStagingOwnerId(env);
  const ownerEmail = getStagingOwnerEmail(env);
  if (ownerId && userId && String(userId) === ownerId) return true;
  if (ownerEmail && email && String(email).trim().toLowerCase() === ownerEmail) return true;
  return false;
}

export function assertOwnerCredentialMutationBlocked(target, env = process.env) {
  if (isStagingOwnerTarget(target, env)) {
    return {
      blocked: true,
      error: "Owner credential mutation is forbidden in staging harnesses",
    };
  }
  return { blocked: false };
}

export function filterCredentialMutationTargets(emails, env = process.env) {
  const ownerEmail = getStagingOwnerEmail(env);
  return (emails || []).filter(
    (email) => String(email || "").trim().toLowerCase() !== ownerEmail
  );
}
