#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PUSH_ENROLLMENT,
  pushEnrollmentCompactUi,
  pushEnrollmentLabelsAr,
  resolvePushEnrollmentFromBrowserState,
} from "../lib/push-enrollment-state.js";

test("enrollment: granted without subscription => needs reenable", () => {
  assert.equal(
    resolvePushEnrollmentFromBrowserState({
      permission: "granted",
      hasSubscription: false,
    }),
    PUSH_ENROLLMENT.NEEDS_REENABLE
  );

  const labels = pushEnrollmentLabelsAr(PUSH_ENROLLMENT.NEEDS_REENABLE);
  assert.match(labels.label, /إعادة تفعيل/);
  assert.equal(labels.active, false);
  assert.equal(labels.needsReenable, true);
});

test("enrollment: granted with subscription => enrolled", () => {
  assert.equal(
    resolvePushEnrollmentFromBrowserState({
      permission: "granted",
      hasSubscription: true,
    }),
    PUSH_ENROLLMENT.ENROLLED
  );

  const labels = pushEnrollmentLabelsAr(PUSH_ENROLLMENT.ENROLLED);
  assert.equal(labels.active, true);
  assert.equal(labels.needsReenable, false);
});

test("enrollment: permission alone must not show active", () => {
  const labels = pushEnrollmentLabelsAr(
    resolvePushEnrollmentFromBrowserState({
      permission: "granted",
      hasSubscription: false,
    })
  );
  assert.equal(labels.active, false);
});

test("compact ui: enrolled shows green check", () => {
  const ui = pushEnrollmentCompactUi(PUSH_ENROLLMENT.ENROLLED);
  assert.equal(ui.badge, "success");
  assert.equal(ui.badgeSymbol, "✓");
  assert.equal(ui.active, true);
  assert.equal(ui.disabled, false);
});

test("compact ui: needs reenable shows warning badge", () => {
  const ui = pushEnrollmentCompactUi(PUSH_ENROLLMENT.NEEDS_REENABLE);
  assert.equal(ui.badge, "warning");
  assert.equal(ui.badgeSymbol, "!");
  assert.equal(ui.active, false);
  assert.match(ui.title, /إعادة تفعيل/);
});

test("compact ui: denied shows blocked badge", () => {
  const ui = pushEnrollmentCompactUi(PUSH_ENROLLMENT.DENIED);
  assert.equal(ui.badge, "blocked");
  assert.equal(ui.badgeSymbol, "×");
  assert.match(ui.title, /محظورة/);
});

test("compact ui: prompt shows enable state not active", () => {
  const ui = pushEnrollmentCompactUi(PUSH_ENROLLMENT.PROMPT);
  assert.equal(ui.badge, "blocked");
  assert.equal(ui.active, false);
});

test("compact ui: unsupported is disabled", () => {
  const ui = pushEnrollmentCompactUi(PUSH_ENROLLMENT.UNSUPPORTED);
  assert.equal(ui.disabled, true);
  assert.equal(ui.badge, null);
});

test("compact ui: checking shows spinner state", () => {
  const ui = pushEnrollmentCompactUi(PUSH_ENROLLMENT.ENROLLED, { checking: true });
  assert.equal(ui.variant, "checking");
  assert.equal(ui.disabled, true);
  assert.equal(ui.active, false);
});
