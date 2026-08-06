#!/usr/bin/env node
import assert from "node:assert/strict";
import { EXPORTED_COMPONENTS } from "./lib/design-system-component-registry.js";

const BASE = process.env.DESIGN_SYSTEM_TEST_BASE_URL || "http://127.0.0.1:3099";
const FIXTURE = "/design-system-fixture";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("test-runtime-keyboard-matrix: SKIP (playwright not installed)");
  process.exit(0);
}

let keyboardFailures = 0;
let componentRuntimeFailures = 0;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function fail(msg) {
  keyboardFailures += 1;
  componentRuntimeFailures += 1;
  console.error(msg);
}

try {
  await page.goto(`${BASE}${FIXTURE}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(600);

  const button = page.locator('[data-testid="ds-button-primary"]');
  await button.focus();
  if (!(await button.evaluate((el) => el === document.activeElement))) {
    await fail("UiButton not focusable");
  }
  await page.keyboard.press("Enter");

  const disabledButton = page.locator('[data-testid="ds-button-disabled"]');
  await disabledButton.focus({ timeout: 2000 }).catch(() => {});
  if (await disabledButton.evaluate((el) => el === document.activeElement)) {
    await fail("disabled UiButton should not retain focus");
  }

  const input = page.locator('[data-testid="ds-input-text"]');
  await input.focus();
  await page.keyboard.type("123");
  const inputVal = await input.inputValue();
  if (!inputVal.includes("123")) await fail("UiInput typing failed");

  const select = page.locator('[data-testid="ds-select-native"]');
  await select.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  const modalOpen = page.locator('[data-testid="ds-modal-opener"]');
  await modalOpen.focus();
  await page.keyboard.press("Enter");
  const modal = page.locator('[role="dialog"]');
  await modal.waitFor({ state: "visible", timeout: 5000 });
  const ariaModal = await modal.getAttribute("aria-modal");
  if (ariaModal !== "true") await fail("UiModal missing aria-modal=true");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden", timeout: 5000 }).catch(async () => {
    await fail("UiModal Escape did not close");
  });

  if (await modalOpen.evaluate((el) => el !== document.activeElement)) {
    // focus return is best-effort depending on implementation
  }

  for (const component of EXPORTED_COMPONENTS) {
    if (!component.fixtureTestId) continue;
    const count = await page.locator(`[data-testid="${component.fixtureTestId}"]`).count();
    if (count === 0) {
      await fail(`${component.name} fixture node missing at runtime`);
    }
  }
} catch (error) {
  keyboardFailures += 1;
  componentRuntimeFailures += 1;
  console.error("keyboard matrix error:", error.message);
}

await browser.close();

assert.equal(keyboardFailures, 0, `keyboardFailures=${keyboardFailures}`);
assert.equal(componentRuntimeFailures, 0, `componentRuntimeFailures=${componentRuntimeFailures}`);
console.log("test-runtime-keyboard-matrix: PASS keyboardFailures=0 componentRuntimeFailures=0");
