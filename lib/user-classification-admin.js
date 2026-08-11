import { recordAdminAction } from "./admin-audit-log.js";
import {
  USER_CLASSIFICATION,
  getUserClassificationLabel,
  resolveStoredOrComputedClassification,
} from "./user-classification.js";

/**
 * Classification authority order (server-side only):
 * 1. Admin manual stored classification (user_classification_source = admin_manual)
 * 2. High-confidence stored migration/backfill (backfill_high_confidence)
 * 3. Other stored profiles.user_classification values
 * 4. Computed server heuristic (resolveUserClassificationSignals)
 * 5. UNKNOWN fallback
 *
 * Client payloads never override stored values directly without USERS_MANAGE.
 */

export const CLASSIFICATION_ADMIN_SOURCES = Object.freeze({
  MANUAL: "admin_manual",
  BACKFILL: "backfill_high_confidence",
});

const VALID_CLASSIFICATIONS = new Set(Object.values(USER_CLASSIFICATION));

function throwStatus(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

export function normalizeAdminClassificationInput(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!VALID_CLASSIFICATIONS.has(normalized)) {
    throwStatus("تصنيف الحساب غير صالح", 400);
  }
  return normalized;
}

export async function updateUserClassificationAdmin(
  supabase,
  { adminUser, targetUserId, classification, reason = "" }
) {
  const normalizedUserId = String(targetUserId || "").trim();
  const adminId = String(adminUser?.id || "").trim();

  if (!normalizedUserId) throwStatus("معرّف المستخدم مطلوب", 400);
  if (!adminId) throwStatus("جلسة المدير غير صالحة", 401);
  if (adminId === normalizedUserId) {
    throwStatus("لا يمكنك تغيير تصنيف حسابك الشخصي", 403);
  }

  const nextClassification = normalizeAdminClassificationInput(classification);
  const sanitizedReason = String(reason || "").trim().slice(0, 500);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id,email,username,role,user_classification,user_classification_source,user_classification_updated_at,created_at,last_sign_in_at"
    )
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) throwStatus("المستخدم غير موجود", 404);

  const beforeResolved = resolveStoredOrComputedClassification(profile);
  const beforeClassification = beforeResolved.classification;

  if (beforeClassification === nextClassification) {
    return {
      success: true,
      action: "update_user_classification",
      userId: normalizedUserId,
      message: "التصنيف لم يتغير",
      changedFields: {
        userClassification: nextClassification,
        userClassificationLabel: getUserClassificationLabel(nextClassification, { short: true }),
        userClassificationSource: profile.user_classification_source || beforeResolved.source,
      },
      noop: true,
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({
      user_classification: nextClassification,
      user_classification_source: CLASSIFICATION_ADMIN_SOURCES.MANUAL,
      user_classification_updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedUserId)
    .select(
      "id,email,user_classification,user_classification_source,user_classification_updated_at"
    )
    .maybeSingle();

  if (updateError) {
    if (/user_classification/i.test(updateError.message || "")) {
      throwStatus("عمود تصنيف الحساب غير متاح — طبّق migration أولاً", 503);
    }
    throw updateError;
  }

  await recordAdminAction(supabase, {
    adminId,
    adminEmail: adminUser?.email || null,
    action: "user_classification_update",
    targetTable: "profiles",
    targetId: normalizedUserId,
    details: {
      entity_type: "user/profile",
      target_user_id: normalizedUserId,
      before: {
        classification: beforeClassification,
        label: getUserClassificationLabel(beforeClassification),
        source: beforeResolved.source,
      },
      after: {
        classification: nextClassification,
        label: getUserClassificationLabel(nextClassification),
        source: CLASSIFICATION_ADMIN_SOURCES.MANUAL,
      },
      reason: sanitizedReason || null,
    },
  });

  return {
    success: true,
    action: "update_user_classification",
    userId: normalizedUserId,
    message: "تم تحديث تصنيف الحساب",
    changedFields: {
      userClassification: updated?.user_classification || nextClassification,
      userClassificationLabel: getUserClassificationLabel(nextClassification, { short: true }),
      userClassificationSource: CLASSIFICATION_ADMIN_SOURCES.MANUAL,
      userClassificationUpdatedAt: updated?.user_classification_updated_at || null,
    },
  };
}
