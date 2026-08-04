import { IAM_DEFAULT_ORGANIZATION_ID, IAM_ROLES } from "./constants.js";
import { invalidateUserPermissions } from "./cache.js";
import { recordGrantAudit, recordRevokeAudit } from "./audit.js";
import { recordSecurityEvent } from "./security-events.js";
import { normalizeEmail } from "../admin-emails.js";
import {
  resolveLegacyAdminBackfillCandidates,
  summarizeBackfillCandidates,
  filterExecutableBackfillCandidates,
} from "./backfill-candidates.js";

async function countActiveSuperAdmins(supabase, organizationId, excludeUserId = null) {
  let query = supabase
    .from("iam_user_assignments")
    .select("id, user_id")
    .eq("role_id", IAM_ROLES.SUPER_ADMIN)
    .is("revoked_at", null);

  if (organizationId) {
    query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter((row) => row.user_id !== excludeUserId).length;
}

async function findUserByEmail(supabase, email) {
  const normalized = normalizeEmail(email);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", normalized)
    .maybeSingle();
  if (profile?.id) return profile;

  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = list?.users?.find((u) => normalizeEmail(u.email) === normalized);
  return user ? { id: user.id, email: user.email } : null;
}

export async function grantRole(supabase, params) {
  const {
    actorId,
    actorEmail,
    actorIam,
    targetUserId,
    targetEmail,
    roleId,
    reason,
    organizationId = IAM_DEFAULT_ORGANIZATION_ID,
    request,
  } = params;

  let userId = targetUserId;
  if (!userId && targetEmail) {
    const found = await findUserByEmail(supabase, targetEmail);
    if (!found) return { ok: false, status: 404, error: "المستخدم غير موجود" };
    userId = found.id;
  }

  if (!userId || !roleId) {
    return { ok: false, status: 400, error: "userId و roleId مطلوبان" };
  }

  if (userId === actorId && roleId === IAM_ROLES.SUPER_ADMIN) {
    return { ok: false, status: 403, error: "لا يمكنك منح super_admin لنفسك" };
  }

  if (roleId === IAM_ROLES.SUPER_ADMIN && !actorIam?.isSuperAdmin) {
    await recordSecurityEvent(supabase, {
      eventType: "iam.role_escalation_attempt",
      severity: "critical",
      userId: actorId,
      details: { targetUserId: userId, roleId },
      request,
    });
    return { ok: false, status: 403, error: "فقط super_admin يمكنه منح super_admin" };
  }

  const { data: existing } = await supabase
    .from("iam_user_assignments")
    .select("id, role_id")
    .eq("user_id", userId)
    .eq("role_id", roleId)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) {
    return { ok: false, status: 409, error: "المستخدم يملك هذا الدور بالفعل" };
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("iam_user_assignments")
    .insert({
      user_id: userId,
      role_id: roleId,
      organization_id: organizationId,
      granted_by: actorId,
      granted_at: now,
      grant_reason: String(reason || "").trim() || null,
    })
    .select("id, user_id, role_id, granted_at")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  invalidateUserPermissions(userId, organizationId);

  await recordGrantAudit(supabase, {
    actorId,
    actorEmail,
    targetUserId: userId,
    roleId,
    reason,
    organizationId,
    afterData: inserted,
    request,
  });

  return { ok: true, assignment: inserted };
}

export async function revokeRole(supabase, params) {
  const {
    actorId,
    actorEmail,
    actorIam,
    targetUserId,
    roleId,
    assignmentId,
    reason,
    organizationId = IAM_DEFAULT_ORGANIZATION_ID,
    request,
  } = params;

  let assignment = null;
  if (assignmentId) {
    const { data } = await supabase
      .from("iam_user_assignments")
      .select("*")
      .eq("id", assignmentId)
      .maybeSingle();
    assignment = data;
  } else if (targetUserId && roleId) {
    const { data } = await supabase
      .from("iam_user_assignments")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("role_id", roleId)
      .is("revoked_at", null)
      .maybeSingle();
    assignment = data;
  }

  if (!assignment) {
    return { ok: false, status: 404, error: "التعيين غير موجود" };
  }

  if (assignment.role_id === IAM_ROLES.SUPER_ADMIN) {
    const others = await countActiveSuperAdmins(supabase, organizationId, assignment.user_id);
    const selfRevoke = assignment.user_id === actorId;
    if (others === 0 || (selfRevoke && others === 0)) {
      return { ok: false, status: 403, error: "لا يمكن إزالة آخر super_admin" };
    }
  }

  if (assignment.user_id === actorId && assignment.role_id !== IAM_ROLES.SUPER_ADMIN) {
    // allow self-revoke of non-super roles with warning in audit
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("iam_user_assignments")
    .update({
      revoked_at: now,
      revoked_by: actorId,
      revoke_reason: String(reason || "").trim() || null,
    })
    .eq("id", assignment.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  invalidateUserPermissions(assignment.user_id, organizationId);

  await recordRevokeAudit(supabase, {
    actorId,
    actorEmail,
    targetUserId: assignment.user_id,
    roleId: assignment.role_id,
    reason,
    organizationId,
    beforeData: assignment,
    afterData: updated,
    request,
  });

  return { ok: true, assignment: updated };
}

export async function listAssignments(supabase, options = {}) {
  const limit = Math.min(Number(options.limit) || 100, 500);
  let query = supabase
    .from("iam_user_assignments")
    .select("id, user_id, role_id, organization_id, granted_by, granted_at, revoked_at, grant_reason, revoke_reason")
    .order("granted_at", { ascending: false })
    .limit(limit);

  if (options.activeOnly !== false) {
    query = query.is("revoked_at", null);
  }
  if (options.userId) query = query.eq("user_id", options.userId);

  const { data, error } = await query;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return { assignments: [], tableMissing: true };
    }
    throw error;
  }
  return { assignments: data || [] };
}

export async function backfillLegacyAdmins(supabase, params = {}) {
  const organizationId = params.organizationId || IAM_DEFAULT_ORGANIZATION_ID;
  const actorId = params.actorId || null;
  const actorEmail = params.actorEmail || "system@backfill";
  const actorIam = params.actorIam || { isSuperAdmin: true };
  const request = params.request || null;

  const resolverResult = await resolveLegacyAdminBackfillCandidates(supabase, {
    ownerEmail: params.ownerEmail,
  });

  const executable = filterExecutableBackfillCandidates(resolverResult.candidates);
  const results = {
    granted: 0,
    skipped: 0,
    skippedReviewRequired: [],
    errors: [],
    summary: summarizeBackfillCandidates(resolverResult, { execute: true }),
  };

  for (const candidate of resolverResult.candidates) {
    if (candidate.requiresHumanReview && !candidate.existingAssignment) {
      results.skippedReviewRequired.push({
        userId: candidate.userId,
        maskedEmail: candidate.maskedEmail,
        reason: candidate.exclusionReason || "requires_human_review",
      });
    }
  }

  for (const candidate of executable) {
    const grant = await grantRole(supabase, {
      actorId,
      actorEmail,
      actorIam,
      targetUserId: candidate.userId,
      roleId: candidate.proposedRole,
      reason: "legacy_backfill",
      organizationId,
      request,
    });

    if (grant.ok) results.granted += 1;
    else if (grant.status === 409) results.skipped += 1;
    else {
      results.errors.push({
        userId: candidate.userId,
        maskedEmail: candidate.maskedEmail,
        error: grant.error,
      });
    }
  }

  return results;
}

export async function dryRunBackfillLegacyAdmins(supabase, params = {}) {
  const resolverResult = await resolveLegacyAdminBackfillCandidates(supabase, {
    ownerEmail: params.ownerEmail || process.env.IAM_OWNER_EMAIL || null,
  });

  return summarizeBackfillCandidates(resolverResult, { execute: false });
}
