#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { EXPORTED_COMPONENTS } from "./lib/design-system-component-registry.js";

const ROOT = process.cwd();
const FIXTURE = join(ROOT, "app/design-system-fixture/page.js");
const LAYOUT = join(ROOT, "app/design-system-fixture/layout.js");

assert.ok(existsSync(FIXTURE), "fixture page missing");
assert.ok(existsSync(LAYOUT), "fixture layout missing");

const fixture = readFileSync(FIXTURE, "utf8");
const layout = readFileSync(LAYOUT, "utf8");

assert.match(layout, /ALLOW_DESIGN_SYSTEM_FIXTURE/);
assert.match(layout, /dir="rtl"/);

const missing = [];
for (const component of EXPORTED_COMPONENTS) {
  if (!component.fixtureTestId) continue;
  const pattern = new RegExp(`data-testid="${component.fixtureTestId}"`);
  if (!pattern.test(fixture)) {
    missing.push(`${component.name} missing data-testid=${component.fixtureTestId}`);
  }
  if (!fixture.includes(component.name)) {
    missing.push(`${component.name} not referenced in fixture`);
  }
}

assert.equal(missing.length, 0, missing.join("\n"));
console.log(
  `test-design-system-fixture-coverage: PASS (${EXPORTED_COMPONENTS.length} exported components covered, missingComponentCoverage=0)`,
);
