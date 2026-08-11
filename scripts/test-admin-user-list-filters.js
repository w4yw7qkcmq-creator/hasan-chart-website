#!/usr/bin/env node
/**
 * Admin user list filter contract tests.
 * Run: node --test scripts/test-admin-user-list-filters.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_USER_LIST_ALL_CAP } from "../lib/admin-user-list-response-helpers.js";
import {
  resolveLastLoginDateBounds,
  resolveRegistrationDateBounds,
} from "../lib/admin-user-registration-cohorts.js";
import {
  DEFAULT_ADMIN_USER_CLIENT_FILTERS,
  buildAdminUserListRequestParams,
  resolveServerActiveServiceFilter,
} from "../lib/admin-user-list-request.js";

describe("admin user list filter contract", () => {
  it("uses server pagination as primary contract", () => {
    const params = buildAdminUserListRequestParams({ page: 2, pageSize: 25 });
    assert.equal(params.listAll, false);
    assert.equal(params.page, 2);
    assert.equal(params.pageSize, 25);
  });

  it("maps cohort week to server registration bounds", () => {
    const params = buildAdminUserListRequestParams({
      registrationCohort: "week",
      clientFilters: DEFAULT_ADMIN_USER_CLIENT_FILTERS,
    });
    assert.ok(params.registeredFrom);
    assert.ok(params.registeredTo);
    assert.equal(params.listAll, false);
  });

  it("maps service filter to activeService server param", () => {
    assert.equal(
      resolveServerActiveServiceFilter({ ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, service: "vip" }),
      "vip"
    );
    assert.equal(
      buildAdminUserListRequestParams({
        clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, service: "vip" },
      }).activeService,
      "vip"
    );
  });

  it("maps plan and last-login filters to server params", () => {
    const params = buildAdminUserListRequestParams({
      clientFilters: {
        ...DEFAULT_ADMIN_USER_CLIENT_FILTERS,
        plan: "VIP Spot",
        lastLoginFrom: "2026-08-01",
        lastLoginTo: "2026-08-11",
      },
    });
    assert.equal(params.plan, "VIP Spot");
    assert.ok(params.lastLoginFrom);
    assert.ok(params.lastLoginTo);
  });

  it("composes week + search + status + service + plan + last-login", () => {
    const params = buildAdminUserListRequestParams({
      searchQuery: "user@test.com",
      accountStatusFilter: "active",
      registrationCohort: "week",
      clientFilters: {
        ...DEFAULT_ADMIN_USER_CLIENT_FILTERS,
        service: "vip",
        plan: "VIP Spot",
        lastLoginFrom: "2026-08-01",
        lastLoginTo: "2026-08-11",
      },
      effectiveAccountStatusFilter: "active",
    });

    assert.equal(params.search, "user@test.com");
    assert.equal(params.accountStatus, "active");
    assert.equal(params.activeService, "vip");
    assert.equal(params.plan, "VIP Spot");
    assert.ok(params.registeredFrom);
    assert.ok(params.lastLoginTo);
    assert.equal(params.listAll, false);
  });

  it("clear filters returns empty server bounds", () => {
    const registration = resolveRegistrationDateBounds({
      cohort: "",
      registeredFrom: "",
      registeredTo: "",
    });
    const lastLogin = resolveLastLoginDateBounds({ lastLoginFrom: "", lastLoginTo: "" });
    const params = buildAdminUserListRequestParams();

    assert.equal(registration.registeredFromIso, "");
    assert.equal(lastLogin.lastLoginFromIso, "");
    assert.equal(params.plan, "");
    assert.equal(params.activeService, "");
  });

  it("maps expired subscriptions to server activeService", () => {
    assert.equal(
      resolveServerActiveServiceFilter({
        ...DEFAULT_ADMIN_USER_CLIENT_FILTERS,
        subscriptionState: "expired",
        service: "all",
      }),
      "expired"
    );
  });

  it("listAll cap is export-only safety valve at 1000", () => {
    assert.equal(ADMIN_USER_LIST_ALL_CAP, 1000);
  });

  it("maps user classification filter to server param", () => {
    const params = buildAdminUserListRequestParams({
      clientFilters: {
        ...DEFAULT_ADMIN_USER_CLIENT_FILTERS,
        userClassification: "real",
      },
    });
    assert.equal(params.userClassification, "real");
  });

  it("composes search + classification + cohort", () => {
    const params = buildAdminUserListRequestParams({
      searchQuery: "ahmad",
      registrationCohort: "month",
      clientFilters: {
        ...DEFAULT_ADMIN_USER_CLIENT_FILTERS,
        userClassification: "test",
      },
    });
    assert.equal(params.search, "ahmad");
    assert.equal(params.userClassification, "test");
    assert.ok(params.registeredFrom);
  });

  it("pagination retains active filters via stable request params", () => {
    const base = buildAdminUserListRequestParams({
      page: 1,
      registrationCohort: "month",
      clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, service: "alerts" },
    });
    const nextPage = buildAdminUserListRequestParams({
      page: 2,
      registrationCohort: "month",
      clientFilters: { ...DEFAULT_ADMIN_USER_CLIENT_FILTERS, service: "alerts" },
    });

    assert.equal(base.activeService, nextPage.activeService);
    assert.equal(base.registeredFrom, nextPage.registeredFrom);
    assert.equal(base.registeredTo, nextPage.registeredTo);
    assert.notEqual(base.page, nextPage.page);
  });
});

console.log("Admin user list filter tests loaded");
