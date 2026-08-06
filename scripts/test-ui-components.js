#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const UI_DIR = join(ROOT, "app/components/ui");

const REQUIRED_EXPORTS = [
  "UiButton.js",
  "UiInput.js",
  "UiSelect.js",
  "UiCard.js",
  "UiBadge.js",
  "UiAlert.js",
  "UiPageShell.js",
  "UiPageHeader.js",
  "UiModal.js",
  "UiPortal.js",
  "UiStates.js",
  "ui-theme.js",
  "index.js",
];

let passed = 0;
const missing = [];

for (const file of REQUIRED_EXPORTS) {
  const abs = join(UI_DIR, file);
  if (existsSync(abs)) {
    passed += 1;
  } else {
    missing.push(file);
  }
}

const uiFiles = readdirSync(UI_DIR).filter((name) => /^Ui[A-Z].*\.js$/.test(name));
assert.ok(uiFiles.length >= 10, `expected Ui* components, found ${uiFiles.length}`);
passed += 1;

assert.equal(missing.length, 0, `missing ui files: ${missing.join(", ")}`);
passed += 1;

console.log(`test-ui-components: PASS (${passed} checks, ${uiFiles.length} Ui* files)`);
