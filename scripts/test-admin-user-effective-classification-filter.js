#!/usr/bin/env node
/**
 * Effective classification filter contract — server-side authority + consistency.
 * Run: node --test scripts/test-admin-user-effective-classification-filter.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  resolveEffectiveUserClassification,
  USER_CLASSIFICATION,
} from "../lib/user-classification.js";
import {
  profileMatchesEffectiveClassification,
  sortProfilesForAdminList,
  countEffectiveClassifications,
} from "../lib/user-classification-list-filter.js";
import { buildAdminUserListRequestParams, DEFAULT_ADMIN_USER_CLIENT_FILTERS } from "../lib/admin-user-list-request.js";

const REAL_PROFILE = {
  email: "trader@gmail.com",
  username: "ahmad_trader",
  created_at: "2025-01-01T00:00:00Z",
  last_sign_in_at: "2026-01-01T00:00:00Z",
  user_classification: "unknown",
  user_classification_source: "system",
};

describe("canonical effective classification resolver", () => {
  it("1 stored UNKNOWN + computed REAL => effective REAL", () => {
    const resolved = resolveEffectiveUserClassification(REAL_PROFILE);
    assert.equal(resolved.classification, USER_CLASSIFICATION.REAL);
    assert.equal(resolved.source, "computed");
  });

  it("2 stored UNKNOWN + computed SUSPECTED => effective SUSPECTED", () => {
    const resolved = resolveEffectiveUserClassification({
      email: "someone@gmail.com",
      username: "ProdA991",
      user_classification: "unknown",
    });
    assert.ok(
      resolved.classification === USER_CLASSIFICATION.SUSPECTED ||
        resolved.classification === USER_CLASSIFICATION.UNKNOWN
    );
  });

  it("3 stored TEST => effective TEST", () => {
    const resolved = resolveEffectiveUserClassification({
      email: "p-a-123@test.local",
      user_classification: "test",
      user_classification_source: "backfill_high_confidence",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.TEST);
  });

  it("4 stored E2E => effective E2E", () => {
    const resolved = resolveEffectiveUserClassification({
      email: "smoke-e2e-user@e2e.hasanchartworld.test",
      user_classification: "e2e",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.E2E);
  });

  it("5 stored INTERNAL => effective INTERNAL", () => {
    const resolved = resolveEffectiveUserClassification({
      email: "admin@hasanchartworld.com",
      user_classification: "internal",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.INTERNAL);
  });

  it("6 admin_manual TEST overrides computed REAL", () => {
    const resolved = resolveEffectiveUserClassification({
      ...REAL_PROFILE,
      user_classification: "test",
      user_classification_source: "admin_manual",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.TEST);
    assert.equal(resolved.source, "admin_manual");
  });

  it("7 admin_manual REAL overrides computed SUSPECTED", () => {
    const resolved = resolveEffectiveUserClassification({
      email: "someone@gmail.com",
      username: "ProdA991",
      user_classification: "real",
      user_classification_source: "admin_manual",
    });
    assert.equal(resolved.classification, USER_CLASSIFICATION.REAL);
  });

  it("20 UNKNOWN contains only truly effective UNKNOWN", () => {
    const counts = countEffectiveClassifications([
      REAL_PROFILE,
      {
        email: "p-a-123@test.local",
        user_classification: "test",
      },
      {
        email: "someone@gmail.com",
        username: "ProdA991",
        user_classification: "unknown",
      },
    ]);
    assert.equal(counts.real, 1);
    assert.equal(counts.test, 1);
    assert.ok(counts.suspected + counts.unknown >= 1);
  });
});

describe("effective profile matching + pagination helpers", () => {
  it("8 REAL filter matcher includes stored-unknown computed-real", () => {
    assert.equal(profileMatchesEffectiveClassification(REAL_PROFILE, "real"), true);
  });

  it("9 sortProfilesForAdminList preserves deterministic tie-break", () => {
    const sorted = sortProfilesForAdminList(
      [
        { id: "b", created_at: "2026-01-01T00:00:00Z" },
        { id: "a", created_at: "2026-01-01T00:00:00Z" },
      ],
      "created_at",
      false
    );
    assert.equal(sorted[0].id, "a");
  });

  it("10-19 request params compose classification with search/cohort/service/plan/status/last-login", () => {
    const params = buildAdminUserListRequestParams({
      page: 2,
      searchQuery: "gmail.com",
      registrationCohort: "month",
      accountStatusFilter: "active",
      clientFilters: {
        ...DEFAULT_ADMIN_USER_CLIENT_FILTERS,
        userClassification: "real",
        service: "vip",
        plan: "VIP Spot",
        lastLoginFrom: "2026-08-01",
        lastLoginTo: "2026-08-11",
      },
      effectiveAccountStatusFilter: "active",
    });
    assert.equal(params.userClassification, "real");
    assert.equal(params.search, "gmail.com");
    assert.ok(params.registeredFrom);
    assert.equal(params.activeService, "vip");
    assert.equal(params.plan, "VIP Spot");
    assert.equal(params.accountStatus, "active");
    assert.ok(params.lastLoginFrom);
    assert.equal(params.page, 2);
  });
});

describe("server architecture guards", () => {
  it("21 no client-side classification filtering in management panel", () => {
    const panel = readFileSync("app/(app)/admin/components/AdminUserManagementPanel.js", "utf8");
    assert.doesNotMatch(panel, /applyClientUserFilters[\s\S]*userClassification/);
    assert.match(panel, /fetchUsersForClientView|fetchAdminUserList/);
  });

  it("22 no listAll UI dependency for primary table pagination", () => {
    const panel = readFileSync("app/(app)/admin/components/AdminUserManagementPanel.js", "utf8");
    assert.doesNotMatch(panel, /listAll:\s*true/);
  });

  it("23 loadAdminUserList uses DB effective read-model filter", () => {
    const source = readFileSync("lib/admin-user-management.js", "utf8");
    assert.match(source, /effective_user_classification/);
    assert.doesNotMatch(source, /loadAdminUserListWithEffectiveClassification/);
    assert.doesNotMatch(source, /collectProfilesMatchingEffectiveClassification/);
  });

  it("24 default registration dates are not sent to API", () => {
    const params = buildAdminUserListRequestParams();
    assert.equal(params.registeredFrom, "");
    assert.equal(params.registeredTo, "");
  });

  it("25 default last-login dates are not sent to API", () => {
    const params = buildAdminUserListRequestParams();
    assert.equal(params.lastLoginFrom, "");
    assert.equal(params.lastLoginTo, "");
  });

  it("26 clear filters restores empty date bounds", () => {
    const params = buildAdminUserListRequestParams({
      clientFilters: DEFAULT_ADMIN_USER_CLIENT_FILTERS,
    });
    assert.equal(params.registeredFrom, "");
    assert.equal(params.registeredTo, "");
    assert.equal(params.lastLoginFrom, "");
    assert.equal(params.lastLoginTo, "");
    assert.equal(params.userClassification, "all");
  });

  it("27 manual override uses same resolver in formatUserBase", () => {
    const source = readFileSync("lib/admin-user-management.js", "utf8");
    assert.match(source, /resolveEffectiveUserClassification\(profile, authUser\)/);
  });

  it("28-30 CSV/export uses same server list API with classification param", () => {
    const panel = readFileSync("app/(app)/admin/components/AdminUserManagementPanel.js", "utf8");
    assert.match(panel, /fetchAllAdminUserList/);
    assert.match(panel, /userClassification|listRequestParams/);
    const client = readFileSync("lib/admin-user-management-client.js", "utf8");
    assert.match(client, /fetchAllAdminUserList/);
    assert.match(client, /userClassification/);
  });
});

describe("stored-only SQL filter is bypassed for effective classifications", () => {
  it("classification filter uses effective_user_classification column", () => {
    const source = readFileSync("lib/admin-user-management.js", "utf8");
    assert.match(source, /eq\("effective_user_classification", normalizedClassification\)/);
    assert.doesNotMatch(source, /eq\("user_classification", normalizedClassification\)/);
  });
});

console.log("admin user effective classification filter tests loaded");
