import { FALLBACK_ADMIN_EMAILS, normalizeEmail } from "../admin-emails.js";
import { IAM_ROLES } from "./constants.js";

export const KNOWN_IAM_ROLE_IDS = Object.freeze([
  IAM_ROLES.SUPER_ADMIN,
  IAM_ROLES.ADMIN,
  IAM_ROLES.ANALYST,
  IAM_ROLES.SUPPORT,
  IAM_ROLES.ACCOUNTANT,
  IAM_ROLES.NEWS_EDITOR,
]);

const KNOWN_ROLE_SET = new Set(KNOWN_IAM_ROLE_IDS);

export const EXECUTABLE_BACKFILL_ROLES = Object.freeze(
  KNOWN_IAM_ROLE_IDS.filter((id) => id !== IAM_ROLES.SUPER_ADMIN)
);

export function maskEmail(email = "") {
  const [local, domain = ""] = String(email || "").split("@");
  if (!domain) return "***";
  return `${local.slice(0, 3)}***@${domain}`;
}

function isMalformedEmail(email) {
  const normalized = normalizeEmail(email);
  return !normalized || !normalized.includes("@") || normalized.startsWith("@") || normalized.endsWith("@");
}

/**
 * Detect disposable / test accounts that must not receive assignments by default.
 */
export function isTestAccount(profile, authUser = null) {
  const email = normalizeEmail(profile?.email || authUser?.email || "");
  if (!email) return false;
  if (email.endsWith("@test.local")) return true;
  if (email.includes("smoke-e2e")) return true;

  const meta = authUser?.user_metadata || profile?.metadata || {};
  if (meta.e2e === true) return true;
  if (meta.iam_test === true) return true;
  if (meta.staging_only === true) return true;

  const localPart = email.split("@")[0] || "";
  if (/\btest\b/i.test(localPart)) return true;

  return false;
}

/**
 * Map profile legacy fields → proposed IAM role (never auto super_admin from backfill).
 */
export function proposeLegacyBackfillRole(profile) {
  const adminRole = String(profile?.admin_role || "").trim().toLowerCase();
  if (adminRole && KNOWN_ROLE_SET.has(adminRole)) {
    return adminRole;
  }
  if (String(profile?.role || "").trim() === "admin") {
    return IAM_ROLES.ADMIN;
  }
  return null;
}

function buildCandidateEntry(profile, sources, existingAssignment, authUser) {
  const proposedRole = proposeLegacyBackfillRole(profile);
  const isTest = isTestAccount(profile, authUser);
  const adminRoleValue = String(profile?.admin_role || "").trim().toLowerCase();
  const superAdminRoleRequested = adminRoleValue === IAM_ROLES.SUPER_ADMIN;

  let requiresHumanReview = isTest || superAdminRoleRequested;
  let defaultDecision = "include";
  let decision = "propose";
  let exclusionReason = null;

  if (existingAssignment) {
    exclusionReason = "excluded_existing_assignment";
    decision = "exclude";
    defaultDecision = "exclude";
  } else if (isTest) {
    exclusionReason = "test_account_default_exclude";
    decision = "exclude";
    defaultDecision = "exclude";
    requiresHumanReview = true;
  } else if (superAdminRoleRequested) {
    exclusionReason = "super_admin_requires_human_review";
    decision = "review";
    defaultDecision = "review";
    requiresHumanReview = true;
  } else if (!proposedRole || !EXECUTABLE_BACKFILL_ROLES.includes(proposedRole)) {
    exclusionReason = "no_executable_role";
    decision = "exclude";
    defaultDecision = "exclude";
    requiresHumanReview = true;
  }

  const safeForExecute =
    !requiresHumanReview &&
    !isTest &&
    !existingAssignment &&
    proposedRole &&
    EXECUTABLE_BACKFILL_ROLES.includes(proposedRole);

  return {
    userId: profile.id,
    maskedEmail: maskEmail(profile.email),
    sources: [...sources].sort(),
    profileRole: profile.role || null,
    profileAdminRole: profile.admin_role || null,
    proposedRole,
    isTestAccount: isTest,
    requiresHumanReview,
    defaultDecision,
    exclusionReason,
    decision,
    safeForExecute,
    existingAssignment: existingAssignment
      ? { roleId: existingAssignment.role_id }
      : null,
  };
}

/**
 * Central resolver — used by both dry-run and execute paths.
 */
