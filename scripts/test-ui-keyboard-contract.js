#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const UI = join(ROOT, "app/components/ui");

const COMPONENTS = [
  {
    file: "UiButton.js",
    checks: [{ label: "focus-visible", pattern: /focus-visible|ui\.focusRing/ }],
  },
  {
    file: "UiSelect.js",
    checks: [{ label: "focus-visible", pattern: /focus-visible|ui\.focusRing/ }],
  },
  {
    file: "UiModal.js",
    checks: [
      { label: "focus-visible or focusRing", pattern: /focus-visible|focusRing|ui\.focusRing/ },
      { label: "Escape handler", pattern: /Escape|keydown|useEffect[\s\S]*Escape/ },
    ],
  },
];

let passed = 0;
const violations = [];

for (const { file, checks } of COMPONENTS) {
  const abs = join(UI, file);
  const source = readFileSync(abs, "utf8");
  for (const check of checks) {
    if (check.pattern.test(source)) {
      passed += 1;
    } else {
      violations.push(`${file}: missing ${check.label}`);
    }
  }
}

assert.equal(violations.length, 0, violations.join("\n"));
passed += 1;

console.log(`test-ui-keyboard-contract: PASS (${passed} checks)`);
