import { isIamApiEnabled } from "./feature-flags.js";

export const IAM_ASSIGNMENT_REQUIRED = "IAM_ASSIGNMENT_REQUIRED";
export const IAM_RESOLVER_UNAVAILABLE = "IAM_RESOLVER_UNAVAILABLE";

/** Active row in iam_user_assignments (not revoked). */
export function hasActiveIamAssignment(iam) {
  if (!iam) return false;
  if (iam.hasActiveAssignment === true) return true;
  return Array.isArray(iam.assignmentIds) && iam.assignmentIds.length > 0;
}

/** Human admin API/session allowed under current flag mode. */
export function humanAdminAllowed(iam) {
  if (!iam) return false;
  if (iam.resolverError || iam.tableMissing) return false;

  if (isIamApiEnabled()) {
    return hasActiveIamAssignment(iam);
  }

  return Boolean(iam.isAdmin);
}

export function assignmentRequiredResponse(iam = null) {
  return {
    ok: false,
    status: 403,
    error: "IAM assignment required for admin access",
    code: IAM_ASSIGNMENT_REQUIRED,
    iam,
  };
}

export function resolverUnavailableResponse(iam = null) {
  return {
    ok: false,
    status: 503,
    error: "IAM permission resolver unavailable",
    code: IAM_RESOLVER_UNAVAILABLE,
    iam,
  };
}
