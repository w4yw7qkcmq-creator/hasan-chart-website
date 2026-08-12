#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("effective classification sync contract", () => {
  it("migration defines trigger on profile classification fields", () => {
    const sql = readFileSync(
      "supabase/migrations/20260812103000_profiles_effective_user_classification_read_model.sql",
      "utf8"
    );
    assert.match(sql, /profiles_sync_effective_user_classification/);
    assert.match(sql, /user_classification_source/);
    assert.match(sql, /sync_profile_effective_user_classification/);
  });

  it("manual classification update writes admin_manual source", () => {
    const source = readFileSync("lib/user-classification-admin.js", "utf8");
    assert.match(source, /admin_manual/);
    assert.match(source, /user_classification_source/);
  });

  it("read model resolver mirrors JS authority order", () => {
    const sql = readFileSync(
      "supabase/migrations/20260812103000_profiles_effective_user_classification_read_model.sql",
      "utf8"
    );
    assert.match(sql, /admin_manual/);
    assert.match(sql, /backfill_high_confidence/);
    assert.match(sql, /compute_profile_classification_heuristic/);
  });
});

console.log("effective classification sync tests loaded");
