#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("effective classification KPI aggregation", () => {
  it("dashboard stats loads grouped effective counts via RPC helper", () => {
    const source = readFileSync("lib/admin-user-dashboard-stats.js", "utf8");
    assert.match(source, /loadEffectiveClassificationCounts/);
    assert.match(source, /effectiveClassificationCounts/);
  });

  it("fetchDashboardStats prefers RPC counts when available", () => {
    const source = readFileSync("app/(app)/admin/components/admin-user-management-ux-helpers.js", "utf8");
    assert.match(source, /effectiveClassificationCounts/);
    assert.match(source, /effectiveCounts\?\.real/);
  });

  it("migration defines admin_profiles_effective_classification_counts RPC", () => {
    const sql = readFileSync(
      "supabase/migrations/20260812103000_profiles_effective_user_classification_read_model.sql",
      "utf8"
    );
    assert.match(sql, /admin_profiles_effective_classification_counts/);
    assert.match(sql, /GROUP BY effective_user_classification/);
  });
});

console.log("effective classification KPI aggregation tests loaded");
