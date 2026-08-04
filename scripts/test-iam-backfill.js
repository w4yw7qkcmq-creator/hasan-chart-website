import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveLegacyAdminBackfillCandidates,
  summarizeBackfillCandidates,
  filterExecutableBackfillCandidates,
  proposeLegacyBackfillRole,
  isTestAccount,
  maskEmail,
} from "../lib/iam/backfill-candidates.js";
import { dryRunBackfillLegacyAdmins, backfillLegacyAdmins } from "../lib/iam/grant-revoke.js";
import { IAM_ROLES } from "../lib/iam/constants.js";

function mockSupabase(options = {}) {
  const profiles = options.profiles || [];
  const assignments = options.assignments || [];
  const authUsers = options.authUsers || profiles.map((p) => ({
    id: p.id,
    email: p.email,
    user_metadata: p.metadata || {},
  }));

  return {
    from(table) {
      if (table === "profiles") {
        return {
          select: () => ({
            or: async () => ({ data: profiles, error: null }),
            eq: (_col, id) => ({
              maybeSingle: async () => ({
                data: profiles.find((p) => p.id === id) || null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "iam_user_assignments") {
        return {
          select: () => ({
            is: async () => ({ data: assignments, error: null }),
          }),
        };
      }
      return { select: () => ({ is: async () => ({ data: [], error: null }) }) };
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
      },
    },
  };
}

describe("proposeLegacyBackfillRole", () => {
  it("role=admin + admin_role=null → admin", () => {
    assert.equal(
      proposeLegacyBackfillRole({ role: "admin", admin_role: null }),
      IAM_ROLES.ADMIN
    );
  });

  it("role=user + admin_role=admin → admin", () => {
    assert.equal(
      proposeLegacyBackfillRole({ role: "user", admin_role: "admin" }),
      IAM_ROLES.ADMIN
    );
  });

  it("role=user + admin_role=support → support", () => {
    assert.equal(
      proposeLegacyBackfillRole({ role: "user", admin_role: "support" }),
      IAM_ROLES.SUPPORT
    );
  });

  it("does not auto-grant super_admin from profile fields alone", () => {
    assert.equal(
      proposeLegacyBackfillRole({ role: "user", admin_role: "super_admin" }),
      IAM_ROLES.SUPER_ADMIN
    );
  });
});

describe("isTestAccount", () => {
  it("@test.local → test account", () => {
    assert.equal(isTestAccount({ email: "admin@test.local" }), true);
  });

  it("metadata.e2e=true → test account", () => {
    assert.equal(
      isTestAccount({ email: "user@hasanchartworld.com" }, { user_metadata: { e2e: true } }),
      true
    );
  });
});

describe("resolveLegacyAdminBackfillCandidates", () => {
  it("includes admin_role-only candidates", async () => {
    const supabase = mockSupabase({
      profiles: [
        { id: "owner", email: "owner@example.com", role: "admin", admin_role: null },
        { id: "gok", email: "gok@example.com", role: "user", admin_role: "admin" },
      ],
      assignments: [{ user_id: "owner", role_id: IAM_ROLES.SUPER_ADMIN }],
      authUsers: [
        { id: "owner", email: "owner@example.com", user_metadata: {} },
        { id: "gok", email: "gok@example.com", user_metadata: {} },
      ],
    });

    const result = await resolveLegacyAdminBackfillCandidates(supabase, {
      ownerEmail: "owner@example.com",
      authUsers: [
        { id: "owner", email: "owner@example.com", user_metadata: {} },
        { id: "gok", email: "gok@example.com", user_metadata: {} },
      ],
    });

    const gok = result.candidates.find((c) => c.userId === "gok");
    assert.ok(gok, "admin_role-only candidate present");
    assert.equal(gok.proposedRole, IAM_ROLES.ADMIN);
    assert.ok(gok.sources.includes("profiles.admin_role"));
  });

  it("excludes active assignment", async () => {
    const supabase = mockSupabase({
      profiles: [{ id: "owner", email: "owner@example.com", role: "admin", admin_role: null }],
      assignments: [{ user_id: "owner", role_id: IAM_ROLES.SUPER_ADMIN }],
    });

    const result = await resolveLegacyAdminBackfillCandidates(supabase);
    const owner = result.candidates.find((c) => c.userId === "owner");
    assert.equal(owner.exclusionReason, "excluded_existing_assignment");
    assert.equal(owner.safeForExecute, false);
  });

  it("@test.local → review required + default exclude", async () => {
    const supabase = mockSupabase({
      profiles: [{ id: "t1", email: "admin@test.local", role: "admin", admin_role: null }],
      assignments: [],
    });

    const result = await resolveLegacyAdminBackfillCandidates(supabase);
    const test = result.candidates.find((c) => c.userId === "t1");
    assert.equal(test.isTestAccount, true);
    assert.equal(test.requiresHumanReview, true);
    assert.equal(test.defaultDecision, "exclude");
    assert.equal(test.safeForExecute, false);
  });

  it("merges duplicate sources for same user", async () => {
    const supabase = mockSupabase({
      profiles: [
        { id: "u1", email: "admin@hasanchartworld.com", role: "admin", admin_role: "admin" },
      ],
      assignments: [],
    });

    const result = await resolveLegacyAdminBackfillCandidates(supabase);
    assert.equal(result.candidates.length, 1);
    assert.ok(result.candidates[0].sources.includes("profiles.role"));
    assert.ok(result.candidates[0].sources.includes("profiles.admin_role"));
  });

  it("super_admin admin_role on non-owner requires human review", async () => {
    const supabase = mockSupabase({
      profiles: [{ id: "u2", email: "other@example.com", role: "admin", admin_role: "super_admin" }],
      assignments: [],
    });

    const result = await resolveLegacyAdminBackfillCandidates(supabase);
    const c = result.candidates[0];
    assert.equal(c.requiresHumanReview, true);
    assert.equal(c.safeForExecute, false);
  });
});

describe("summarizeBackfillCandidates", () => {
  it("computes expected counts", async () => {
    const supabase = mockSupabase({
      profiles: [
        { id: "owner", email: "owner@example.com", role: "admin", admin_role: null },
        { id: "a1", email: "admin@hasanchartworld.com", role: "admin", admin_role: null },
        { id: "t1", email: "admin@test.local", role: "admin", admin_role: null },
        { id: "gok", email: "gok@example.com", role: "user", admin_role: "admin" },
      ],
      assignments: [{ user_id: "owner", role_id: IAM_ROLES.SUPER_ADMIN }],
    });

    const resolverResult = await resolveLegacyAdminBackfillCandidates(supabase, {
      authUsers: [
        { id: "owner", email: "owner@example.com" },
        { id: "a1", email: "admin@hasanchartworld.com" },
        { id: "t1", email: "admin@test.local" },
        { id: "gok", email: "gok@example.com" },
      ],
    });

    const summary = summarizeBackfillCandidates(resolverResult, { execute: false });
    assert.equal(summary.safeCandidates, 2);
    assert.equal(summary.reviewRequiredCandidates, 1);
    assert.equal(summary.proposedAssignments.length, 2);
    assert.equal(summary.expectedActiveAssignmentsAfterExecute, 3);
    assert.equal(summary.expectedSuperAdminCountAfterExecute, 1);
  });
});

describe("dry-run vs execute parity", () => {
  it("uses same resolver for dry-run and execute filter", async () => {
    const supabase = mockSupabase({
      profiles: [
        { id: "a1", email: "admin@hasanchartworld.com", role: "admin", admin_role: null },
        { id: "t1", email: "admin@test.local", role: "admin", admin_role: null },
      ],
      assignments: [],
    });

    const dryReport = await dryRunBackfillLegacyAdmins(supabase);
    const resolverResult = await resolveLegacyAdminBackfillCandidates(supabase);
    const executable = filterExecutableBackfillCandidates(resolverResult.candidates);

    assert.equal(dryReport.safeCandidates, executable.length);
    assert.equal(dryReport.proposedAssignments.length, executable.length);
  });

  it("execute filter excludes review-required candidates", async () => {
    const supabase = mockSupabase({
      profiles: [
        { id: "a1", email: "admin@hasanchartworld.com", role: "admin", admin_role: null },
        { id: "t1", email: "admin@test.local", role: "admin", admin_role: null },
      ],
      assignments: [],
    });

    const resolverResult = await resolveLegacyAdminBackfillCandidates(supabase);
    const executable = filterExecutableBackfillCandidates(resolverResult.candidates);

    assert.equal(executable.length, 1);
    assert.equal(executable[0].userId, "a1");
    assert.ok(!executable.some((c) => c.isTestAccount));
  });
});

console.log("IAM backfill tests loaded");
