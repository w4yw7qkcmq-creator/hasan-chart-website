#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  UNSAFE_UI_PATTERNS,
  FINANCIAL_CHART_ALLOWLIST,
  ui,
} from "../app/components/ui/ui-theme.js";

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, "app");
const UI_ROOT = join(APP_ROOT, "components/ui");
const DESIGN_CSS = join(APP_ROOT, "design-system/design-system-theme.css");
const GLOBALS_CSS = join(APP_ROOT, "globals.css");
const ALLOWLIST_PATH = join(ROOT, "scripts/design-system-legacy-allowlist.json");

const SCAN_DIRS = [
  join(APP_ROOT, "components"),
  join(APP_ROOT, "(app)"),
  join(APP_ROOT, "(public)"),
];

let passed = 0;

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function listJsFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      listJsFiles(abs, acc);
      continue;
    }
    if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) acc.push(abs);
  }
  return acc;
}

function isFinancialChartException(content) {
  return FINANCIAL_CHART_ALLOWLIST.some((token) => content.includes(token));
}

function stripChartCanvasCommentLines(content) {
  return content
    .split("\n")
    .filter((line) => !/\/\/.*chart[- ]canvas|\/\*.*chart[- ]canvas/i.test(line))
    .join("\n");
}

function scanJsFile(relPath, content) {
  if (isFinancialChartException(content)) return [];
  const sanitized = stripChartCanvasCommentLines(content);
  const violations = [];
  const isUiPrimitive = relPath.startsWith("app/components/ui/");
  let patterns = UNSAFE_UI_PATTERNS;
  if (isUiPrimitive) {
    patterns = patterns.filter((pattern) => String(pattern) !== String(/<select[\s>]/));
  }
  for (const pattern of patterns) {
    if (pattern.test(sanitized)) {
      violations.push(`${relPath}: matched ${pattern}`);
    }
  }
  return violations;
}

function scanCssFile(relPath, content) {
  const violations = [];
  if (/\[class\*="/.test(content)) violations.push(`${relPath}: [class*="..."]`);
  return violations;
}

function getChangedUiPaths() {
  try {
    const out = execSync("git diff --name-only HEAD && git diff --cached --name-only HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    });
    return [...new Set(out.split("\n").filter(Boolean))].filter((p) =>
      /^app\/.*\.(js|jsx|ts|tsx|css)$/.test(p)
    );
  } catch {
    return [];
  }
}

const allowlist = readJson(ALLOWLIST_PATH, { exceptions: [] });
const legacyExceptionsCount = (allowlist.exceptions || []).length;
assert.equal(legacyExceptionsCount, 0, `legacy allowlist must be empty (${legacyExceptionsCount} exceptions)`);
passed += 1;

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
assert.doesNotMatch(css, /\[class\*="price"\]/);
assert.doesNotMatch(css, /\[class\*="market"\]/);
assert.doesNotMatch(css, /:has\(/);
passed += 7;

const uiIndex = readFileSync(join(UI_ROOT, "index.js"), "utf8");
assert.match(uiIndex, /UiButton/);
assert.match(uiIndex, /UiPageShell/);
assert.match(uiIndex, /UiModal/);
passed += 3;

assert.ok(ui.btnPrimary.includes("ui-btn"));
assert.ok(ui.pageShell.includes("ui-page-shell"));
passed += 2;

assert.ok(existsSync(join(ROOT, "templates/new-feature-page/page.js.template")));
assert.ok(existsSync(join(ROOT, "scripts/create-ui-page.mjs")));
passed += 2;

const shell = readFileSync(join(ROOT, "app/components/RootLayoutShell.js"), "utf8");
assert.match(shell, /site-shell-root/);
assert.match(shell, /site-sidebar-panel/);
assert.match(shell, /site-main-shell/);
assert.match(shell, /site-mobile-drawer-panel/);
passed += 4;

const violations = [];
const allJsFiles = [];
for (const dir of SCAN_DIRS) {
  listJsFiles(dir, allJsFiles);
}

for (const abs of allJsFiles) {
  const rel = relative(ROOT, abs);
  const content = readFileSync(abs, "utf8");
  violations.push(...scanJsFile(rel, content));
}

const strictCssTargets = [relative(ROOT, DESIGN_CSS), relative(ROOT, GLOBALS_CSS)];
for (const rel of strictCssTargets) {
  const content = readFileSync(join(ROOT, rel), "utf8");
  violations.push(...scanCssFile(rel, content));
}

const changed = getChangedUiPaths();
for (const rel of changed) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const content = readFileSync(abs, "utf8");
  if (rel.endsWith(".css")) {
    violations.push(...scanCssFile(rel, content));
  } else {
    violations.push(...scanJsFile(rel, content));
  }
}

const uniqueViolations = [...new Set(violations)];
assert.equal(uniqueViolations.length, 0, uniqueViolations.join("\n"));
passed += 1;

console.log(
  `test-design-system: PASS (${passed} checks, ${allJsFiles.length} js files scanned, legacyExceptionsCount=${legacyExceptionsCount})`
);
