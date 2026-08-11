#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("CRM navigation uses Link prefetch not drawer backdrop", () => {
  const source = readFileSync("app/(app)/admin/components/admin-users/AdminUsersTable.js", "utf8");
  assert.match(source, /prefetch/);
  assert.match(source, /\/admin\/users\//);
  assert.doesNotMatch(source, /admin-user-drawer__backdrop/);
  assert.match(source, /جارٍ الفتح/);
});

test("preview overlay uses light backdrop", () => {
  const theme = readFileSync("app/(app)/admin/admin-theme.css", "utf8");
  assert.match(theme, /\.admin-user-preview-overlay__backdrop[\s\S]*rgba\(15, 23, 42, 0\.12\)/);
});

test("AdminAccessGate keeps admin children during in-admin loading", () => {
  const gate = readFileSync("app/components/AdminAccessGate.js", "utf8");
  assert.match(gate, /adminSessionEstablishedRef/);
  assert.match(gate, /return children/);
});

console.log("admin user CRM navigation tests scheduled");
