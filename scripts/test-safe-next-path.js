#!/usr/bin/env node
import assert from "node:assert/strict";
import { getSafeNextPath } from "../lib/safe-next-path.js";

const blocked = [
  null,
  undefined,
  "",
  "evil.com",
  "//evil.com",
  "/\\evil.com",
  "https://evil.com",
  "http://evil.com",
  "javascript:alert(1)",
  "/%2F%2Fevil.com",
  "/%5Cevil.com",
  "/foo@evil.com",
];

for (const value of blocked) {
  assert.equal(getSafeNextPath(value), null, `expected block: ${JSON.stringify(value)}`);
}

assert.equal(getSafeNextPath(" /\\evil.com"), null, "leading space + backslash bypass");

const allowed = ["/dashboard", "/admin", "/news/123", "/path/with spaces", "/evil.com"];

for (const value of allowed) {
  assert.equal(getSafeNextPath(value), value, `expected allow: ${value}`);
}

console.log("safe-next-path tests passed");
