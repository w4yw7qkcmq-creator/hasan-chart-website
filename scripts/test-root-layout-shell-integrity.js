#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const shellPath = join(root, "app/components/RootLayoutShell.js");
const shell = readFileSync(shellPath, "utf8");

const MAX_LINE_LENGTH = 1000;

test("RootLayoutShell has main return paths", () => {
  assert.match(shell, /if \(isAuthPage\)\s*\{[\s\S]*return\s*\(/);
  assert.match(
    shell,
    /return\s*\([\s\S]*(?:site-sidebar-brand|site-sidebar-brand-card|min-h-screen lg:flex)/
  );
  assert.match(shell, /<aside[\s\S]*<header/);
  assert.match(shell, /\{children\}/);
  assert.doesNotMatch(shell, /}\);\s*\/\/[\s\S]*useEffect\(/);
});

test("RootLayoutShell has no abnormally long lines", () => {
  const longLines = shell
    .split("\n")
    .map((line, index) => ({ line, index: index + 1, length: line.length }))
    .filter((entry) => entry.length > MAX_LINE_LENGTH);
  assert.equal(
    longLines.length,
    0,
    `long lines: ${longLines.map((e) => `${e.index}:${e.length}`).join(", ")}`
  );
});

test("RootLayoutShell does not comment-swallow function tail", () => {
  assert.doesNotMatch(
    shell,
    /\/\/[^\n]*useEffect\(\(\)\s*=>\s*\{[^\n]*logoutAndRedirect/
  );
});

console.log("test-root-layout-shell-integrity: all tests registered");
