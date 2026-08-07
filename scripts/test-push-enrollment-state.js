#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PUSH_ENROLLMENT,
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
