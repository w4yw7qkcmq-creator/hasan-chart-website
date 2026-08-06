#!/usr/bin/env node
import assert from "node:assert/strict";

const BASE = process.env.DESIGN_SYSTEM_TEST_BASE_URL || "http://127.0.0.1:3099";

const TARGETS = [
  "/design-system-fixture",
  "/",
  "/order-book",
  "/login",
  "/admin",
  "/admin/financial-center",
];

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("test-runtime-accessibility: SKIP (playwright not installed)");
  process.exit(0);
}

let accessibilityRuntimeFailures = 0;

const browser = await chromium.launch({ headless: true });

async function audit(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(600);

  const results = await page.evaluate(() => {
    const issues = [];
    const ids = new Map();
    document.querySelectorAll("[id]").forEach((el) => {
      const id = el.id;
      ids.set(id, (ids.get(id) || 0) + 1);
    });
    for (const [id, count] of ids) {
      if (count > 1) issues.push(`duplicate id: ${id} (${count})`);
    }

    document.querySelectorAll("button, [role='button']").forEach((el) => {
      const name =
        el.getAttribute("aria-label") ||
        el.textContent?.trim() ||
        el.getAttribute("title") ||
        "";
      if (!name) issues.push("button without accessible name");
    });

    document.querySelectorAll("input, textarea, select").forEach((el) => {
      const id = el.id;
      const labelled =
        (id && document.querySelector(`label[for="${id}"]`)) ||
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby");
      if (!labelled && !el.closest("[role='dialog']")) {
        issues.push(`input without label: ${el.tagName}`);
      }
    });

    document.querySelectorAll("[aria-hidden='true']").forEach((el) => {
      const focusable = el.querySelector("a, button, input, select, textarea, [tabindex]");
      if (focusable) issues.push("focusable element inside aria-hidden");
    });

    document.querySelectorAll("[role='dialog']").forEach((el) => {
      if (el.getAttribute("aria-modal") !== "true") {
        issues.push("dialog missing aria-modal=true");
      }
    });

    return issues.slice(0, 20);
  });

  if (results.length) {
    accessibilityRuntimeFailures += results.length;
    console.error(`a11y ${route}:`, results);
  }
}

for (const route of TARGETS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await audit(page, route);
  await page.close();
}

await browser.close();

assert.equal(accessibilityRuntimeFailures, 0, `accessibilityRuntimeFailures=${accessibilityRuntimeFailures}`);
console.log(`test-runtime-accessibility: PASS targets=${TARGETS.length} accessibilityRuntimeFailures=0`);
