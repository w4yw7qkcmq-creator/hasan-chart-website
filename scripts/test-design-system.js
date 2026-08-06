#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  UNSAFE_UI_PATTERNS,
  FINANCIAL_CHART_ALLOWLIST,
  LEGACY_UI_PATH_PREFIXES,
  ui,
} from "../app/components/ui/ui-theme.js";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "app");
const UI_ROOT = join(APP_ROOT, "components/ui");
const DESIGN_CSS = join(APP_ROOT, "design-system/design-system-theme.css");
const GLOBALS_CSS = join(APP_ROOT, "globals.css");
const ALLOWLIST_PATH = join(ROOT, "scripts/design-system-legacy-allowlist.json");

let passed = 0;

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function listUiFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      listUiFiles(abs, acc);
      continue;
    }
    if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) acc.push(abs);
  }
  return acc;
}

function isLegacyPath(relPath) {
  const extra = readJson(ALLOWLIST_PATH, { paths: [] }).paths || [];
  const all = [...LEGACY_UI_PATH_PREFIXES, ...extra];
  return all.some((prefix) => relPath === prefix || relPath.startsWith(prefix));
}

function isFinancialChartException(content) {
  return FINANCIAL_CHART_ALLOWLIST.some((token) => content.includes(token));
}

function getChangedUiPaths() {
  try {
    const out = execSync("git diff --name-only HEAD && git diff --cached --name-only HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    });
    return [...new Set(out.split("\n").filter(Boolean))].filter((p) =>
      /^app\/.*\.(js|jsx|ts|tsx)$/.test(p)
    );
  } catch {
    return [];
  }
}

const changed = getChangedUiPaths();

function scanFile(relPath, content) {
  if (isFinancialChartException(content)) return [];
  const violations = [];
  const isCss = relPath.endsWith(".css");
  const isUiPrimitive = relPath.startsWith("app/components/ui/");
  let patterns = isCss ? [/\[class\*="/] : UNSAFE_UI_PATTERNS;
  if (isUiPrimitive) {
    patterns = patterns.filter((pattern) => String(pattern) !== String(/<select[\s>]/));
  }
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      violations.push(`${relPath}: matched ${pattern}`);
    }
  }
  return violations;
}

// Foundation files exist
assert.ok(existsSync(DESIGN_CSS), "design-system-theme.css missing");
assert.ok(existsSync(join(UI_ROOT, "index.js")), "ui/index.js missing");
assert.ok(existsSync(join(UI_ROOT, "UiButton.js")), "UiButton missing");
assert.ok(existsSync(join(UI_ROOT, "UiPageShell.js")), "UiPageShell missing");
passed += 4;

const css = readFileSync(DESIGN_CSS, "utf8") + readFileSync(GLOBALS_CSS, "utf8");
assert.match(css, /--ui-surface:/);
assert.match(css, /--ui-text:/);
assert.match(css, /html\[data-theme="light"\][\s\S]*--ui-surface:/);
assert.match(css, /\.site-shell-root/);
assert.match(css, /\.site-sidebar-brand-card/);
assert.doesNotMatch(css, /\[class\*="sidebar"\]/);
passed += 5;

const uiIndex = readFileSync(join(UI_ROOT, "index.js"), "utf8");
assert.match(uiIndex, /UiButton/);
assert.match(uiIndex, /UiPageShell/);
assert.match(uiIndex, /UiModal/);
passed += 3;

assert.ok(ui.btnPrimary.includes("ui-btn"));
assert.ok(ui.pageShell.includes("ui-page-shell"));
passed += 2;

// Template + generator
assert.ok(existsSync(join(ROOT, "templates/new-feature-page/page.js.template")));
assert.ok(existsSync(join(ROOT, "scripts/create-ui-page.mjs")));
passed += 2;

// Scan design-system sources + changed non-legacy files only
const violations = [];
const strictTargets = [
  ...listUiFiles(UI_ROOT).map((abs) => relative(ROOT, abs)),
  relative(ROOT, DESIGN_CSS),
  ...changed.filter((rel) => !isLegacyPath(rel) && rel !== "app/components/RootLayoutShell.js"),
];

const shell = readFileSync(join(ROOT, "app/components/RootLayoutShell.js"), "utf8");
assert.match(shell, /site-shell-root/);
assert.match(shell, /site-sidebar-panel/);
assert.match(shell, /site-main-shell/);
assert.match(shell, /site-mobile-drawer-panel/);
passed += 4;

for (const rel of [...new Set(strictTargets)]) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const content = readFileSync(abs, "utf8");
  violations.push(...scanFile(rel, content));
}

// Changed new files under app/(app)/ must import design system when they are pages
for (const rel of changed) {
  if (!rel.startsWith("app/(app)/") || !rel.endsWith("/page.js")) continue;
  if (isLegacyPath(rel)) continue;
  const content = readFileSync(join(ROOT, rel), "utf8");
  assert.match(
    content,
    /UiPageShell|from "\.\.\/\.\.\/components\/ui"|from "@\/components\/ui"/,
    `${rel} must use UiPageShell from design system`
  );
  passed += 1;
}

assert.equal(violations.length, 0, violations.join("\n"));
passed += 1;

console.log(`test-design-system: PASS (${passed} checks, ${strictTargets.length} strict targets)`);
