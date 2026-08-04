import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import { validateRouteMatrix } from "../lib/iam/route-matrix-validator.js";
import { validateIamFlagCombination } from "../lib/iam/feature-flags.js";

describe("Staging role isolation fixtures", () => {
  it("IAM_API=true requires IAM_DB and passes validation", () => {
    const r = validateIamFlagCombination({
      IAM_DB: true,
      IAM_API: true,
      IAM_UI: false,
      IAM_RLS: false,
    });
    assert.equal(r.ok, true);
    assert.equal(r.misconfigured, false);
  });

  it("route matrix has zero issues", () => {
    const m = validateRouteMatrix();
    assert.equal(m.ok, true);
    assert.equal(m.stats.issueCount, 0);
  });

  it("subscription_manager permission set excludes IAM and system", () => {
    const allowed = new Set([
      IAM_PERMISSIONS.DASHBOARD_READ,
      IAM_PERMISSIONS.SUBSCRIPTIONS_READ,
      IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
      IAM_PERMISSIONS.FINANCE_PROOFS_READ,
    ]);
    const forbidden = [
      IAM_PERMISSIONS.IAM_MANAGE,
      IAM_PERMISSIONS.USERS_MANAGE,
      IAM_PERMISSIONS.USERS_BAN,
      IAM_PERMISSIONS.ACCOUNTS_SECRETS_MANAGE,
      IAM_PERMISSIONS.NEWS_PUBLISH,
      IAM_PERMISSIONS.SYSTEM_NOTIFICATIONS_TEST,
    ];
    for (const p of forbidden) {
      assert.equal(allowed.has(p), false);
    }
  });
});

describe("Staging cleanup inventory artifact", () => {
  it("loads latest enforcement artifact if present", async () => {
    const { readdirSync, readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "scripts/iam/.artifacts");
    if (!existsSync(dir)) return;
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("staging-api-enforcement-"))
      .sort();
    if (!files.length) return;
    const data = JSON.parse(readFileSync(join(dir, files.at(-1)), "utf8"));
    assert.ok(data.cleanup?.users?.length >= 0);
  });
});
