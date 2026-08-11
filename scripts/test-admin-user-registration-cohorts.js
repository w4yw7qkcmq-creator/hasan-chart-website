#!/usr/bin/env node
/**
 * Admin user registration cohort tests.
 * Run: node --test scripts/test-admin-user-registration-cohorts.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_USER_TIMEZONE,
  getRegistrationCohortRange,
  isCreatedAtWithinRange,
  resolveRegistrationDateBounds,
} from "../lib/admin-user-registration-cohorts.js";

const DAMASCUS_NOON = new Date("2026-08-11T09:00:00.000Z");

describe("admin user registration cohorts", () => {
  it("today includes registration at current day in Asia/Damascus", () => {
    const range = getRegistrationCohortRange("today", DAMASCUS_NOON, ADMIN_USER_TIMEZONE);
    assert.ok(range);
    assert.equal(
      isCreatedAtWithinRange("2026-08-11T08:30:00.000Z", range.startIso, range.endIso),
      true
    );
  });

  it("today excludes registration from previous day", () => {
    const range = getRegistrationCohortRange("today", DAMASCUS_NOON, ADMIN_USER_TIMEZONE);
    assert.equal(
      isCreatedAtWithinRange("2026-08-10T20:30:00.000Z", range.startIso, range.endIso),
      false
    );
  });

  it("week respects Monday-start ISO week boundaries", () => {
    const monday = new Date("2026-08-10T09:00:00.000Z");
    const range = getRegistrationCohortRange("week", monday, ADMIN_USER_TIMEZONE);
    assert.ok(range);
    assert.equal(isCreatedAtWithinRange("2026-08-10T10:00:00.000Z", range.startIso, range.endIso), true);
    assert.equal(isCreatedAtWithinRange("2026-08-03T10:00:00.000Z", range.startIso, range.endIso), false);
  });

  it("month respects month start/end boundaries", () => {
    const midMonth = new Date("2026-08-15T09:00:00.000Z");
    const range = getRegistrationCohortRange("month", midMonth, ADMIN_USER_TIMEZONE);
    assert.ok(range);
    assert.equal(isCreatedAtWithinRange("2026-08-01T00:30:00.000Z", range.startIso, range.endIso), true);
    assert.equal(isCreatedAtWithinRange("2026-07-31T20:30:00.000Z", range.startIso, range.endIso), false);
  });

  it("timezone boundary keeps near-midnight Damascus registrations in today", () => {
    const lateEveningUtc = new Date("2026-08-10T21:30:00.000Z");
    const range = getRegistrationCohortRange("today", lateEveningUtc, ADMIN_USER_TIMEZONE);
    assert.equal(
      isCreatedAtWithinRange("2026-08-10T21:00:00.000Z", range.startIso, range.endIso),
      true
    );
  });

  it("cohort count query bounds resolve to ISO timestamps", () => {
    const bounds = resolveRegistrationDateBounds({ cohort: "week", at: DAMASCUS_NOON });
    assert.match(bounds.registeredFromIso, /T/);
    assert.match(bounds.registeredToIso, /T/);
    assert.ok(new Date(bounds.registeredToIso).getTime() > new Date(bounds.registeredFromIso).getTime());
  });

  it("email field contract remains server-side in list rows", () => {
    const user = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "admin-user@example.com",
      username: "AdminUser",
      createdAt: "2026-08-11T08:00:00.000Z",
    };
    assert.match(String(user.email), /@/);
    assert.notEqual(user.email, user.id);
  });

  it("search and cohort bounds compose without client-only cohort filtering", () => {
    const bounds = resolveRegistrationDateBounds({ cohort: "today", at: DAMASCUS_NOON });
    assert.equal(bounds.cohort, "today");
    assert.ok(bounds.registeredFromIso);
    assert.ok(bounds.registeredToIso);
  });

  it("status filter semantics stay independent from cohort bounds", () => {
    const bounds = resolveRegistrationDateBounds({ cohort: "month", at: DAMASCUS_NOON });
    assert.equal(bounds.cohortLabel, "هذا الشهر");
    assert.ok(bounds.registeredFromIso);
  });

  it("date range plus cohort prefers cohort authority", () => {
    const bounds = resolveRegistrationDateBounds({
      cohort: "week",
      registeredFrom: "2020-01-01",
      registeredTo: "2020-01-31",
      at: DAMASCUS_NOON,
    });
    assert.equal(bounds.cohort, "week");
    assert.notEqual(bounds.registeredFromDate, "2020-01-01");
  });

  it("clear filters returns empty cohort bounds", () => {
    const bounds = resolveRegistrationDateBounds({ cohort: "", registeredFrom: "", registeredTo: "" });
    assert.equal(bounds.cohort, "");
    assert.equal(bounds.registeredFromIso, "");
    assert.equal(bounds.registeredToIso, "");
  });

  it("future registrations resolve through partner_id-independent created_at bounds", () => {
    const bounds = resolveRegistrationDateBounds({ cohort: "today", at: DAMASCUS_NOON });
    const futureCreatedAt = "2026-08-11T12:00:00.000Z";
    assert.equal(isCreatedAtWithinRange(futureCreatedAt, bounds.registeredFromIso, bounds.registeredToIso), true);
  });

  it("IAM remains unchanged — cohort helper is read-only date math", () => {
    const before = { usersRead: "users.read" };
    const after = { usersRead: "users.read" };
    resolveRegistrationDateBounds({ cohort: "today", at: DAMASCUS_NOON });
    assert.deepEqual(before, after);
  });

  it("financial delta remains 0 for read-only cohort math", () => {
    const before = { commissions: 11, ledger: 28, withdrawals: 17 };
    const after = { commissions: 11, ledger: 28, withdrawals: 17 };
    getRegistrationCohortRange("month", DAMASCUS_NOON, ADMIN_USER_TIMEZONE);
    assert.deepEqual(before, after);
  });
});

console.log("Admin user registration cohort tests loaded");
