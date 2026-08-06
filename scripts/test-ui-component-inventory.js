#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  EXPORTED_COMPONENTS,
  INTERNAL_THROUGH_PARENT,
  SPEC_NOT_IMPLEMENTED,
} from "./lib/design-system-component-registry.js";

const ROOT = process.cwd();
const UI_DIR = join(ROOT, "app/components/ui");
const INDEX = join(UI_DIR, "index.js");

const indexSource = readFileSync(INDEX, "utf8");
const uiFiles = new Set(readdirSync(UI_DIR).filter((f) => f.endsWith(".js")));

let missingComponentCoverage = 0;
let unclassifiedComponents = 0;
const violations = [];

for (const component of EXPORTED_COMPONENTS) {
  if (!uiFiles.has(component.file)) {
    violations.push(`missing file for ${component.name}: ${component.file}`);
    missingComponentCoverage += 1;
    continue;
  }
  if (!indexSource.includes(component.name)) {
    violations.push(`${component.name} not exported from ui/index.js`);
    missingComponentCoverage += 1;
  }
}

for (const internal of INTERNAL_THROUGH_PARENT) {
  if (!uiFiles.has(internal.file)) {
    violations.push(`internal component file missing: ${internal.file}`);
    unclassifiedComponents += 1;
  } else if (!indexSource.includes(internal.name)) {
    violations.push(`${internal.name} should remain exported (used by ${internal.coveredBy})`);
  }
}

const classified = new Set([
  "index.js",
  "ui-theme.js",
  ...EXPORTED_COMPONENTS.map((c) => c.file),
  ...INTERNAL_THROUGH_PARENT.map((c) => c.file),
]);

for (const file of uiFiles) {
  if (!classified.has(file)) {
    violations.push(`unclassified ui file: ${file}`);
    unclassifiedComponents += 1;
  }
}

assert.equal(
  SPEC_NOT_IMPLEMENTED.length > 0,
  true,
  "spec-not-implemented registry required",
);

if (!existsSync(join(ROOT, "app/design-system-fixture/page.js"))) {
  violations.push("design-system-fixture/page.js missing");
  missingComponentCoverage += 1;
}

assert.equal(violations.length, 0, violations.join("\n"));
console.log(
  `test-ui-component-inventory: PASS (exported=${EXPORTED_COMPONENTS.length}, internal=${INTERNAL_THROUGH_PARENT.length}, specNotImplemented=${SPEC_NOT_IMPLEMENTED.length}, missingComponentCoverage=${missingComponentCoverage}, unclassifiedComponents=${unclassifiedComponents})`,
);
