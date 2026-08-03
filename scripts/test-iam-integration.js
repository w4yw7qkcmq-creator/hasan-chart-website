import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Backfill dry-run mapping", () => {
  it("owner email maps to super_admin", async () => {
    const { dryRunBackfillLegacyAdmins } = await import("../lib/iam/grant-revoke.js");
    const supabase = {
      from(table) {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { id: "1", email: "owner@test.com", role: "admin", admin_role: "admin" },
                  { id: "2", email: "other@test.com", role: "admin", admin_role: "support" },
                ],
              }),
            }),
          };
        }
        if (table === "iam_user_assignments") {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      },
    };

    const report = await dryRunBackfillLegacyAdmins(supabase, { ownerEmail: "owner@test.com" });
    assert.equal(report.proposedSuperAdminCount, 1);
    assert.equal(report.proposed.find((p) => p.email === "owner@test.com").proposedRole, "super_admin");
    assert.equal(report.proposed.find((p) => p.email === "other@test.com").proposedRole, "support");
  });
});

console.log("IAM integration tests loaded");
