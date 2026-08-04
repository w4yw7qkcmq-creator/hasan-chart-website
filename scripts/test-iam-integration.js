import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Backfill dry-run mapping (legacy integration)", () => {
  it("owner with existing assignment is excluded, admin_role-only included", async () => {
    const { dryRunBackfillLegacyAdmins } = await import("../lib/iam/grant-revoke.js");

    const profiles = [
      { id: "1", email: "owner@test.com", role: "admin", admin_role: "admin" },
      { id: "2", email: "other@test.com", role: "user", admin_role: "support" },
      { id: "3", email: "admin@test.local", role: "admin", admin_role: null },
    ];

    const supabase = {
      from(table) {
        if (table === "profiles") {
          return {
            select: () => ({
              or: async () => ({ data: profiles, error: null }),
              eq: (_c, id) => ({
                maybeSingle: async () => ({ data: profiles.find((p) => p.id === id) || null }),
              }),
            }),
          };
        }
        if (table === "iam_user_assignments") {
          return {
            select: () => ({
              is: async () => ({
                data: [{ user_id: "1", role_id: "super_admin" }],
                error: null,
              }),
            }),
          };
        }
        return { select: () => ({ is: async () => ({ data: [], error: null }) }) };
      },
      auth: {
        admin: {
          listUsers: async () => ({
            data: {
              users: profiles.map((p) => ({ id: p.id, email: p.email, user_metadata: {} })),
            },
          }),
        },
      },
    };

    const report = await dryRunBackfillLegacyAdmins(supabase, { ownerEmail: "owner@test.com" });
    assert.equal(report.excludedExistingAssignments.length, 1);
    assert.equal(report.safeCandidates, 1);
    assert.equal(report.reviewRequiredCandidates, 1);
    const support = report.candidates.find((c) => c.userId === "2");
    assert.equal(support.proposedRole, "support");
    const testLocal = report.candidates.find((c) => c.userId === "3");
    assert.equal(testLocal.isTestAccount, true);
    assert.equal(testLocal.safeForExecute, false);
  });
});

console.log("IAM integration tests loaded");
