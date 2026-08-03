import { requireAdminPermission } from "../admin-auth.js";
import { IAM_PERMISSIONS } from "./constants.js";

/**
 * Verify finance center access via IAM permission resolver (dual-read compatible).
 */
export async function verifyFinanceCenterAccess(request = null) {
  const check = await requireAdminPermission(IAM_PERMISSIONS.FINANCE_READ, {
    request: request || undefined,
  });

  if (!check.ok) {
    return check;
  }

  return {
    ok: true,
    user: check.user,
    supabase: check.supabase,
    iam: check.iam,
    role: check.iam?.primaryRoleId || "admin",
  };
}
