#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARTNER_CENTER_MIGRATION_VERSIONS,
  STAGING_ONLY_VERSION,
  evaluateMigrationHistoryGuard,
} from "./partner-center/verify-production-migration-history.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../lib/staging-env-guard.js";

const CLEAN_PROBE = {
  history_20260822: false,
  artifacts: [],
  artifact_count: 0,
  staging_flags_table: false,
  staging_purge_fn: false,
};

test("production aligned remote history passes", () => {
  const report = evaluateMigrationHistoryGuard({
    linkedRef: PRODUCTION_SUPABASE_PROJECT_REF,
    localVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    remoteVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    requireProduction: true,
    stagingProbe: CLEAN_PROBE,
  });
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
});

test("simulated missing remote version fails", () => {
  const report = evaluateMigrationHistoryGuard({
    linkedRef: PRODUCTION_SUPABASE_PROJECT_REF,
    localVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    remoteVersions: PARTNER_CENTER_MIGRATION_VERSIONS.filter((v) => v !== "20260820"),
    requireProduction: true,
    stagingProbe: CLEAN_PROBE,
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(","), /missing_remote_history:20260820/);
});

test("wrong linked project fails", () => {
  const report = evaluateMigrationHistoryGuard({
    linkedRef: STAGING_SUPABASE_PROJECT_REF,
    localVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    remoteVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    requireProduction: true,
    stagingProbe: CLEAN_PROBE,
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(","), /wrong_linked_project/);
});

test("staging-only 20260822 excluded from expected production list", () => {
  assert.equal(PARTNER_CENTER_MIGRATION_VERSIONS.includes(STAGING_ONLY_VERSION), false);
  assert.equal(PARTNER_CENTER_MIGRATION_VERSIONS.at(-1), "20260821");
});

test("staging artifact table in production fails guard", () => {
  const report = evaluateMigrationHistoryGuard({
    linkedRef: PRODUCTION_SUPABASE_PROJECT_REF,
    localVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    remoteVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    requireProduction: true,
    stagingProbe: {
      history_20260822: false,
      artifacts: [{ kind: "table", name: "partner_center_staging_test_flags" }],
      artifact_count: 1,
      staging_flags_table: true,
      staging_purge_fn: false,
    },
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(","), /staging_artifacts_present_in_production/);
  assert.match(report.errors.join(","), /staging_test_flags_table_present_in_production/);
});

test("staging test_fail function in production fails guard", () => {
  const report = evaluateMigrationHistoryGuard({
    linkedRef: PRODUCTION_SUPABASE_PROJECT_REF,
    localVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    remoteVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    requireProduction: true,
    stagingProbe: {
      history_20260822: false,
      artifacts: [{ kind: "function", name: "create_partner_commission_atomic_test_fail(p_fail_after text)" }],
      artifact_count: 1,
      staging_flags_table: false,
      staging_purge_fn: false,
    },
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(","), /staging_artifacts_present_in_production/);
});

test("20260822 in remote history fails guard", () => {
  const report = evaluateMigrationHistoryGuard({
    linkedRef: PRODUCTION_SUPABASE_PROJECT_REF,
    localVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    remoteVersions: [...PARTNER_CENTER_MIGRATION_VERSIONS, STAGING_ONLY_VERSION],
    requireProduction: true,
    stagingProbe: CLEAN_PROBE,
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(","), /staging_version_in_history:20260822/);
});

test("clean production catalog passes guard", () => {
  const report = evaluateMigrationHistoryGuard({
    linkedRef: PRODUCTION_SUPABASE_PROJECT_REF,
    localVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    remoteVersions: PARTNER_CENTER_MIGRATION_VERSIONS,
    requireProduction: true,
    stagingProbe: CLEAN_PROBE,
  });
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
});

console.log("Partner migration history guard unit tests loaded");
