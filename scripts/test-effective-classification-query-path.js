#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("effective classification query path", () => {
  it("filters on effective_user_classification column in shared SQL filters", () => {
    const source = readFileSync("lib/admin-user-management.js", "utf8");
    assert.match(source, /eq\("effective_user_classification", normalizedClassification\)/);
  });

  it("does not use O(n) batch scan path in loadAdminUserList", () => {
    const source = readFileSync("lib/admin-user-management.js", "utf8");
    assert.doesNotMatch(source, /loadAdminUserListWithEffectiveClassification/);
    assert.doesNotMatch(source, /collectProfilesMatchingEffectiveClassification/);
  });

  it("list profile columns include effective read-model fields", () => {
    const source = readFileSync("lib/admin-user-list-response-helpers.js", "utf8");
    assert.match(source, /effective_user_classification/);
  });
});

console.log("effective classification query path tests loaded");
