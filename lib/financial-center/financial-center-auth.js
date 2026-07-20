import { normalizeEmail, isFallbackAdminEmail } from "../admin-emails.js";
import { getAdminRole, hasAdminPermission } from "../admin-permissions.js";
import { verifyAdminSession } from "../admin-auth.js";

export async function verifyFinanceCenterAccess() {
  const adminCheck = await verifyAdminSession();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const normalizedEmail = normalizeEmail(adminCheck.user?.email);
  const { data: profile, error: profileError } = await adminCheck.supabase
    .from("profiles")
    .select("id,email,role,admin_role")
    .or(`id.eq.${adminCheck.user.id},email.eq.${normalizedEmail}`)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      status: 500,
      error: "تعذر التحقق من صلاحيات المركز المالي",
    };
  }

  const role = getAdminRole(profile) || (isFallbackAdminEmail(normalizedEmail) ? "admin" : null);

  if (!role || !hasAdminPermission(role, "finance.read")) {
    return {
      ok: false,
      status: 403,
      error: "ليس لديك صلاحية قراءة المركز المالي",
    };
  }

  return {
    ok: true,
    user: adminCheck.user,
    supabase: adminCheck.supabase,
    profile,
    role,
  };
}