export async function resolveLegacyAdminBackfillCandidates(supabase, params = {}) {
  const ownerEmail = normalizeEmail(params.ownerEmail || process.env.IAM_OWNER_EMAIL || "");

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role, admin_role")
    .or("role.eq.admin,admin_role.not.is.null");

  if (profileError) throw profileError;

  const profilesById = new Map((profileRows || []).map((p) => [p.id, p]));

  let authUsers = params.authUsers || null;
  if (!authUsers) {
    const { data: listData, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authError) throw authError;
    authUsers = listData?.users || [];
  }

  const authById = new Map(authUsers.map((u) => [u.id, u]));
  const authByEmail = new Map(authUsers.map((u) => [normalizeEmail(u.email), u]));

  const { data: activeAssignments, error: assignError } = await supabase
    .from("iam_user_assignments")
    .select("user_id, role_id")
    .is("revoked_at", null);

  if (assignError) throw assignError;

  const assignmentByUser = new Map();
  let activeSuperAdminCount = 0;
  for (const row of activeAssignments || []) {
    if (!assignmentByUser.has(row.user_id)) {
      assignmentByUser.set(row.user_id, row);
    }
    if (row.role_id === IAM_ROLES.SUPER_ADMIN) {
      activeSuperAdminCount += 1;
    }
  }

  const candidateMap = new Map();

  function registerProfile(profile, source) {
    if (!profile?.id || isMalformedEmail(profile.email)) return;
    if (!authById.has(profile.id)) return;

    let entry = candidateMap.get(profile.id);
    if (!entry) {
      entry = { profile, sources: new Set() };
      candidateMap.set(profile.id, entry);
    }
    entry.sources.add(source);
  }

  for (const profile of profileRows || []) {
    if (profile.role === "admin") {
      registerProfile(profile, "profiles.role");
    }
    const adminRole = String(profile.admin_role || "").trim().toLowerCase();
    if (adminRole && KNOWN_ROLE_SET.has(adminRole)) {
      registerProfile(profile, "profiles.admin_role");
    }
  }

  const fallbackEmailsWithoutUser = [];
  const missingAuthUsers = [];

  for (const fbEmail of FALLBACK_ADMIN_EMAILS) {
    const normalized = normalizeEmail(fbEmail);
    const authUser = authByEmail.get(normalized);
    if (!authUser) {
      fallbackEmailsWithoutUser.push({ maskedEmail: maskEmail(fbEmail) });
      continue;
    }

    let profile = profilesById.get(authUser.id);
    if (!profile) {
      const { data: fetched } = await supabase
        .from("profiles")
        .select("id, email, role, admin_role")
        .eq("id", authUser.id)
        .maybeSingle();
      profile = fetched || null;
    }

    if (!profile) {
      missingAuthUsers.push({ maskedEmail: maskEmail(fbEmail), reason: "no_profile" });
      continue;
    }

    registerProfile(profile, "fallback_email");
  }

  const candidates = [];
  for (const { profile, sources } of candidateMap.values()) {
    const authUser = authById.get(profile.id) || null;
    const existingAssignment = assignmentByUser.get(profile.id) || null;
    candidates.push(
      buildCandidateEntry(profile, sources, existingAssignment, authUser)
    );
  }

  candidates.sort((a, b) => a.maskedEmail.localeCompare(b.maskedEmail));

  const activeAssignmentCount = (activeAssignments || []).length;

  return {
    ownerEmailConfigured: Boolean(ownerEmail),
    candidates,
    fallbackEmailsWithoutUser,
    missingAuthUsers,
    activeAssignmentCountBeforeBackfill: activeAssignmentCount,
    activeSuperAdminCountBeforeBackfill: activeSuperAdminCount,
  };
}

export function summarizeBackfillCandidates(resolverResult, options = {}) {
  const execute = Boolean(options.execute);
  const candidates = resolverResult.candidates || [];

  const excludedExistingAssignments = candidates.filter((c) => c.existingAssignment);
  const testAccounts = candidates.filter((c) => c.isTestAccount);
  const adminRoleOnlyCandidates = candidates.filter((c) =>
    c.sources.includes("profiles.admin_role") && c.profileRole !== "admin"
  );
  const fallbackOnlyCandidates = candidates.filter(
    (c) => c.sources.length === 1 && c.sources[0] === "fallback_email"
  );
  const reviewRequiredCandidates = candidates.filter((c) => c.requiresHumanReview && !c.existingAssignment);
  const safeCandidates = candidates.filter((c) => c.safeForExecute);
  const proposedAssignments = execute ? safeCandidates : safeCandidates;

  const expectedActiveAfterExecute =
    resolverResult.activeAssignmentCountBeforeBackfill + safeCandidates.length;
  const expectedSuperAdminCountAfterExecute =
    resolverResult.activeSuperAdminCountBeforeBackfill ?? activeAssignmentsSuperAdminCount(candidates, resolverResult);

  return {
    execute,
    totalCandidates: candidates.length,
    safeCandidates: safeCandidates.length,
    reviewRequiredCandidates: reviewRequiredCandidates.length,
    excludedExistingAssignments: excludedExistingAssignments.map((c) => ({
      userId: c.userId,
      maskedEmail: c.maskedEmail,
      existingRole: c.existingAssignment?.roleId,
      proposedRole: c.proposedRole,
      sources: c.sources,
    })),
    testAccounts: testAccounts.map(publicCandidate),
    adminRoleOnlyCandidates: adminRoleOnlyCandidates.map(publicCandidate),
    fallbackOnlyCandidates: fallbackOnlyCandidates.map(publicCandidate),
    missingAuthUsers: resolverResult.missingAuthUsers || [],
    fallbackEmailsWithoutUser: resolverResult.fallbackEmailsWithoutUser || [],
    proposedAssignments: safeCandidates.map(publicCandidate),
    candidates: candidates.map(publicCandidate),
    expectedActiveAssignmentsAfterExecute: expectedActiveAfterExecute,
    expectedSuperAdminCountAfterExecute: expectedSuperAdminCountAfterExecute,
    ownerEmailConfigured: resolverResult.ownerEmailConfigured,
  };
}

function activeAssignmentsSuperAdminCount(candidates, resolverResult) {
  return (resolverResult.candidates || []).filter(
    (c) => c.existingAssignment?.roleId === IAM_ROLES.SUPER_ADMIN
  ).length;
}

function publicCandidate(c) {
  return {
    userId: c.userId,
    maskedEmail: c.maskedEmail,
    sources: c.sources,
    profileRole: c.profileRole,
    profileAdminRole: c.profileAdminRole,
    proposedRole: c.proposedRole,
    isTestAccount: c.isTestAccount,
    requiresHumanReview: c.requiresHumanReview,
    defaultDecision: c.defaultDecision,
    decision: c.decision,
    reason: c.exclusionReason,
    safeForExecute: c.safeForExecute,
    existingAssignment: c.existingAssignment,
  };
}

export function filterExecutableBackfillCandidates(candidates) {
  return (candidates || []).filter((c) => c.safeForExecute);
}
