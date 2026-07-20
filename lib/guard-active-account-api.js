import { requireActiveAccount } from "./require-active-account.js";

export const ACCOUNT_RESTRICTED_MESSAGE = {
  suspended: "حسابك معلّق حاليًا. يمكنك تسجيل الدخول لكن الخدمات المحمية غير متاحة.",
  banned: "حسابك محظور. لا يمكنك استخدام الخدمات المحمية.",
  deleted: "حسابك محذوف منطقيًا. لا يمكنك استخدام الخدمات المحمية.",
};

export function buildAccountRestrictedResponse(error) {
  const status = error?.accountStatus || "restricted";
  return Response.json(
    {
      success: false,
      error: error?.message || ACCOUNT_RESTRICTED_MESSAGE[status] || "الحساب غير نشط",
      code: error?.code || "ACCOUNT_NOT_ACTIVE",
      accountStatus: status,
    },
    { status: error?.status || 403 }
  );
}

export async function guardActiveAccountForApi(supabase, userId) {
  try {
    await requireActiveAccount(supabase, userId);
    return null;
  } catch (error) {
    return buildAccountRestrictedResponse(error);
  }
}
